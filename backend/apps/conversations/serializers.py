from rest_framework import serializers
from .models import Conversation, ConversationParticipant, ChatFolder


class ConversationSerializer(serializers.ModelSerializer):
    # private chat
    participant_id = serializers.IntegerField(write_only=True, required=False)

    # group chat
    participant_ids = serializers.ListField(
        child=serializers.IntegerField(), write_only=True, required=False
    )

    # group members
    members_count = serializers.SerializerMethodField()

    # chats-list fields
    other_participant = serializers.SerializerMethodField()
    last_message = serializers.SerializerMethodField()
    unread_count = serializers.SerializerMethodField()
    is_muted = serializers.SerializerMethodField()
    is_pinned = serializers.SerializerMethodField()
    wallpaper_type = serializers.SerializerMethodField()
    wallpaper_value = serializers.SerializerMethodField()
    wallpaper_url = serializers.SerializerMethodField()

    avatar_url = serializers.SerializerMethodField()

    class Meta:
        model = Conversation
        fields = [
            "id",
            "name",
            "type",
            "description",
            "avatar",
            "avatar_url",
            "is_public",
            "invite_slug",
            "auto_delete_seconds",
            "participant_id",
            "participant_ids",
            "members_count",
            "other_participant",
            "last_message",
            "unread_count",
            "is_muted",
            "is_pinned",
            "wallpaper_type",
            "wallpaper_value",
            "wallpaper_url",
            "created_by",
            "created_at",
            "updated_at",
        ]

        extra_kwargs = {
            "avatar": {"write_only": True, "required": False},
        }

        read_only_fields = [
            "id",
            "created_by",
            "created_at",
            "updated_at",
            "members_count",
            "other_participant",
            "last_message",
            "unread_count",
            "is_muted",
            "is_pinned",
            "wallpaper_type",
            "wallpaper_value",
            "wallpaper_url",
        ]

    def get_avatar_url(self, obj):
        if not obj.avatar:
            return None

        from django.conf import settings
        from utils.minio import get_s3

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

    # count the number of members
    def get_members_count(self, obj):
        return obj.participants.count()

    # ==========================================================
    # CHATS-LIST HELPERS
    # ==========================================================

    def _current_participant(self, obj):
        """
        Reads from the already-prefetched `participants` (see
        ConversationViewSet.get_queryset) instead of issuing a new query.
        """
        request = self.context.get("request")
        if not request or not request.user.is_authenticated:
            return None

        for participant in obj.participants.all():
            if participant.user_id == request.user.id:
                return participant
        return None

    def get_is_muted(self, obj):
        participant = self._current_participant(obj)
        return bool(participant and participant.is_muted)

    def get_is_pinned(self, obj):
        participant = self._current_participant(obj)
        return bool(participant and participant.is_pinned)

    def get_wallpaper_type(self, obj):
        participant = self._current_participant(obj)
        return participant.wallpaper_type if participant else "default"

    def get_wallpaper_value(self, obj):
        participant = self._current_participant(obj)
        return participant.wallpaper_value if participant else ""

    def get_wallpaper_url(self, obj):
        participant = self._current_participant(obj)
        if not participant or not participant.wallpaper_image:
            return None

        from django.conf import settings
        from utils.minio import get_s3

        s3 = get_s3()
        url = s3.generate_presigned_url(
            "get_object",
            Params={
                "Bucket": settings.AWS_STORAGE_BUCKET_NAME,
                "Key": participant.wallpaper_image.name,
            },
            ExpiresIn=3600,
        )
        return url.replace(
            settings.AWS_S3_ENDPOINT_URL,
            getattr(settings, "PUBLIC_MINIO_URL", "http://localhost:9000")
        )

    def get_other_participant(self, obj):
        if obj.type != Conversation.PRIVATE:
            return None

        request = self.context.get("request")
        if not request or not request.user.is_authenticated:
            return None

        for participant in obj.participants.all():
            if participant.user_id != request.user.id:
                # local import avoids a circular import at module load time
                from apps.users.serializers import UserSerializer
                return UserSerializer(participant.user, context=self.context).data

        return None

    def get_last_message(self, obj):
        messages = getattr(obj, "prefetched_last_message", None)
        if not messages:
            return None

        message = messages[0]
        return {
            "id": message.id,
            "content": message.content,
            "sender_id": message.sender_id,
            "sender_username": message.sender.username,
            "created_at": message.created_at,
            "message_type": message.message_type,
            "is_deleted": message.is_deleted,
            "call_status": message.call_status,
            "call_is_video": message.call_is_video,
        }

    def get_unread_count(self, obj):
        return getattr(obj, "unread_count", 0)

    AUTO_DELETE_ALLOWED = {None, 0, 86400, 604800, 2592000}

    def validate_auto_delete_seconds(self, value):
        if value not in self.AUTO_DELETE_ALLOWED:
            raise serializers.ValidationError(
                "Must be one of: off, 1 day, 1 week, 1 month"
            )
        return value

    def validate(self, data):
        """
        Group/channel name is required
        """
        if data.get("type") in (Conversation.GROUP, Conversation.CHANNEL) and not data.get("name"):
            raise serializers.ValidationError(
                {"name": "Name is required for group/channel conversations"}
            )

        return data

    def create(self, validated_data):
        request = self.context["request"]

        participant_id = validated_data.pop("participant_id", None)
        participant_ids = validated_data.pop("participant_ids", [])

        # create conversation 
        conversation = Conversation.objects.create(**validated_data)

        # creator admin
        ConversationParticipant.objects.create(
            conversation=conversation, user=request.user, role="admin"
        )

        # private chat 
        if participant_id:
            ConversationParticipant.objects.create(
                conversation=conversation, user_id=participant_id, role="member"
            )

        # group chat
        for user_id in participant_ids:
            if user_id == request.user.id:
                continue

            ConversationParticipant.objects.create(
                conversation=conversation, user_id=user_id, role="member"
            )

        if conversation.type == Conversation.CHANNEL:
            from apps.messaging.models import Message
            Message.objects.create(
                conversation=conversation,
                sender=request.user,
                message_type=Message.SYSTEM,
                content="Channel created",
            )

        return conversation


