from urllib.parse import parse_qs
from channels.db import database_sync_to_async
from django.contrib.auth.models import AnonymousUser
from django.conf import settings
import jwt
import logging

from apps.users.models import User, UserSession

logger = logging.getLogger(__name__)

@database_sync_to_async
def get_user(user_id):
    try:
        return User.objects.get(id=user_id)
    except User.DoesNotExist:
        return AnonymousUser()


@database_sync_to_async
def is_session_revoked(jti):
    return bool(jti) and UserSession.objects.filter(jti=jti, revoked=True).exists()


class JwtAuthMiddleware:

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        query_string = scope.get("query_string", b"").decode()
        query_params = parse_qs(query_string)
        token_list = query_params.get("token")

        if token_list:
            token = token_list[0]

            try:
                payload = jwt.decode(
                    token,
                    settings.SECRET_KEY,
                    algorithms=["HS256"],
                )

                user_id = payload.get("user_id") or payload.get("id")

                if user_id and await is_session_revoked(payload.get("jti")):
                    logger.info("WebSocket auth rejected: session revoked")
                    scope["user"] = AnonymousUser()
                elif user_id:
                    scope["user"] = await get_user(user_id)
                else:
                    logger.warning("JWT payload missing user_id")
                    scope["user"] = AnonymousUser()

            except jwt.ExpiredSignatureError:
                logger.info("WebSocket auth rejected: token expired")
                scope["user"] = AnonymousUser()
            except jwt.InvalidTokenError as e:
                logger.warning(f"WebSocket auth rejected: invalid token ({e})")
                scope["user"] = AnonymousUser()
        else:
            scope["user"] = AnonymousUser()

        return await self.app(scope, receive, send)
