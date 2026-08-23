from rest_framework.exceptions import AuthenticationFailed
from rest_framework_simplejwt.authentication import JWTAuthentication

from .models import UserSession


class SessionAwareJWTAuthentication(JWTAuthentication):
    """
    Same as the default JWTAuthentication, but rejects tokens whose
    UserSession row (see LoginView/GoogleLogin) was explicitly revoked via
    "Terminate session" or "Log out" — without this, revoking a session in
    Settings would only delete a row cosmetically while the token kept
    working for its full remaining lifetime.

    Tokens issued before this feature existed (no matching UserSession row)
    are intentionally left alone — fail open rather than lock out existing
    sessions that predate session tracking.
    """

    def get_user(self, validated_token):
        user = super().get_user(validated_token)

        jti = validated_token.get("jti")
        if jti and UserSession.objects.filter(jti=jti, revoked=True).exists():
            raise AuthenticationFailed("This session has been terminated.")

        return user
