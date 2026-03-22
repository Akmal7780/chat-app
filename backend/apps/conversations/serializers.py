from rest_framework import serializers
from .models import Conversation, ConversationParticipant


class ConversationSerializer(serializers.ModelSerializer):
    # private chat 
    participant_id = serializers.IntegerField(write_only=True, required=False)

    # group chat 
    participant_ids = serializers.ListField(
        child=serializers.IntegerField(), write_only=True, required=False
    )

    # group members 
    members_count = serializers.SerializerMethodField()

    class Meta:
        model = Conversation
        fields = [
            "id",
            "name",
            "type",
            "participant_id",
            "participant_ids",
            "members_count",
            "created_by",
            "created_at",
            "updated_at",
        ]

        read_only_fields = [
            "id",
            "created_by",
            "created_at",
            "updated_at",
            "members_count",
        ]

    # count the number of members
    def get_members_count(self, obj):
        return obj.participants.count()

    def validate(self, data):
        """
        Group name is required
        """
        if data.get("type") == Conversation.GROUP and not data.get("name"):
            raise serializers.ValidationError(
                {"name": "Group name is required for group conversations"}
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