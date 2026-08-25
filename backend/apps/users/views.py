import secrets

from rest_framework import generics
from rest_framework.permissions import IsAuthenticated,AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.views import TokenObtainPairView
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from rest_framework_simplejwt.tokens import AccessToken

from dj_rest_auth.registration.views import SocialLoginView
from allauth.socialaccount.providers.google.views import GoogleOAuth2Adapter

from django.contrib.auth import get_user_model, authenticate
from django.utils import timezone
from django.contrib.auth.hashers import make_password, check_password
from django.shortcuts import get_object_or_404
from rest_framework.pagination import PageNumberPagination
from .models import User
from .serializers import RegisterSerializer, UserSerializer, UserSessionSerializer
from .models import UserPresence, BlockedUser, UserSession, PendingTwoFactorLogin
from .throttles import LoginThrottle
from . import services
User = get_user_model()


def _create_session(user, access_token_str, request):
    try:
        jti = AccessToken(access_token_str)["jti"]
    except Exception:
        return

    device = services.parse_device(request.META.get("HTTP_USER_AGENT", ""))
    ip_address = services.get_client_ip(request)

    # Re-logging in from the same device/IP reuses its existing row instead
    # of piling up a new one every time (device is a coarse UA summary, e.g.
    # "Chrome on Windows" — good enough to tell real devices apart without a
    # full fingerprinting library). The old jti is simply orphaned; per
    # SessionAwareJWTAuthentication's fail-open design that's harmless — it
    # just rides out its own short remaining lifetime as an unrevocable but
    # still-valid token, same as any token issued before session tracking existed.
    existing = UserSession.objects.filter(
        user=user, device=device, ip_address=ip_address, revoked=False
    ).first()

    if existing:
        existing.jti = jti
        existing.last_seen_at = timezone.now()
        existing.save(update_fields=["jti", "last_seen_at"])
        return

    UserSession.objects.create(
        user=user,
        jti=jti,
        device=device,
        ip_address=ip_address,
    )



class SmallPagination(PageNumberPagination):
    page_size = 20
# =========================
# REGISTER
# =========================
class RegisterView(generics.CreateAPIView):
    queryset = User.objects.all()
    serializer_class = RegisterSerializer
    permission_classes = [AllowAny]
    def get_serializer_context(self):
        return {"request": self.request}


# =========================
# JWT LOGIN
# =========================
class LoginSerializer(TokenObtainPairSerializer):
    username_field = "email"

    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)

        token["id"] = user.id
        token["email"] = user.email
        token["username"] = user.username

        return token


class LoginView(TokenObtainPairView):
    serializer_class = LoginSerializer
    permission_classes = [AllowAny]
    throttle_classes = [LoginThrottle]
    def post(self, request, *args, **kwargs):
        email = request.data.get("email")
        password = request.data.get("password")

        # Two-Step Verification: if the primary password is correct AND a
        # second password is set, stop here — issue a short-lived pending
        # token instead of real access/refresh tokens, so the login only
        # completes once VerifyTwoFactorAPIView confirms the second password.
        if email and password:
            authed_user = authenticate(request, username=email, password=password)
            if authed_user and authed_user.two_step_password:
                pending = PendingTwoFactorLogin.objects.create(
                    user=authed_user, token=secrets.token_urlsafe(32)
                )
                return Response({
                    "requires_2fa": True,
                    "temp_token": pending.token,
                    "hint": authed_user.two_step_hint,
                }, status=200)

        response = super().post(request, *args, **kwargs)

        if response.status_code == 200:
            user = User.objects.filter(email=request.data.get("email")).first()

            if user:
                response.data["user"] = UserSerializer(
                    user,
                    context={"request": request}
                ).data
                _create_session(user, response.data["access"], request)

        return response


class VerifyTwoFactorAPIView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [LoginThrottle]

    def post(self, request):
        temp_token = request.data.get("temp_token")
        password = request.data.get("password")

        pending = PendingTwoFactorLogin.objects.filter(token=temp_token).first()

        if not pending or pending.is_expired():
            if pending:
                pending.delete()
            return Response({"error": "Login session expired. Please sign in again."}, status=400)

        user = pending.user

        if not user.two_step_password or not check_password(password, user.two_step_password):
            return Response({"error": "Incorrect password"}, status=400)

        pending.delete()

        token = LoginSerializer.get_token(user)
        access = token.access_token

        session_user = UserSerializer(user, context={"request": request}).data
        _create_session(user, str(access), request)

        return Response({
            "access": str(access),
            "refresh": str(token),
            "user": session_user,
        })


