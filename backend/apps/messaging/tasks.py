from celery import shared_task
from .models import Attachment, Message
from utils.minio import get_s3
from utils.security import scan_file_for_virus
from django.conf import settings
from django.utils import timezone
from datetime import timedelta
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

        is_zip = (attachment.original_name or "").lower().endswith(".zip")

        if attachment.file_type not in ["image", "file"] or is_zip:
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


@shared_task
def auto_delete_expired_messages():
    """
    Periodic task (see CELERY_BEAT_SCHEDULE in config/settings.py): for every
    conversation with auto_delete_seconds set, soft-deletes messages older
    than that threshold — same soft-delete shape as a manual delete
    (ChatConsumer.delete_message) so clients render it identically.
    """
    from apps.conversations.models import Conversation

    channel_layer = get_channel_layer()
    now = timezone.now()

    conversations = Conversation.objects.filter(
        auto_delete_seconds__isnull=False
    ).exclude(auto_delete_seconds=0)

    for conversation in conversations:
        cutoff = now - timedelta(seconds=conversation.auto_delete_seconds)

        expired = Message.objects.filter(
            conversation=conversation,
            is_deleted=False,
            created_at__lt=cutoff,
        )

        for message in expired:
            message.replies.update(reply_to=None)
            message.reactions.all().delete()
            message.is_deleted = True
            message.content = ""
            message.save(update_fields=["is_deleted", "content"])

            try:
                async_to_sync(channel_layer.group_send)(
                    f"chat_{conversation.id}",
                    {
                        "type": "message_deleted",
                        "message_id": message.id,
                    }
                )
            except Exception as e:
                logger.error(f"Auto-delete WebSocket error: {e}")


@shared_task
def publish_scheduled_messages():
    """Periodic task (see CELERY_BEAT_SCHEDULE): fires any "send later"
    message whose time has arrived — flips off scheduled_at, stamps
    created_at to the real send time (so it sorts correctly among messages
    sent around it), then broadcasts + notifies exactly like a live send."""
    from .services import _publish_message  # local import — services.py imports this module

    now = timezone.now()
    due = Message.objects.filter(
        scheduled_at__isnull=False,
        scheduled_at__lte=now,
        is_deleted=False,
    )

    for message in due:
        message.scheduled_at = None
        message.created_at = now
        message.save(update_fields=["scheduled_at", "created_at"])
        _publish_message(message)