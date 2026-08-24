from rest_framework import serializers
from .models import Message,Attachment,Reaction

from utils.minio import get_s3
from django.conf import settings
from django.utils import timezone
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
            getattr(settings, "PUBLIC_MINIO_URL", "http://localhost:9004")
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
    forwarded_from = serializers.SerializerMethodField()
    reactions = serializers.SerializerMethodField()
    poll = serializers.SerializerMethodField()
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
            "poll",
            "reply_to",
            "forwarded_from",
            "is_edited",
            "is_deleted",
            "is_pinned",
            "call_status",
            "call_is_video",
            "call_duration_seconds",
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
            "is_pinned",
            "created_at",
            "updated_at",
        ]

    # =========================
    # FORWARDED FROM
    # =========================
    def get_forwarded_from(self, obj):
        if obj.forwarded_from:
            return {
                "id": obj.forwarded_from.id,
                "sender_username": obj.forwarded_from.sender.username,
            }
        return None

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
    # POLL
    # =========================
    def get_poll(self, obj):
        if obj.message_type != Message.POLL or not hasattr(obj, "poll"):
            return None

        request = self.context.get("request")
        requesting_user_id = getattr(getattr(request, "user", None), "id", None)

        poll = obj.poll
        options = []
        total_votes = 0
        my_voted_option_ids = set()

        for option in poll.options.all():
            all_voter_ids = list(option.votes.values_list("user_id", flat=True))
            total_votes += len(all_voter_ids)
            if requesting_user_id in all_voter_ids:
                my_voted_option_ids.add(option.id)
            options.append({
                "id": option.id,
                "text": option.text,
                "vote_count": len(all_voter_ids),
                # Anonymous polls only reveal the requesting user's own vote,
                # never other participants' identities.
                "voter_ids": (
                    [requesting_user_id] if requesting_user_id in all_voter_ids else []
                ) if poll.anonymous else all_voter_ids,
                "added_by": option.added_by_id,
            })

        has_voted = len(my_voted_option_ids) > 0
        # Quiz correctness is a spoiler — only reveal is_correct once the
        # requesting user has actually cast a vote.
        if poll.quiz_mode and has_voted:
            for option, opt_data in zip(poll.options.all(), options):
                opt_data["is_correct"] = option.is_correct

        effective_closed = poll.is_closed or bool(poll.closes_at and timezone.now() >= poll.closes_at)

        return {
            "id": poll.id,
            "question": poll.question,
            "description": poll.description,
            "allows_multiple": poll.allows_multiple,
            "is_closed": effective_closed,
            "anonymous": poll.anonymous,
            "allow_adding_options": poll.allow_adding_options,
            "allow_revoting": poll.allow_revoting,
            "shuffle_options": poll.shuffle_options,
            "quiz_mode": poll.quiz_mode,
            "closes_at": poll.closes_at,
            "total_votes": total_votes,
            "options": options,
        }

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