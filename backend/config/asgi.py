import os

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

import django
django.setup()

from django.core.asgi import get_asgi_application
from channels.routing import ProtocolTypeRouter, URLRouter

from apps.messaging.routing import websocket_urlpatterns
from apps.messaging.jwt_middleware import JwtAuthMiddleware

django_asgi_app = get_asgi_application()

application = ProtocolTypeRouter({
    "http": django_asgi_app,

    "websocket": JwtAuthMiddleware(
        URLRouter(websocket_urlpatterns)
    ),
})