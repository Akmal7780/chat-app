from rest_framework import serializers
from .models import User


class RegisterSerializer(serializers.ModelSerializer):

    password = serializers.CharField(write_only=True)
    email = serializers.EmailField(read_only=True) 

    class Meta:
        model = User
        fields = [
            "id",
            "username",
            "email",
            "password",
            "avatar",
            "bio"
        ]

    def create(self, validated_data):
        user = User.objects.create_user(
            username=validated_data["username"],
            email=validated_data["email"],
            password=validated_data["password"],
            avatar=validated_data.get("avatar"),
            bio=validated_data.get("bio", "")
        )
        return user


class UserSerializer(serializers.ModelSerializer):
    email = serializers.EmailField(read_only=True)
    avatar = serializers.ImageField(required=False, allow_null=True)
    class Meta:
        model = User
        fields = [
            "id",
            "username",
            "email",
            "avatar",
            "bio",
            "last_login",
            "last_seen",
            "date_joined"
        ]
    def get_avatar(self, obj):
        request = self.context.get("request")

        if obj.avatar:
            return request.build_absolute_uri(obj.avatar.url)
        return None