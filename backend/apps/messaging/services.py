import os
import re
import uuid
from datetime import timedelta

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.conf import settings
from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied, ValidationError

from apps.conversations.models import Conversation, ConversationParticipant
from apps.notifications.services import notify_conversation_participants
from utils.files import get_file_type, is_dangerous_extension
from utils.minio import get_s3

from .models import Attachment, BannedWord, Message, MessageReport, Poll, PollOption, PollVote, Reaction
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

    if is_dangerous_extension(file_name):
        raise ValidationError("This file type isn't allowed for security reasons")

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


def complete_upload(user, request, *, conversation_id, file_name, key, upload_id, parts, size, message_type=None, view_once=False):
    _require_participant(user, conversation_id)
    _require_own_key(user, key)

    allowed_overrides = {choice for choice, _ in Message.MESSAGE_TYPES}
    if message_type in allowed_overrides:
        file_type = message_type
    else:
        file_type = get_file_type(file_name) or "file"

    if file_type == "voice":
        conversation = Conversation.objects.get(id=conversation_id)
        if conversation.type == Conversation.PRIVATE:
            other = conversation.participants.exclude(user=user).select_related("user").first()
            if other and other.user.voice_messages_visibility == other.user.VISIBILITY_NOBODY:
                raise ValidationError("This user doesn't accept voice messages")

    s3 = get_s3()
    s3.complete_multipart_upload(
        Bucket=settings.AWS_STORAGE_BUCKET_NAME,
        Key=key,
        UploadId=upload_id,
        MultipartUpload={"Parts": parts},
    )

    message = Message.objects.create(
        conversation_id=conversation_id,
        sender=user,
        message_type=file_type,
        view_once=bool(view_once),
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


def open_view_once_media(user, message):
    """One-shot read of a view-once attachment: fetches the bytes, marks the
    message viewed, then deletes the MinIO object — so this can only ever
    succeed once, for the recipient, regardless of any cached/leaked URL."""
    if not message.view_once:
        raise ValidationError("This message is not view-once")

    _require_participant(user, message.conversation_id)

    if message.sender_id == user.id:
        raise PermissionDenied("The sender can't reopen a view-once message")

    if message.viewed_at:
        raise ValidationError("This media has already been opened")

    attachment = message.attachments.first()
    if not attachment:
        raise ValidationError("No attachment found")

    s3 = get_s3()
    obj = s3.get_object(Bucket=settings.AWS_STORAGE_BUCKET_NAME, Key=attachment.file)
    content = obj["Body"].read()
    content_type = obj.get("ContentType") or "application/octet-stream"

    message.viewed_at = timezone.now()
    message.save(update_fields=["viewed_at"])

    s3.delete_object(Bucket=settings.AWS_STORAGE_BUCKET_NAME, Key=attachment.file)

    channel_layer = get_channel_layer()
    async_to_sync(channel_layer.group_send)(
        f"chat_{message.conversation_id}",
        {
            "type": "message_viewed",
            "message_id": message.id,
            "viewed_at": str(message.viewed_at),
        },
    )

    return {"content": content, "content_type": content_type}


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


def moderator_delete_message(message):
    """Same soft-delete the sender's own delete does (services live here so
    both the WS-driven self-delete and the moderation panel share one
    implementation), but callable outside the WS consumer for admin use."""
    if message.is_deleted:
        return

    message.replies.update(reply_to=None)
    message.reactions.all().delete()
    message.is_deleted = True
    message.content = ""
    message.save(update_fields=["is_deleted", "content"])

    channel_layer = get_channel_layer()
    async_to_sync(channel_layer.group_send)(
        f"chat_{message.conversation_id}",
        {
            "type": "message_deleted",
            "message_id": message.id,
        },
    )


def report_message(user, message, reason):
    _require_participant(user, message.conversation_id)

    reason = (reason or "").strip()
    if not reason:
        raise ValidationError("A reason is required")

    return MessageReport.objects.create(
        message=message,
        reporter=user,
        reason=reason[:1000],
    )


def global_search_messages(user, query, page=1, page_size=20):
    """Search every conversation `user` is currently in, not just one — the
    per-conversation `search` action already covers the single-chat case."""
    query = (query or "").strip()
    if not query:
        return []

    participants = ConversationParticipant.objects.filter(
        user=user, left_at__isnull=True
    )
    cleared_before_by_conv = {p.conversation_id: p.cleared_before for p in participants}
    if not cleared_before_by_conv:
        return []

    # A generous window, not the whole table — this app's scale doesn't
    # warrant a dedicated search index, and capping here keeps the (rare)
    # user with tens of thousands of messages from loading them all into
    # memory just to paginate 20 at a time.
    SCAN_LIMIT = 1000

    candidates = Message.objects.filter(
        conversation_id__in=cleared_before_by_conv.keys(),
        content__icontains=query,
        is_deleted=False,
    ).select_related("sender", "conversation").order_by("-created_at")[:SCAN_LIMIT]

    matches = [
        m for m in candidates
        if not cleared_before_by_conv[m.conversation_id]
        or m.created_at >= cleared_before_by_conv[m.conversation_id]
    ]

    offset = (page - 1) * page_size
    page_matches = matches[offset:offset + page_size]

    other_participant_cache = {}

    def conversation_display(conv):
        if conv.type != Conversation.PRIVATE:
            return conv.name, None
        if conv.id not in other_participant_cache:
            other = ConversationParticipant.objects.filter(
                conversation_id=conv.id
            ).exclude(user=user).select_related("user").first()
            other_participant_cache[conv.id] = other.user if other else None
        other_user = other_participant_cache[conv.id]
        display_name = (other_user.full_name or "Unknown") if other_user else conv.name
        return display_name, (other_user.id if other_user else None)

    results = []
    for m in page_matches:
        display_name, other_user_id = conversation_display(m.conversation)
        results.append({
            "message_id": m.id,
            "conversation_id": m.conversation_id,
            "conversation_type": m.conversation.type,
            "conversation_name": display_name,
            "other_user_id": other_user_id,
            "sender_id": m.sender_id,
            "sender_username": m.sender.username,
            "sender_display_name": m.sender.full_name or "Unknown",
            "content": m.content,
            "created_at": m.created_at.isoformat(),
        })
    return results


def contains_banned_word(text):
    """Returns the matched banned word (lowercased) if `text` contains one
    as a whole word, else None. Whole-word matching avoids false positives
    like a banned word being a substring of an unrelated word."""
    if not text:
        return None
    lowered = text.lower()
    for word in BannedWord.objects.values_list("word", flat=True):
        word = word.strip().lower()
        if word and re.search(r"\b" + re.escape(word) + r"\b", lowered):
            return word
    return None


MIN_SCHEDULE_LEAD = timedelta(minutes=1)
MAX_SCHEDULE_AHEAD = timedelta(days=365)


def schedule_message(user, conversation_id, request, *, content, scheduled_at, reply_to_id=None):
    _require_participant(user, conversation_id)

    content = (content or "").strip()
    if not content:
        raise ValidationError("Message can't be empty")

    banned = contains_banned_word(content)
    if banned:
        raise ValidationError("Your message contains a banned word")

    now = timezone.now()
    if scheduled_at <= now + MIN_SCHEDULE_LEAD:
        raise ValidationError("Scheduled time must be at least a minute from now")
    if scheduled_at > now + MAX_SCHEDULE_AHEAD:
        raise ValidationError("Scheduled time is too far in the future")

    reply_to = None
    if reply_to_id:
        reply_to = Message.objects.filter(id=reply_to_id, conversation_id=conversation_id).first()

    message = Message.objects.create(
        conversation_id=conversation_id,
        sender=user,
        message_type=Message.TEXT,
        content=content,
        reply_to=reply_to,
        scheduled_at=scheduled_at,
    )
    return MessageSerializer(message, context={"request": request}).data


def list_scheduled_messages(user, conversation_id=None):
    qs = Message.objects.filter(
        sender=user,
        scheduled_at__isnull=False,
        scheduled_at__gt=timezone.now(),
        is_deleted=False,
    ).order_by("scheduled_at")
    if conversation_id:
        qs = qs.filter(conversation_id=conversation_id)
    return qs


def cancel_scheduled_message(user, message_id):
    message = Message.objects.filter(
        id=message_id, sender=user, scheduled_at__isnull=False,
    ).first()
    if not message:
        raise ValidationError("Scheduled message not found")
    if message.scheduled_at <= timezone.now():
        raise ValidationError("This message has already been sent")
    message.delete()


def send_scheduled_now(user, message_id, request):
    message = Message.objects.filter(
        id=message_id, sender=user, scheduled_at__isnull=False,
    ).first()
    if not message:
        raise ValidationError("Scheduled message not found")
    if message.scheduled_at <= timezone.now():
        raise ValidationError("This message has already been sent")

    message.scheduled_at = None
    message.created_at = timezone.now()
    message.save(update_fields=["scheduled_at", "created_at"])
    _publish_message(message, request)
    return MessageSerializer(message, context={"request": request}).data


def _publish_message(message, request=None):
    """Broadcasts an already-saved message as if it had just been sent live
    — shared by send_scheduled_now (immediate, has a request) and the
    Celery Beat publisher (tasks.publish_scheduled_messages, no request)."""
    channel_layer = get_channel_layer()
    async_to_sync(channel_layer.group_send)(
        f"chat_{message.conversation_id}",
        {
            "type": "message",
            "message": MessageSerializer(message, context={"request": request}).data,
        },
    )
    notify_conversation_participants(message)


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
