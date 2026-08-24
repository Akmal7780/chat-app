import json
import logging

from celery import shared_task
from django.conf import settings
from pywebpush import WebPushException, webpush

logger = logging.getLogger(__name__)


@shared_task
def send_push_task(user_id, title, body, conversation_id=None):
    """Sends a real Web Push notification to every subscription this user
    has registered (one per browser/device). Silently no-ops if VAPID keys
    aren't configured — this is an optional feature, not a hard dependency.
    Expired/revoked subscriptions (410 Gone) are cleaned up as they're found.
    """
    if not settings.VAPID_PRIVATE_KEY:
        return

    from .models import PushSubscription

    payload = json.dumps({
        "title": title,
        "body": body,
        "conversation_id": conversation_id,
    })

    subscriptions = PushSubscription.objects.filter(user_id=user_id)

    for sub in subscriptions:
        try:
            webpush(
                subscription_info={
                    "endpoint": sub.endpoint,
                    "keys": {"p256dh": sub.p256dh, "auth": sub.auth},
                },
                data=payload,
                vapid_private_key=settings.VAPID_PRIVATE_KEY,
                vapid_claims={"sub": f"mailto:{settings.VAPID_ADMIN_EMAIL}"},
            )
        except WebPushException as e:
            status_code = getattr(e.response, "status_code", None)
            if status_code in (404, 410):
                sub.delete()
            else:
                logger.error(f"Push send error: {e}")
