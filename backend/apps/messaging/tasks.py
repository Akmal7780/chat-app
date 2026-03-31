from celery import shared_task
from .models import Attachment
from utils.minio import get_s3
from utils.security import scan_file_for_virus
from django.conf import settings
import io
import logging

from botocore.exceptions import ClientError
from channels.layers import get_channel_layer
from asgiref.sync import async_to_sync

logger = logging.getLogger(__name__)


@shared_task(bind=True, autoretry_for=(Exception,), retry_backoff=5, retry_kwargs={'max_retries': 3})
def scan_file_task(self, attachment_id):
    try:

        try:
            attachment = Attachment.objects.get(id=attachment_id)
        except Attachment.DoesNotExist:
            return

        if attachment.file_type not in ["image", "file"]:
            attachment.scan_status = "clean"
            attachment.save(update_fields=["scan_status"])
            return

        s3 = get_s3()

        try:
            file_obj = s3.get_object(
                Bucket=settings.AWS_STORAGE_BUCKET_NAME,
                Key=str(attachment.file)
            )
        except ClientError:
            return

        file_stream = file_obj["Body"]

        try:
            chunks = []
            for chunk in file_stream.iter_chunks(chunk_size=1024 * 1024):
                chunks.append(chunk)

            file = io.BytesIO(b"".join(chunks))
        finally:
            file_stream.close()

        is_infected = scan_file_for_virus(file)

        if is_infected:
            attachment.scan_status = "infected"

            try:
                s3.delete_object(
                    Bucket=settings.AWS_STORAGE_BUCKET_NAME,
                    Key=str(attachment.file)
                )
            except ClientError:
                pass

            try:
                channel_layer = get_channel_layer()

                async_to_sync(channel_layer.group_send)(
                    f"chat_{attachment.message.conversation_id}",
                    {
                        "type": "file_infected",
                        "message_id": attachment.message.id,
                    }
                )
            except Exception as e:
                logger.error(f"WebSocket error: {e}")

            attachment.scan_status = "infected"
            attachment.file = ""   
            attachment.save(update_fields=["scan_status", "file"])

            return

        else:
            attachment.scan_status = "clean"

        attachment.save(update_fields=["scan_status"])

    except Exception as e:
        logger.error(f"Scan error: {e}")
        raise