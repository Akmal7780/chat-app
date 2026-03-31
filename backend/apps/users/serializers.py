from rest_framework import serializers
from .models import User
from .models import UserPresence
from utils.minio import get_s3
from django.conf import settings

# =========================
# REGISTER
# =========================
class RegisterSerializer(serializers.ModelSerializer):

    password = serializers.CharField(write_only=True)
    email = serializers.EmailField()

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
        UserPresence.objects.create(user=user)
        return user


# =========================
# USER
# =========================
class UserSerializer(serializers.ModelSerializer):

    email = serializers.EmailField(read_only=True)
    avatar_url = serializers.SerializerMethodField()
    last_seen = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            "id",
            "username",
            "email",
            "avatar",
            "avatar_url",
            "bio",
            "last_login",
            "date_joined",
            "last_seen",
        ]

    # =========================
    # AVATAR URL (MinIO 🔥)
    # =========================
    def get_avatar_url(self, obj):

        if not obj.avatar:
            return None

        s3 = get_s3()

        url = s3.generate_presigned_url(
            "get_object",
            Params={
                "Bucket": settings.AWS_STORAGE_BUCKET_NAME,
                "Key": obj.avatar.name,  
            },
            ExpiresIn=3600,
        )

        return url.replace(
            settings.AWS_S3_ENDPOINT_URL,
            getattr(settings, "PUBLIC_MINIO_URL", "http://localhost:9000")
        )
    

    def get_last_seen(self, obj):
        try:
            presence = obj.presence
            return presence.last_seen or obj.last_login
        except UserPresence.DoesNotExist:
            return obj.last_login or None
    
    def update(self, instance, validated_data):
        avatar_in_request = self.initial_data.get("avatar", "___missing___")

        if avatar_in_request == "___missing___":
            validated_data.pop("avatar", None)

        elif avatar_in_request in ["", None]:
            if instance.avatar:
                instance.avatar.delete(save=False)
            validated_data["avatar"] = None


        return super().update(instance, validated_data)