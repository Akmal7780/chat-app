from rest_framework import generics
from rest_framework.permissions import IsAuthenticated,AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView
import re
from rest_framework_simplejwt.views import TokenObtainPairView
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

from dj_rest_auth.registration.views import SocialLoginView
from allauth.socialaccount.providers.google.views import GoogleOAuth2Adapter
from allauth.socialaccount.models import SocialAccount  

from django.contrib.auth import get_user_model
from django.db.models import Prefetch
from rest_framework.pagination import PageNumberPagination
from .models import User
from .serializers import RegisterSerializer, UserSerializer
from .models import UserPresence
from .throttles import LoginThrottle
User = get_user_model()



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
        response = super().post(request, *args, **kwargs)

        if response.status_code == 200:
            user = User.objects.filter(email=request.data.get("email")).first()

            if user:
                response.data["user"] = UserSerializer(
                    user,
                    context={"request": request}
                ).data

        return response


# =========================
# GOOGLE LOGIN
# =========================
class GoogleLogin(SocialLoginView):
    adapter_class = GoogleOAuth2Adapter

    def post(self, request, *args, **kwargs):
        response = super().post(request, *args, **kwargs)

        user = self.user

        if not user.username:
            try:
                social_account = SocialAccount.objects.get(user=user)
                extra_data = social_account.extra_data

                name = extra_data.get("name", "")
                email = extra_data.get("email", "")

                username = re.sub(r'\W+', '', name).lower()

                if not username:
                    username = email.split("@")[0]

                if User.objects.filter(username=username).exists():
                    import random
                    username += str(random.randint(1000, 9999))

                user.username = username
                user.save()

            except Exception as e:
                print("Username error:", e)

        response.data["user"] = UserSerializer(
            user,
            context={"request": request}
        ).data
        UserPresence.objects.get_or_create(user=user)

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
            instance = serializer.instance

            if instance.avatar:
                instance.avatar.delete(save=False)

            instance.avatar = None
            instance.save()

        else:
            serializer.save()