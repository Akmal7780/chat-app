from rest_framework import viewsets, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.parsers import MultiPartParser, FormParser,JSONParser
from rest_framework.decorators import action
from rest_framework.response import Response

from channels.layers import get_channel_layer
from asgiref.sync import async_to_sync

from .models import Message, Attachment, Reaction
from .serializers import MessageSerializer
from apps.conversations.models import ConversationParticipant


class MessageViewSet(viewsets.ModelViewSet):
    serializer_class = MessageSerializer
    permission_classes = [IsAuthenticated]
    parser_classes = (MultiPartParser, FormParser,JSONParser)

    def get_queryset(self):
        # DETAIL request 
        if self.kwargs.get("pk"):
            return Message.objects.filter(
                conversation__participants__user=self.request.user,
                conversation__participants__left_at__isnull=True
            ).distinct()

        # LIST request
        conversation_id = self.request.query_params.get("conversation")

        if not conversation_id:
            return Message.objects.none()

        is_participant = ConversationParticipant.objects.filter(
            conversation_id=conversation_id,
            user=self.request.user,
            left_at__isnull=True
        ).exists()

        if not is_participant:
            return Message.objects.none()

        return Message.objects.filter(
            conversation_id=conversation_id
        ).order_by("created_at")

    # ✅ MESSAGE CREATE + WEBSOCKET
    def perform_create(self, serializer):
        message = serializer.save(sender=self.request.user)

        file = self.request.FILES.get("file")
        attachment = None

        if file:
            if file.content_type.startswith("image"):
                file_type = "image"
            elif file.content_type.startswith("video"):
                file_type = "video"
            else:
                file_type = "file"

            attachment = Attachment.objects.create(
                message=message,
                file=file,
                file_type=file_type,
                file_size=file.size
            )
        reply = message.reply_to

        reply_data = None
        if reply:
            reply_data = {
                "id": reply.id,
                "content": reply.content if not reply.is_deleted else "Deleted message",
                "sender": reply.sender.username,
                "sender_id": reply.sender.id,
                "is_deleted": reply.is_deleted
            }
        channel_layer = get_channel_layer()

        async_to_sync(channel_layer.group_send)(
            f"chat_{message.conversation_id}",
            {
                "type": "message",   
                "message_id": message.id,
                "sender_id": message.sender_id,
                "sender": message.sender.username,
                "message": message.content,
                "created_at": message.created_at.isoformat(),
                "attachments": [
                    {
                        "file_url": f"http://127.0.0.1:8000{attachment.file.url}",
                        "file_type": attachment.file_type,
                    }
                ] if attachment else [],
                "reply_to": reply_data,
            }
        )

            

    # ✅ ADD / TOGGLE REACTION
    @action(detail=True, methods=["post"], url_path="reactions")
    def reactions(self, request, pk=None):
        message = self.get_object()
        emoji = request.data.get("emoji")
        if message.sender == request.user:
            return Response(
                    {"error": "Cannot react to your own message"},
                    status=status.HTTP_400_BAD_REQUEST
                )
        
        if not emoji or emoji in ["undefined", "null", ""]:
            return Response(
                {"error": "Valid emoji is required"},
                status=status.HTTP_400_BAD_REQUEST
            )

        channel_layer = get_channel_layer()

        # 🔴 Old reaction 
        old_reaction = Reaction.objects.filter(
            message=message,
            user=request.user
        ).first()

        if old_reaction:
            if old_reaction.emoji == emoji:
                old_reaction.delete()

                async_to_sync(channel_layer.group_send)(
                    f"chat_{message.conversation_id}",
                    {
                        "type": "reaction",  
                        "action": "removed",
                        "message_id": message.id,
                        "user_id": request.user.id,
                        "emoji": emoji,
                    }
                )

                return Response({"removed": True})

            old_emoji = old_reaction.emoji
            old_reaction.delete()

            async_to_sync(channel_layer.group_send)(
                f"chat_{message.conversation_id}",
                {
                    "type": "reaction",  
                    "action": "removed",
                    "message_id": message.id,
                    "user_id": request.user.id,
                    "emoji": old_emoji,
                }
            )

        reaction = Reaction.objects.create(
            message=message,
            user=request.user,
            emoji=emoji
        )

        reaction_data = {
            "id": reaction.id,
            "emoji": reaction.emoji,
            "user_id": request.user.id,
            "username": request.user.username
        }
        
        print(f"🔥 Sending reaction: {reaction_data}")  # Debug

        async_to_sync(channel_layer.group_send)(
            f"chat_{message.conversation_id}",
            {
                "type": "reaction",  
                "action": "added",
                "message_id": message.id,
                "user_id": request.user.id,
                "reaction": reaction_data
            }
        )

        return Response(reaction_data)


    # ✅ DELETE REACTION
    @action(detail=True, methods=["delete"], url_path="reactions/(?P<reaction_id>[^/.]+)")
    def delete_reaction(self, request, pk=None, reaction_id=None):
        try:
            if isinstance(reaction_id, str) and reaction_id.startswith('temp_'):
                return Response(
                    {"error": "Invalid reaction ID"}, 
                    status=status.HTTP_400_BAD_REQUEST
                )
                
            reaction = Reaction.objects.get(
                id=reaction_id,
                user=request.user,
                message_id=pk
            )

            message = reaction.message
            emoji = reaction.emoji
            

            reaction.delete()

            channel_layer = get_channel_layer()
            async_to_sync(channel_layer.group_send)(
                f"chat_{message.conversation_id}",
                {
                    "type": "reaction", 
                    "action": "removed",
                    "message_id": message.id,
                    "user_id": request.user.id,
                    "emoji": emoji,
                }
            )

            return Response({"deleted": True}, status=status.HTTP_200_OK)

        except Reaction.DoesNotExist:
            return Response(
                {"error": "Reaction not found"},
                status=status.HTTP_404_NOT_FOUND
            )
    def get_serializer_context(self):
        context = super().get_serializer_context()
        context["request"] = self.request
        return context