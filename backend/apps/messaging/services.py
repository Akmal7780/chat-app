import os
import uuid
from datetime import timedelta

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.conf import settings
from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied, ValidationError

from apps.conversations.models import ConversationParticipant
from apps.notifications.services import notify_conversation_participants
from utils.files import get_file_type
from utils.minio import get_s3

from .models import Attachment, Message, Poll, PollOption, PollVote, Reaction
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


def initiate_upload(user, conversation_id, file_name, file_size=None):
    _require_participant(user, conversation_id)

    if file_size is not None and file_size > settings.MAX_UPLOAD_SIZE:
        max_mb = settings.MAX_UPLOAD_SIZE // (1024 * 1024)
        raise ValidationError(f"File exceeds the maximum allowed size of {max_mb}MB")

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


def create_poll(
    user,
    conversation_id,
    request,
    *,
    question,
    options,
    allows_multiple=False,
    description="",
    anonymous=False,
    allow_adding_options=False,
    allow_revoting=True,
    shuffle_options=False,
    quiz_mode=False,
    correct_option_indices=None,
    duration_seconds=None,
):
    _require_participant(user, conversation_id)

    question = (question or "").strip()
    if not question:
        raise ValidationError("Poll question is required")

    cleaned_options = [opt.strip() for opt in (options or []) if opt and opt.strip()]
    if len(cleaned_options) < 2:
        raise ValidationError("A poll needs at least 2 options")
    if len(cleaned_options) > 10:
        raise ValidationError("A poll can have at most 10 options")

    quiz_mode = bool(quiz_mode)
    correct_option_indices = set(correct_option_indices or [])
    if quiz_mode:
        # A quiz poll is inherently single-answer.
        allows_multiple = False
        if not correct_option_indices:
            raise ValidationError("Select the correct answer for a quiz")

    closes_at = None
    if duration_seconds:
        try:
            duration_seconds = int(duration_seconds)
        except (TypeError, ValueError):
            duration_seconds = None
        if duration_seconds and duration_seconds > 0:
            closes_at = timezone.now() + timedelta(seconds=duration_seconds)

    message = Message.objects.create(
        conversation_id=conversation_id,
        sender=user,
        message_type=Message.POLL,
        content=question,
    )

    poll = Poll.objects.create(
        message=message,
        question=question,
        description=(description or "").strip()[:500],
        allows_multiple=bool(allows_multiple),
        anonymous=bool(anonymous),
        allow_adding_options=bool(allow_adding_options),
        allow_revoting=bool(allow_revoting),
        shuffle_options=bool(shuffle_options),
        quiz_mode=quiz_mode,
        closes_at=closes_at,
    )
    PollOption.objects.bulk_create([
        PollOption(poll=poll, text=text, order=i, is_correct=(i in correct_option_indices))
        for i, text in enumerate(cleaned_options)
    ])

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


def vote_poll(user, message, option_ids, request=None):
    if message.message_type != Message.POLL or not hasattr(message, "poll"):
        raise ValidationError("Not a poll message")

    poll = message.poll
    effective_closed = poll.is_closed or bool(poll.closes_at and timezone.now() >= poll.closes_at)
    if effective_closed:
        if poll.closes_at and not poll.is_closed:
            poll.is_closed = True
            poll.save(update_fields=["is_closed"])
        raise ValidationError("This poll is closed")

    _require_participant(user, message.conversation_id)

    already_voted = PollVote.objects.filter(option__poll=poll, user=user).exists()
    if already_voted and not poll.allow_revoting:
        raise ValidationError("Revoting is not allowed for this poll")

    valid_option_ids = set(poll.options.values_list("id", flat=True))
    selected = set(option_ids or []) & valid_option_ids
    if not selected:
        raise ValidationError("Invalid option")

    if not poll.allows_multiple:
        selected = {next(iter(selected))}

    with transaction.atomic():
        PollVote.objects.filter(option__poll=poll, user=user).delete()
        PollVote.objects.bulk_create([
            PollVote(option_id=option_id, user=user) for option_id in selected
        ])

    broadcast_data = MessageSerializer(message, context={}).data["poll"]

    channel_layer = get_channel_layer()
    async_to_sync(channel_layer.group_send)(
        f"chat_{message.conversation_id}",
        {
            "type": "poll_updated",
            "message_id": message.id,
            "poll": broadcast_data,
        },
    )

    # The voting user gets a personalized view (their own vote/anonymous
    # identity resolved) instead of the anonymized broadcast payload.
    return MessageSerializer(message, context={"request": request}).data["poll"]


def add_poll_option(user, message, request, text):
    if message.message_type != Message.POLL or not hasattr(message, "poll"):
        raise ValidationError("Not a poll message")

    poll = message.poll
    _require_participant(user, message.conversation_id)

    effective_closed = poll.is_closed or bool(poll.closes_at and timezone.now() >= poll.closes_at)
    if effective_closed:
        raise ValidationError("This poll is closed")
    if not poll.allow_adding_options:
        raise ValidationError("Adding options is not allowed for this poll")

    text = (text or "").strip()
    if not text:
        raise ValidationError("Option text is required")
    if poll.options.count() >= 10:
        raise ValidationError("A poll can have at most 10 options")

    next_order = poll.options.count()
    PollOption.objects.create(poll=poll, text=text, order=next_order, added_by=user)

    broadcast_data = MessageSerializer(message, context={}).data["poll"]

    channel_layer = get_channel_layer()
    async_to_sync(channel_layer.group_send)(
        f"chat_{message.conversation_id}",
        {
            "type": "poll_updated",
            "message_id": message.id,
            "poll": broadcast_data,
        },
    )

    return MessageSerializer(message, context={"request": request}).data["poll"]


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
