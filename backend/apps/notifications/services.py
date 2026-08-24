import re

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer

from apps.conversations.models import ConversationParticipant

from .models import Notification
from .tasks import send_push_task


def _extract_mentioned_user_ids(content, participant_pairs):
    """Match against each participant's actual username rather than a
    generic @\\w+ pattern — usernames in this app can contain '.', '@', '+'
    (Django's default username charset), so a naive regex would either miss
    or mis-split real usernames."""
    if not content:
        return set()

    mentioned = set()
    for user_id, username in participant_pairs:
        if not username:
            continue
        pattern = r"(?<!\w)@" + re.escape(username) + r"(?!\w)"
        if re.search(pattern, content):
            mentioned.add(user_id)
    return mentioned


def build_notification_text(message):
    sender = message.sender.username

    if message.message_type == "image":
        return "image", f"{sender} sent a photo \U0001F4F7"
    if message.message_type == "video":
        return "video", f"{sender} sent a video \U0001F3A5"
    if message.message_type == "file":
        return "file", f"{sender} sent a file \U0001F4CE"
    if message.message_type == "voice":
        return "voice", f"{sender} sent a voice message \U0001F3A4"
    if message.message_type == "call":
        icon = "\U0001F4F9" if message.call_is_video else "\U0001F4DE"
        if message.call_status == "completed":
            return "call", f"{sender} called you {icon}"
        if message.call_status == "declined":
            return "call", f"{sender}'s call was declined {icon}"
        return "call", f"Missed call from {sender} {icon}"
    return "message", f"{sender}: {message.content}"


def notify_conversation_participants(message, *, skip_user_ids=()):
    """Create a Notification row and push a WS event to every participant of
    message.conversation except the sender and anyone in skip_user_ids (e.g.
    users currently viewing that conversation).

    Single source of truth for notification fan-out — used by both the
    WebSocket message flow (apps.messaging.consumers) and the HTTP
    attachment-upload flow (apps.messaging.views).
    """
    conversation = message.conversation
    notif_type, text = build_notification_text(message)
    sender = message.sender.username

    participants = list(
        ConversationParticipant.objects.filter(conversation=conversation)
        .exclude(user_id=message.sender_id)
        .select_related("user")
    )
    participant_pairs = [(p.user_id, p.user.username) for p in participants]
    mentioned_user_ids = _extract_mentioned_user_ids(message.content, participant_pairs)

    channel_layer = get_channel_layer()

    for user_id, _username in participant_pairs:
        if user_id in skip_user_ids:
            continue

        is_mention = user_id in mentioned_user_ids
        if is_mention:
            user_notif_type = "mention"
            user_text = f"{sender} mentioned you: {message.content}"
        else:
            user_notif_type = notif_type
            user_text = text

        Notification.objects.create(
            user_id=user_id,
            message=message,
            type=user_notif_type,
            text=user_text,
        )

        async_to_sync(channel_layer.group_send)(
            f"notifications_{user_id}",
            {
                "type": "send_notification",
                "notification_type": user_notif_type,
                "text": user_text,
                "message_id": message.id,
                "conversation_id": str(conversation.id),
                "sender": sender,
                "sender_id": message.sender_id,
                "conversation_type": conversation.type,
                "message_type": message.message_type,
                "call_status": message.call_status,
                "call_is_video": message.call_is_video,
                "is_mention": is_mention,
            }
        )

        # Real push (reaches a closed/backgrounded tab) — the service worker
        # itself decides whether to actually surface it if a window is
        # already focused, avoiding a double notification for open tabs.
        push_title = sender if conversation.type == "private" else (conversation.name or sender)
        send_push_task.delay(user_id, push_title, user_text, str(conversation.id))
