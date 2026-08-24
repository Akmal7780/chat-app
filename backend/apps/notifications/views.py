from django.utils import timezone
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status

from django.conf import settings

from .models import Notification, PushSubscription


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def push_public_key(request):
    return Response({"public_key": settings.VAPID_PUBLIC_KEY})


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def push_subscribe(request):
    endpoint = request.data.get("endpoint")
    keys = request.data.get("keys") or {}
    p256dh = keys.get("p256dh")
    auth = keys.get("auth")

    if not endpoint or not p256dh or not auth:
        return Response({"error": "endpoint and keys are required"}, status=status.HTTP_400_BAD_REQUEST)

    PushSubscription.objects.update_or_create(
        endpoint=endpoint,
        defaults={"user": request.user, "p256dh": p256dh, "auth": auth},
    )

    return Response({"status": "ok"})


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def push_unsubscribe(request):
    endpoint = request.data.get("endpoint")
    if endpoint:
        PushSubscription.objects.filter(user=request.user, endpoint=endpoint).delete()
    return Response({"status": "ok"})

@api_view(["POST"])
@permission_classes([IsAuthenticated])
def mark_as_read(request):
    conversation_id = request.data.get("conversation_id")

    if not conversation_id:
        return Response(
            {"error": "conversation_id is required"},
            status=status.HTTP_400_BAD_REQUEST
        )

    updated = Notification.objects.filter(
        user=request.user,
        message__conversation_id=conversation_id,
        is_read=False
    ).update(
        is_read=True,
        read_at=timezone.now()
    )

    return Response({
        "status": "ok",
        "updated": updated
    })


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def get_notifications(request):

    notifications = Notification.objects.filter(
        user=request.user
    ).select_related("message").order_by("-created_at")[:20]

    data = [
        {
            "id": n.id,
            "type": n.type,
            "text": n.text,
            "is_read": n.is_read,
            "created_at": n.created_at,
            "message_id": n.message_id,
            "conversation_id": n.message.conversation_id,
        }
        for n in notifications
    ]

    return Response(data)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def unread_count(request):

    count = Notification.objects.filter(
        user=request.user,
        is_read=False
    ).count()

    return Response({
        "unread_count": count
    })


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def mark_one_as_read(request, notification_id):

    try:
        notification = Notification.objects.get(
            id=notification_id,
            user=request.user
        )

        if not notification.is_read:
            notification.is_read = True
            notification.read_at = timezone.now()
            notification.save(update_fields=["is_read", "read_at"])

        return Response({"status": "ok"})

    except Notification.DoesNotExist:
        return Response(
            {"error": "Notification not found"},
            status=status.HTTP_404_NOT_FOUND
        )


@api_view(["DELETE"])
@permission_classes([IsAuthenticated])
def delete_notification(request, notification_id):

    try:
        notification = Notification.objects.get(
            id=notification_id,
            user=request.user
        )

        notification.delete()

        return Response({"status": "deleted"})

    except Notification.DoesNotExist:
        return Response(
            {"error": "Notification not found"},
            status=status.HTTP_404_NOT_FOUND
        )