class ConversationParticipantSerializer(serializers.ModelSerializer):
    username = serializers.CharField(source="user.username", read_only=True)

    class Meta:
        model = ConversationParticipant
        fields = [
            "id",
            "conversation",
            "user",
            "username",
            "role",
            "joined_at",
            "left_at",
            "is_muted",
            "last_read_message",
        ]

        read_only_fields = ["id", "joined_at"]


class ChatFolderSerializer(serializers.ModelSerializer):
    conversation_ids = serializers.PrimaryKeyRelatedField(
        source="conversations",
        queryset=Conversation.objects.all(),
        many=True,
        write_only=True,
        required=False,
    )
    conversations = serializers.PrimaryKeyRelatedField(many=True, read_only=True)

    class Meta:
        model = ChatFolder
        fields = ["id", "name", "conversations", "conversation_ids", "created_at"]
        read_only_fields = ["id", "conversations", "created_at"]

    def validate_conversation_ids(self, conversations):
        request = self.context["request"]
        allowed = Conversation.objects.filter(participants__user=request.user)
        invalid = [c.id for c in conversations if c not in allowed]
        if invalid:
            raise serializers.ValidationError(
                f"Not a participant of conversation(s): {invalid}"
            )
        return conversations

    def create(self, validated_data):
        conversations = validated_data.pop("conversations", [])
        folder = ChatFolder.objects.create(
            user=self.context["request"].user, **validated_data
        )
        if conversations:
            folder.conversations.set(conversations)
        return folder

    def update(self, instance, validated_data):
        conversations = validated_data.pop("conversations", None)
        instance.name = validated_data.get("name", instance.name)
        instance.save(update_fields=["name"])
        if conversations is not None:
            instance.conversations.set(conversations)
        return instance