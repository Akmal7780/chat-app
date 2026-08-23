from channels.routing import ProtocolTypeRouter, URLRouter
from apps.messaging.routing import websocket_urlpatterns
from apps.notifications.routing import websocket_urlpatterns as notification_websocket_urlpatterns
from apps.messaging.jwt_middleware import JwtAuthMiddleware

application = ProtocolTypeRouter({
    "websocket": JwtAuthMiddleware(
        URLRouter(websocket_urlpatterns + notification_websocket_urlpatterns)
    )
})