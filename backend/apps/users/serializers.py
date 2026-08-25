from rest_framework import serializers
from .models import User
from .models import UserPresence, BlockedUser, UserSession
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
    is_blocked_by_me = serializers.SerializerMethodField()
    personal_channel_info = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            "id",
            "username",
            "full_name",
            "email",
            "avatar",
            "avatar_url",
            "bio",
            "phone_number",
            "birthday",
            "name_color",
            "personal_channel",
            "personal_channel_info",
            "last_login",
            "date_joined",
            "last_seen",
            "is_blocked_by_me",
            "is_staff",
            "last_seen_visibility",
            "avatar_visibility",
            "bio_visibility",
            "messages_visibility",
            "calls_visibility",
            "voice_messages_visibility",
            "invites_visibility",
            "forwarded_messages_visibility",
            "phone_visibility",
            "birthday_visibility",
        ]
        extra_kwargs = {
            "personal_channel": {"write_only": True, "required": False, "allow_null": True},
        }

    def validate_personal_channel(self, value):
        if value is None:
            return value
        request = self.context.get("request")
        user = request.user if request else None
        if value.type != "channel" or (user and value.created_by_id != user.id):
            raise serializers.ValidationError("You can only set a channel you own as your personal channel.")
        return value

    def get_personal_channel_info(self, obj):
        channel = obj.personal_channel
        if not channel:
            return None
        return {"id": channel.id, "name": channel.name, "avatar_url": None}

    def to_representation(self, instance):
        # `bio` stays a normal writable model field (needed by
        # UpdateProfileView's own-account edits) — this only blanks it out
        # in the OUTGOING representation when another viewer isn't allowed
        # to see it, same rule as avatar_url/last_seen above.
        data = super().to_representation(instance)

        request = self.context.get("request")
        if request and request.user.is_authenticated and request.user.id != instance.id \
           and instance.bio_visibility == User.VISIBILITY_NOBODY:
            data["bio"] = ""

        if request and request.user.is_authenticated and request.user.id != instance.id \
           and instance.phone_visibility == User.VISIBILITY_NOBODY:
            data["phone_number"] = ""

        if request and request.user.is_authenticated and request.user.id != instance.id \
           and instance.birthday_visibility == User.VISIBILITY_NOBODY:
            data["birthday"] = None

        return data

    def get_is_blocked_by_me(self, obj):
        request = self.context.get("request")
        if not request or not request.user.is_authenticated:
            return False
        return BlockedUser.objects.filter(user=request.user, blocked_user=obj).exists()

    # =========================
    # AVATAR URL (MinIO 🔥)
    # =========================
    def get_avatar_url(self, obj):

        if not obj.avatar:
            return None

        request = self.context.get("request")
        if request and request.user.is_authenticated and request.user.id != obj.id \
           and obj.avatar_visibility == User.VISIBILITY_NOBODY:
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
        # presence.last_seen is None while the user is currently online (see
        # set_user_online) — that's a meaningful value, not "missing", so it
        # must NOT fall through to last_login here (an `or` would silently
        # replace "online" with a stale old login timestamp on every request).
        request = self.context.get("request")
        if request and request.user.is_authenticated and request.user.id != obj.id \
           and obj.last_seen_visibility == User.VISIBILITY_NOBODY:
            return None

        try:
            presence = obj.presence
        except UserPresence.DoesNotExist:
            return obj.last_login or None

        if presence.last_seen is None:
            return None
        return presence.last_seen
    
    def update(self, instance, validated_data):
        avatar_in_request = self.initial_data.get("avatar", "___missing___")

        if avatar_in_request == "___missing___":
            validated_data.pop("avatar", None)

        elif avatar_in_request in ["", None]:
            if instance.avatar:
                instance.avatar.delete(save=False)
            validated_data["avatar"] = None


        return super().update(instance, validated_data)


# =========================
# ACTIVE SESSIONS
# =========================
class UserSessionSerializer(serializers.ModelSerializer):
    is_current = serializers.SerializerMethodField()

    class Meta:
        model = UserSession
        fields = [
            "id",
            "device",
            "ip_address",
            "created_at",
            "last_seen_at",
            "is_current",
        ]

    def get_is_current(self, obj):
        current_jti = self.context.get("current_jti")
        return bool(current_jti) and obj.jti == current_jti