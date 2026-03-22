from urllib.parse import parse_qs
from channels.middleware import BaseMiddleware
from channels.db import database_sync_to_async
from django.contrib.auth.models import AnonymousUser

from django.conf import settings
import jwt

from apps.users.models import User


@database_sync_to_async
def get_user(user_id):
    try:
        return User.objects.get(id=user_id)
    except User.DoesNotExist:
        return AnonymousUser()


class JWTAuthMiddleware(BaseMiddleware):

    async def __call__(self, scope, receive, send):

        query_string = scope.get("query_string", b"").decode()
        query_params = parse_qs(query_string)

        token = query_params.get("token")

        if token:
            token = token[0]

            try:
                decoded = jwt.decode(
                    token,
                    settings.SECRET_KEY,
                    algorithms=["HS256"]
                )

                user_id = decoded.get("user_id")

                scope["user"] = await get_user(user_id)

            except Exception:
                scope["user"] = AnonymousUser()

        else:
            scope["user"] = AnonymousUser()

        return await super().__call__(scope, receive, send)