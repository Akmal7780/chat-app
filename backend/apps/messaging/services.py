import os
import uuid

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.conf import settings
from rest_framework.exceptions import PermissionDenied, ValidationError

from apps.conversations.models import ConversationParticipant
from apps.notifications.services import notify_conversation_participants
from utils.files import get_file_type
from utils.minio import get_s3

from .models import Attachment, Message, Reaction
from .serializers import MessageSerializer, ReactionSerializer
from .tasks import scan_file_task


def _require_participant(user, conversation_id):
    is_participant = ConversationParticipant.objects.filter(
        conversation_id=conversation_id,
        user=user,
    ).exists()
    if not is_participant:
        raise PermissionDenied("Not allowed")


def _require_own_key(user, key):
    if not key or not key.startswith(f"users/{user.id}/"):
        raise PermissionDenied("Invalid file path")


def initiate_upload(user, conversation_id, file_name):
    _require_participant(user, conversation_id)

    key = f"users/{user.id}/conversations/{conversation_id}/{uuid.uuid4()}_{file_name}"

    s3 = get_s3()
    res = s3.create_multipart_upload(
        Bucket=settings.AWS_STORAGE_BUCKET_NAME,
        Key=key,
    )

    return {"upload_id": res["UploadId"], "key": key}


def upload_part(user, key, upload_id, part_number, file):
    _require_own_key(user, key)

    if not (0 < part_number <= 1000):
        raise ValidationError("Invalid part number range")

    safe_name = os.path.basename(file.name)
    if len(safe_name) > 255:
        raise ValidationError("Filename too long")

    MAX_CHUNK_SIZE = 5 * 1024 * 1024  # 5MB
    if file.size > MAX_CHUNK_SIZE:
        raise ValidationError("Chunk too large")

    s3 = get_s3()
    res = s3.upload_part(
        Bucket=settings.AWS_STORAGE_BUCKET_NAME,
        Key=key,
        UploadId=upload_id,
        PartNumber=part_number,
        Body=file,
    )
    return res["ETag"].replace('"', "")


def complete_upload(user, request, *, conversation_id, file_name, key, upload_id, parts, size, message_type=None):
    _require_participant(user, conversation_id)
    _require_own_key(user, key)

    s3 = get_s3()
    s3.complete_multipart_upload(
        Bucket=settings.AWS_STORAGE_BUCKET_NAME,
        Key=key,
        UploadId=upload_id,
        MultipartUpload={"Parts": parts},
    )

    allowed_overrides = {choice for choice, _ in Message.MESSAGE_TYPES}
    if message_type in allowed_overrides:
        file_type = message_type
    else:
        file_type = get_file_type(file_name) or "file"

    message = Message.objects.create(
        conversation_id=conversation_id,
        sender=user,
        message_type=file_type,
    )

    attachment = Attachment.objects.create(
        message=message,
        file=key,
        file_type=file_type,
        file_size=size,
        original_name=file_name,
        scan_status="pending",
    )

    channel_layer = get_channel_layer()
    async_to_sync(channel_layer.group_send)(
        f"chat_{message.conversation_id}",
        {
            "type": "message",
            "message": MessageSerializer(message, context={"request": request}).data,
        },
    )
    notify_conversation_participants(message)
    scan_file_task.delay(attachment.id)

    return message


def delete_attachment(user, attachment_id):
    try:
        attachment = Attachment.objects.get(id=attachment_id)
    except Attachment.DoesNotExist:
        return False

    if attachment.message.sender != user:
        raise PermissionDenied("Not allowed")

    s3 = get_s3()
    s3.delete_object(
        Bucket=settings.AWS_STORAGE_BUCKET_NAME,
        Key=attachment.file,
    )
    attachment.delete()
    return True


def toggle_reaction(user, message, emoji):
    if message.sender == user:
        raise ValidationError("Cannot react to your own message")

    if not emoji or emoji in ["undefined", "null", ""]:
        raise ValidationError("Valid emoji is required")

    channel_layer = get_channel_layer()

    old_reaction = Reaction.objects.filter(message=message, user=user).first()

    if old_reaction:
        old_emoji = old_reaction.emoji
        old_reaction.delete()

        async_to_sync(channel_layer.group_send)(
            f"chat_{message.conversation_id}",
            {
                "type": "reaction",
                "action": "removed",
                "message_id": message.id,
                "user_id": user.id,
                "emoji": old_emoji,
            },
        )

        if old_emoji == emoji:
            return {"removed": True}

    reaction = Reaction.objects.create(message=message, user=user, emoji=emoji)
    reaction_data = ReactionSerializer(reaction).data

    async_to_sync(channel_layer.group_send)(
        f"chat_{message.conversation_id}",
        {
            "type": "reaction",
            "action": "added",
            "message_id": message.id,
            "user_id": user.id,
            "reaction": reaction_data,
        },
    )

    return reaction_data


def log_call(user, request, *, conversation_id, call_status, is_video, duration_seconds=None):
    _require_participant(user, conversation_id)

    valid_statuses = {choice for choice, _ in Message.CALL_STATUSES}
    if call_status not in valid_statuses:
        raise ValidationError("Invalid call_status")

    message = Message.objects.create(
        conversation_id=conversation_id,
        sender=user,
        message_type=Message.CALL,
        call_status=call_status,
        call_is_video=bool(is_video),
        call_duration_seconds=duration_seconds,
    )

    channel_layer = get_channel_layer()
    async_to_sync(channel_layer.group_send)(
        f"chat_{conversation_id}",
        {
            "type": "message",
            "message": MessageSerializer(message, context={"request": request}).data,
        },
    )
    notify_conversation_participants(message)

    return message


def delete_reaction(user, message_id, reaction_id):
    try:
        reaction = Reaction.objects.get(id=reaction_id, user=user, message_id=message_id)
    except Reaction.DoesNotExist:
        return False

    message = reaction.message
    emoji = reaction.emoji
    reaction.delete()

    channel_layer = get_channel_layer()
    async_to_sync(channel_layer.group_send)(
        f"chat_{message.conversation_id}",
        {
            "type": "reaction",
            "action": "removed",
            "message_id": message.id,
            "user_id": user.id,
            "emoji": emoji,
        },
    )
    return True