# =========================
# GOOGLE LOGIN
# =========================
class GoogleLogin(SocialLoginView):
    adapter_class = GoogleOAuth2Adapter

    def post(self, request, *args, **kwargs):
        response = super().post(request, *args, **kwargs)

        user = self.user
        services.assign_username_from_social_account(user)

        response.data["user"] = UserSerializer(
            user,
            context={"request": request}
        ).data
        UserPresence.objects.get_or_create(user=user)

        if response.data.get("access"):
            _create_session(user, response.data["access"], request)

        return response


# =========================
# USERS LIST
# =========================
class UserListView(generics.ListAPIView):
    pagination_class = SmallPagination
    serializer_class = UserSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        q = self.request.query_params.get("q")

        qs = User.objects.exclude(
        id=self.request.user.id
    ).select_related('presence')

        if q:
            qs = qs.filter(username__icontains=q)

        return qs.order_by("username")

    def get_serializer_context(self):
        return {"request": self.request}


# =========================
# CURRENT USER
# =========================
class CurrentUserView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        serializer = UserSerializer(
            request.user,
            context={"request": request}
        )
        return Response(serializer.data)


# =========================
# UPDATE PROFILE (AVATAR 🔥)
# =========================
class UpdateProfileView(generics.UpdateAPIView):
    serializer_class = UserSerializer
    permission_classes = [IsAuthenticated]

    def get_object(self):
        return self.request.user

    def get_serializer_context(self):
        return {"request": self.request}

    def update(self, request, *args, **kwargs):
        kwargs["partial"] = True
        return super().update(request, *args, **kwargs)

    def perform_update(self, serializer):
        avatar = self.request.FILES.get("avatar", "___missing___")

        if avatar == "" or self.request.data.get("avatar") == "":
            services.clear_avatar(serializer.instance)
        else:
            serializer.save()


# =========================
# BLOCK / UNBLOCK USER
# =========================
class BlockUserAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, user_id):
        if int(user_id) == request.user.id:
            return Response({"error": "You cannot block yourself"}, status=400)

        target = get_object_or_404(User, id=user_id)
        BlockedUser.objects.get_or_create(user=request.user, blocked_user=target)

        return Response(UserSerializer(target, context={"request": request}).data)

    def delete(self, request, user_id):
        target = get_object_or_404(User, id=user_id)
        BlockedUser.objects.filter(user=request.user, blocked_user=target).delete()

        return Response(UserSerializer(target, context={"request": request}).data)


class BlockedUsersListView(generics.ListAPIView):
    serializer_class = UserSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        blocked_ids = BlockedUser.objects.filter(
            user=self.request.user
        ).values_list("blocked_user_id", flat=True)

        return User.objects.filter(id__in=blocked_ids)

    def get_serializer_context(self):
        return {"request": self.request}


# =========================
# ACTIVE SESSIONS
# =========================
class SessionListView(generics.ListAPIView):
    serializer_class = UserSessionSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return UserSession.objects.filter(
            user=self.request.user, revoked=False
        ).order_by("-last_seen_at")

    def get_serializer_context(self):
        current_jti = self.request.auth.payload.get("jti") if self.request.auth else None
        return {"current_jti": current_jti}


class SessionRevokeView(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request, pk):
        session = get_object_or_404(UserSession, pk=pk, user=request.user)
        session.revoked = True
        session.save(update_fields=["revoked"])
        return Response({"message": "Session terminated"})


class LogoutAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        jti = request.auth.payload.get("jti") if request.auth else None
        if jti:
            UserSession.objects.filter(user=request.user, jti=jti).update(revoked=True)
        return Response({"message": "Logged out"})


# =========================
# TWO-STEP VERIFICATION MANAGEMENT
# =========================
class TwoStepStatusAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response({
            "enabled": bool(request.user.two_step_password),
            "hint": request.user.two_step_hint,
            "recovery_email": request.user.two_step_recovery_email,
        })


class TwoStepEnableAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        password = request.data.get("password")

        if not password or len(password) < 4:
            return Response({"error": "Password must be at least 4 characters"}, status=400)

        request.user.two_step_password = make_password(password)
        request.user.two_step_hint = request.data.get("hint", "") or ""
        request.user.two_step_recovery_email = request.data.get("recovery_email") or None
        request.user.save(update_fields=["two_step_password", "two_step_hint", "two_step_recovery_email"])

        return Response({"enabled": True})


class TwoStepDisableAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        password = request.data.get("password")

        if not request.user.two_step_password or not check_password(password, request.user.two_step_password):
            return Response({"error": "Incorrect password"}, status=400)

        request.user.two_step_password = None
        request.user.two_step_hint = ""
        request.user.two_step_recovery_email = None
        request.user.save(update_fields=["two_step_password", "two_step_hint", "two_step_recovery_email"])

        return Response({"enabled": False})