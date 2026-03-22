from urllib.parse import parse_qs
from channels.db import database_sync_to_async
from django.contrib.auth.models import AnonymousUser
from django.conf import settings
import jwt
import logging

from apps.users.models import User

logger = logging.getLogger(__name__)

@database_sync_to_async
def get_user(user_id):
    try:
        user = User.objects.get(id=user_id)
        logger.info(f"✅ User found: {user.username}")
        return user
    except User.DoesNotExist:
        logger.error(f"❌ User not found: {user_id}")
        return AnonymousUser()
    except Exception as e:
        logger.error(f"❌ Error getting user: {e}")
        return AnonymousUser()


class JwtAuthMiddleware:

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        logger.info("🔑 JwtAuthMiddleware called")
        
        query_string = scope.get("query_string", b"").decode()
        logger.info(f"Query string: {query_string}")
        
        query_params = parse_qs(query_string)
        token_list = query_params.get("token")
        
        if token_list:
            token = token_list[0]
            logger.info(f"✅ Token found: {token[:20]}...")
            
            try:
                payload = jwt.decode(
                    token,
                    settings.SECRET_KEY,
                    algorithms=["HS256"],
                    options={"verify_exp": False}  
                )
                
                logger.info(f"✅ JWT payload: {payload}")
            
                user_id = payload.get("user_id") or payload.get("id")
                logger.info(f"👤 User ID: {user_id}")
                
                if user_id:
                    scope["user"] = await get_user(user_id)
                    logger.info(f"✅ User set in scope: {scope['user']}")
                else:
                    logger.error("❌ No user_id in payload")
                    scope["user"] = AnonymousUser()
                    
            except jwt.ExpiredSignatureError:
                logger.error("❌ Token expired")
                scope["user"] = AnonymousUser()
            except jwt.InvalidTokenError as e:
                logger.error(f"❌ Invalid token: {e}")
                scope["user"] = AnonymousUser()
            except Exception as e:
                logger.error(f"❌ Unexpected error: {e}")
                scope["user"] = AnonymousUser()
        else:
            logger.warning("❌ No token in query string")
            scope["user"] = AnonymousUser()

        return await self.app(scope, receive, send)