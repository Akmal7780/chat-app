from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer

from apps.conversations.models import ConversationParticipant

from .models import Notification


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

    participant_ids = ConversationParticipant.objects.filter(
        conversation=conversation
    ).exclude(user_id=message.sender_id).values_list("user_id", flat=True)

    channel_layer = get_channel_layer()

    for user_id in participant_ids:
        if user_id in skip_user_ids:
            continue

        Notification.objects.create(
            user_id=user_id,
            message=message,
            type=notif_type,
            text=text,
        )

        async_to_sync(channel_layer.group_send)(
            f"notifications_{user_id}",
            {
                "type": "send_notification",
                "notification_type": notif_type,
                "text": text,
                "message_id": message.id,
                "conversation_id": str(conversation.id),
                "sender": message.sender.username,
                "sender_id": message.sender_id,
                "conversation_type": conversation.type,
                "message_type": message.message_type,
                "call_status": message.call_status,
                "call_is_video": message.call_is_video,
            }
        )
