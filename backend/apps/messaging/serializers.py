from rest_framework import serializers
from .models import Message,Attachment,Reaction

from utils.minio import get_s3
from django.conf import settings
class AttachmentSerializer(serializers.ModelSerializer):

    file_url = serializers.SerializerMethodField()
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.s3 = get_s3()  

    class Meta:
        model = Attachment
        fields = ["id", "file_url", "file_type", "file_size", "original_name"]

    def get_file_url(self, obj):
        if not obj.file:
            return None

        url = self.s3.generate_presigned_url(
            "get_object",
            Params={
                "Bucket": settings.AWS_STORAGE_BUCKET_NAME,
                "Key": obj.file,
            },
            ExpiresIn=300,
        )

        public_url = url.replace(
            settings.AWS_S3_ENDPOINT_URL,  
            getattr(settings, "PUBLIC_MINIO_URL", "http://localhost:9000")
        )

        return public_url
    
class MessageSerializer(serializers.ModelSerializer):

    sender_username = serializers.CharField(
        source="sender.username",
        read_only=True
    )

    attachments = serializers.SerializerMethodField()

    def get_attachments(self, obj):
        request = self.context.get("request")
        return AttachmentSerializer(
            obj.attachments.all(),
            many=True,
            context={"request": request}
        ).data

    reply_to = serializers.SerializerMethodField()
    reactions = serializers.SerializerMethodField()
    status = serializers.SerializerMethodField()

    class Meta:
        model = Message
        fields = [
            "id",
            "conversation",
            "sender",
            "sender_username",
            "message_type",
            "content",
            "attachments",
            "reactions",
            "reply_to",
            "is_edited",
            "is_deleted",
            "created_at",
            "updated_at",
            "status",
        ]

        read_only_fields = [
            "id",
            "sender",
            "sender_username",
            "is_edited",
            "is_deleted",
            "created_at",
            "updated_at",
        ]

    # =========================
    # REPLY
    # =========================
    def get_reply_to(self, obj):
        if obj.reply_to:
            return {
                "id": obj.reply_to.id,
                "sender": obj.reply_to.sender.username,
                "sender_id": obj.reply_to.sender.id,
                "content": obj.reply_to.content,
                "is_deleted": obj.reply_to.is_deleted
            }
        return None

    # =========================
    # REACTIONS
    # =========================
    def get_reactions(self, obj):
        return [
            {
                "id": r.id,
                "emoji": r.emoji,
                "user_id": r.user.id,
                "username": r.user.username
            }
            for r in obj.reactions.all()
        ]

    # =========================
    # STATUS
    # =========================
    def get_status(self, obj):
        request = self.context.get("request")

        if not request:
            return "sent"

        user = request.user

        if obj.sender_id == user.id:

            if obj.read_receipts.exclude(user_id=user.id).exists():
                return "read"

            if obj.read_receipts.exists():
                return "delivered"

            return "sent"

        return None

class ReactionSerializer(serializers.ModelSerializer):

    username = serializers.CharField(source="user.username", read_only=True)
    user_id = serializers.IntegerField(source="user.id", read_only=True)

    class Meta:
        model = Reaction
        fields = ["id", "emoji", "user_id", "username"]