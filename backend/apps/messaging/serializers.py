from rest_framework import serializers
from .models import Message,Attachment,Reaction


class AttachmentSerializer(serializers.ModelSerializer):

    file_url = serializers.SerializerMethodField()

    class Meta:
        model = Attachment
        fields = ["id", "file_url", "file_type", "file_size"]

    def get_file_url(self, obj):
        request = self.context.get("request")

        if obj.file:
            if request:
                return request.build_absolute_uri(obj.file.url)
            return obj.file.url

        return None
    
class MessageSerializer(serializers.ModelSerializer):

    sender_username = serializers.CharField(
        source="sender.username",
        read_only=True
    )

    attachments = serializers.SerializerMethodField()
    reply_to = serializers.SerializerMethodField()
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
    reactions = serializers.SerializerMethodField()
    def get_reactions(self, obj):
        reactions = obj.reactions.all()

        return [
            {
                "id": r.id,
                "emoji": r.emoji,
                "user_id": r.user.id,
                "username": r.user.username
            }
            for r in reactions
        ]
    def get_attachments(self, obj):
        request = self.context.get("request")
        attachments = obj.attachments.all()

        return AttachmentSerializer(
            attachments,
            many=True,
            context={"request": request}
        ).data

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
            "is_edited",
            "reply_to",
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

    def get_status(self, obj):

        request = self.context.get("request")

        if not request:
            return "sent"

        user = request.user

        if obj.sender_id == user.id:

            if obj.read_receipts.exclude(user_id=user.id).exists():
                return "read"

            return "sent"

        return None

class ReactionSerializer(serializers.ModelSerializer):

    username = serializers.CharField(
        source="user.username",
        read_only=True
    )

    user_id = serializers.IntegerField(
        source="user.id",
        read_only=True
    )

    class Meta:
        model = Reaction
        fields = ["id", "emoji", "user_id", "username"]
