from rest_framework import viewsets, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.decorators import action
from django.contrib.auth import get_user_model

from .models import Conversation, ConversationParticipant
from .serializers import ConversationSerializer, ConversationParticipantSerializer
from django.db.models import Count

User = get_user_model()


class ConversationViewSet(viewsets.ModelViewSet):

    serializer_class = ConversationSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Conversation.objects.filter(
            participants__user=self.request.user
        ).annotate(
            members_count=Count("participants__user", distinct=True)
        ).distinct()

    def create(self, request, *args, **kwargs):

        conversation_type = request.data.get("type", "private")
        participant_id = request.data.get("participant_id")

        # PRIVATE CHAT VALIDATION
        if conversation_type == "private":

            if not participant_id:
                return Response(
                    {"error": "participant_id required"},
                    status=status.HTTP_400_BAD_REQUEST
                )

            try:
                participant = User.objects.get(id=participant_id)
            except User.DoesNotExist:
                return Response(
                    {"error": "User not found"},
                    status=status.HTTP_404_NOT_FOUND
                )

            # existing private chat 
            existing = Conversation.objects.filter(
                type="private",
                participants__user=request.user
            ).filter(
                participants__user=participant
            ).first()

            if existing:
                serializer = self.get_serializer(existing)
                return Response(serializer.data)

        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        conversation = serializer.save(created_by=request.user)

        serializer = self.get_serializer(conversation)

        return Response(serializer.data, status=status.HTTP_201_CREATED)

    # ===============================
    # ADD MEMBER TO GROUP
    # ===============================

    @action(detail=True, methods=["post"])
    def add_member(self, request, pk=None):

        conversation = self.get_object()
        user_id = request.data.get("user_id")

        if not user_id:
            return Response(
                {"error": "user_id required"},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            user = User.objects.get(id=user_id)
        except User.DoesNotExist:
            return Response(
                {"error": "User not found"},
                status=status.HTTP_404_NOT_FOUND
            )

        # user already member
        if ConversationParticipant.objects.filter(
            conversation=conversation,
            user=user
        ).exists():
            return Response(
                {"error": "User already in group"},
                status=status.HTTP_400_BAD_REQUEST
            )

        ConversationParticipant.objects.create(
            conversation=conversation,
            user=user,
            role="member"
        )

        return Response({"message": "User added"})

    # ===============================
    # REMOVE MEMBER
    # ===============================

    @action(detail=True, methods=["delete"], url_path="remove-member/(?P<user_id>[^/.]+)")
    def remove_member(self, request, pk=None, user_id=None):

        conversation = self.get_object()

        try:
            participant = ConversationParticipant.objects.get(
                conversation=conversation,
                user_id=user_id
            )
        except ConversationParticipant.DoesNotExist:
            return Response(
                {"error": "Participant not found"},
                status=status.HTTP_404_NOT_FOUND
            )

        participant.delete()

        return Response({"message": "User removed"})
    # ===============================
# GET GROUP MEMBERS
# ===============================

    @action(detail=True, methods=["get"])
    def members(self, request, pk=None):

        conversation = self.get_object()

        if conversation.type != Conversation.GROUP:
            return Response(
                {"error": "Members list only available for group chats"},
                status=status.HTTP_400_BAD_REQUEST
            )

        participants = ConversationParticipant.objects.filter(
            conversation=conversation
        ).select_related("user")

        serializer = ConversationParticipantSerializer(participants, many=True)

        return Response(serializer.data)


class ConversationParticipantViewSet(viewsets.ModelViewSet):

    serializer_class = ConversationParticipantSerializer
    permission_classes = [IsAuthenticated]

    queryset = ConversationParticipant.objects.all()

    def get_queryset(self):
        return ConversationParticipant.objects.filter(
            conversation__participants__user=self.request.user
        ).distinct()