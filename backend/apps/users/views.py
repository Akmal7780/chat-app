from rest_framework import generics
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from rest_framework_simplejwt.views import TokenObtainPairView
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

from dj_rest_auth.registration.views import SocialLoginView
from allauth.socialaccount.providers.google.views import GoogleOAuth2Adapter
from allauth.socialaccount.models import SocialAccount  

from django.contrib.auth import get_user_model

from .models import User
from .serializers import RegisterSerializer, UserSerializer

User = get_user_model()


# ✅ Register
class RegisterView(generics.CreateAPIView):
    queryset = User.objects.all()
    serializer_class = RegisterSerializer


# ✅ JWT Login Serializer
class LoginSerializer(TokenObtainPairSerializer):
    username_field = "email"

    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)

        token["id"] = user.id
        token["email"] = user.email
        token["username"] = user.username

        return token


# ✅ Login
class LoginView(TokenObtainPairView):
    serializer_class = LoginSerializer


# 🔥 GOOGLE LOGIN (FIXED)
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

                username = name.replace(" ", "").lower()

                if not username:
                    username = email.split("@")[0]

                if User.objects.filter(username=username).exists():
                    import random
                    username += str(random.randint(1000, 9999))

                user.username = username
                user.save()

            except Exception as e:
                print("Username error:", e)

        response.data["user"] = {
            "id": user.id,
            "username": user.username,
            "email": user.email,
        }

        return response


# ✅ Users list
class UserListView(generics.ListAPIView):
    serializer_class = UserSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return User.objects.exclude(id=self.request.user.id)


# ✅ Current user
class CurrentUserView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        serializer = UserSerializer(request.user)
        return Response(serializer.data)

class UpdateProfileView(generics.UpdateAPIView):
    serializer_class = UserSerializer
    permission_classes = [IsAuthenticated]

    def get_object(self):
        return self.request.user

    def update(self, request, *args, **kwargs):
        kwargs['partial'] = True
        return super().update(request, *args, **kwargs)

    def perform_update(self, serializer):
        avatar = self.request.data.get("avatar")

        if avatar == "" or avatar is None:
            if serializer.instance.avatar:
                serializer.instance.avatar.delete(save=False)

            serializer.save(avatar=None)
        else:
            serializer.save()