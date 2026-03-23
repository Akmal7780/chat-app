import json
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async
from django.utils import timezone
from django.contrib.auth import get_user_model
from apps.notifications.models import Notification

from apps.messaging.models import Message, MessageRead
from apps.conversations.models import Conversation,ConversationParticipant
User = get_user_model()
ONLINE_USERS = set()
ACTIVE_USERS = {}  
class ChatConsumer(AsyncWebsocketConsumer):

    async def connect(self):

        # Get current user
        self.user = self.scope.get("user")
        print(f"👤 WebSocket user: {self.user}")

        # If the user is not authenticated
        if not self.user or not self.user.is_authenticated:
            print("❌ User not authenticated. Closing socket.")
            await self.close(code=4001)
            return

        self.conversation_id = self.scope["url_route"]["kwargs"]["conversation_id"]
        self.room_group_name = f"chat_{self.conversation_id}"

        print(f"🔗 Joining room: {self.room_group_name}")

        # Check if the conversation exists
        if not await self.conversation_exists():
            print("❌ Conversation does not exist")
            await self.close(code=4004)
            return

        # Check if the user is a participant in the conversation
        if not await self.is_participant():
            print("❌ User is not a participant of this conversation")
            await self.close(code=4003)
            return

        # Join the room
        await self.channel_layer.group_add(
            self.room_group_name,
            self.channel_name
        )

        await self.accept()
        print("✅ WebSocket connected")
        await self.channel_layer.group_add(
            "online_users",
            self.channel_name
        )
        ONLINE_USERS.add(self.user.id)

        await self.channel_layer.group_send(
            "online_users",
            {
                "type": "online_users_list",
                "users": list(ONLINE_USERS)
            }
        )

        # Mark undelivered messages as delivered
        message_ids = await self.mark_messages_delivered()

        for message_id in message_ids:
            await self.channel_layer.group_send(
                self.room_group_name,
                {
                    "type": "message_delivered",
                    "message_id": message_id,
                    "user_id": self.user.id,
                    "delivered_at": str(timezone.now())
                }
            )

    async def disconnect(self, close_code):

        print(f"🔌 WebSocket disconnected: {close_code}")
        ONLINE_USERS.discard(self.user.id)

        await self.channel_layer.group_send(
            "online_users",
            {
                "type": "online_users_list",
                "users": list(ONLINE_USERS)
            }
        )


        await self.update_last_seen()

        await self.channel_layer.group_discard(
        "online_users",
        self.channel_name
        )   

        await self.channel_layer.group_discard(
        self.room_group_name,
        self.channel_name
    )



    async def receive(self, text_data):

        print("📩 Received raw:", text_data)

        try:
            data = json.loads(text_data)
            event_type = data.get("type")
            allowed = {
            "message", "typing_start", "typing_stop",
            "read", "delivered", "edit_message", "delete_message",
            "active_chat"
            }
            if event_type not in allowed:
                return

            # MESSAGE SEND
            if event_type == "message":

                message_text = data.get("message")
                reply_to_id = data.get("reply_to")
                print("💬 New message:", message_text)

                message = await self.save_message(message_text, reply_to_id)

                # 🔥 NOTIFICATION LOGIC
                participants = await self.get_participants()

                for user_id in participants:

                    if user_id == self.user.id:
                        continue

                    active_conversation = ACTIVE_USERS.get(user_id)

                    if active_conversation != int(self.conversation_id):

                        await self.create_notification(user_id, message.id)

                        await self.channel_layer.group_send(
                            f"notifications_{user_id}",
                            {
                                "type": "send_notification",
                                "message_id": message.id,
                                "conversation_id": self.conversation_id,
                                "sender": self.user.username,
                                "message": message.content,
                            }
                        )

                attachments = await self.get_attachments(message.id)
                reply_data = None
                if reply_to_id:
                    reply_data = await self.get_reply_data(reply_to_id)
            
                await self.channel_layer.group_send(
                    self.room_group_name,
                    {
                        "type": "message",
                        "message": message.content,
                        "sender": self.user.username,
                        "sender_id": self.user.id,
                        "message_id": message.id,
                        "created_at": str(message.created_at),
                        "attachments": attachments,  
                        "reply_to": reply_data,
                        "status": "sent"
                    }
                )

                # Send delivered event to other participants
                await self.channel_layer.group_send(
                    self.room_group_name,
                    {
                        "type": "message_delivered",
                        "message_id": message.id,
                        "user_id": self.user.id,
                        "delivered_at": str(timezone.now())
                    }
                )

            # TYPING START
            elif event_type == "typing_start":

                await self.channel_layer.group_send(
                    self.room_group_name,
                    {
                        "type": "typing_start_event",
                        "user_id": self.user.id,
                        "username": self.user.username
                    }
                )


            # TYPING STOP
            elif event_type == "typing_stop":

                await self.channel_layer.group_send(
                    self.room_group_name,
                    {
                        "type": "typing_stop_event",
                        "user_id": self.user.id,
                        "username": self.user.username
                    }
                )
            
            elif event_type == "active_chat":
                ACTIVE_USERS[self.user.id] = data.get("conversation_id")

            # MESSAGE READ
            elif event_type == "read":

                message_id = data.get("message_id")
                print("👁 Message read:", message_id)

                read_receipt = await self.mark_message_read(message_id)

                if read_receipt:
                    await self.channel_layer.group_send(
                        self.room_group_name,
                        {
                            "type": "message_read",
                            "message_id": message_id,
                            "user_id": self.user.id,
                            "username": self.user.username,
                            "read_at": str(read_receipt.read_at)
                        }
                    )

            # DELIVERED 
            elif event_type == "delivered":

                message_id = data.get("message_id")
                print("✅ Message delivered:", message_id)

                await self.channel_layer.group_send(
                    self.room_group_name,
                    {
                        "type": "message_delivered",
                        "message_id": message_id,
                        "user_id": self.user.id,
                        "delivered_at": str(timezone.now())
                    }
                )
            # 🔥 MESSAGE EDIT
            elif event_type == "edit_message":

                message_id = data.get("message_id")
                new_text = data.get("text")

                if not message_id:
                    return

                if not new_text or not new_text.strip():
                    return

                new_text = new_text.strip()

                message = await self.get_message(message_id)

                if not message:
                    return

                if message.is_deleted:
                    return

                if message.sender_id == self.user.id:

                    message.content = new_text
                    message.is_edited = True
                    await database_sync_to_async(message.save)(
                        update_fields=["content", "is_edited"]
                    )

                    await self.channel_layer.group_send(
                        self.room_group_name,
                        {
                            "type": "message_edited",
                            "message_id": message.id,
                            "content": message.content,
                            "is_edited": message.is_edited,
                        }
                    )
              #Message Delete  
            elif event_type == "delete_message":
                message_id = data.get("message_id")

                if not message_id:
                    return

                message = await self.get_message(message_id)

                if not message:
                    return

                if message.sender_id != self.user.id:
                    return
                if message.is_deleted:   
                    return

                success = await self.delete_message(message_id)

                if success:
                    await self.channel_layer.group_send(
                        self.room_group_name,
                        {
                            "type": "message_deleted",
                            "message_id": message_id,
                        }
                    )
        except json.JSONDecodeError:
            print("❌ Invalid JSON received")
        except Exception as e:
            print(f"❌ Error in receive: {e}")

    # MESSAGE EVENT
    async def message(self, event):

        print("📤 Sending message to client:", event)

        await self.send(text_data=json.dumps({
            "type": "message",
            "message": event.get("message"),
            "sender": event["sender"],
            "sender_id": event["sender_id"],
            "message_id": event["message_id"],
            "created_at": event["created_at"],
            "attachments": event.get("attachments", []), 
            "reply_to": event.get("reply_to"),
            "status": event.get("status", "sent")
        }))

    # TYPING EVENT
    async def typing_start_event(self, event):
        if event["user_id"] == self.user.id:
            return


        await self.send(text_data=json.dumps({
        "type": "typing_start",
        "user_id": event["user_id"],
        "username": event["username"]
    }))
    
    # 🔥 EDIT EVENT
    async def message_edited(self, event):
        await self.send(text_data=json.dumps({
            "type": "message_edited",
            "message_id": event["message_id"],
            "content": event["content"],
            "is_edited": event["is_edited"],
        }))


    async def typing_stop_event(self, event):
        if event["user_id"] == self.user.id:
            return

        await self.send(text_data=json.dumps({
            "type": "typing_stop",
            "user_id": event["user_id"],
            "username": event["username"]
        }))

    # READ EVENT
    async def message_read(self, event):
       
        if event["user_id"] == self.user.id:
            return

        print(f"👁 Sending read receipt: message {event['message_id']} read by {event['username']}")

        await self.send(text_data=json.dumps({
            "type": "read",
            "message_id": event["message_id"],
            "user_id": event["user_id"],
            "username": event["username"],
            "read_at": event["read_at"]
        }))

    # DELIVERED EVENT
    async def message_delivered(self, event):
        
        if event["user_id"] == self.user.id:
            return

        print(f"✅ Sending delivered receipt: message {event['message_id']}")

        await self.send(text_data=json.dumps({
            "type": "delivered",
            "message_id": event["message_id"],
            "user_id": event["user_id"],
            "delivered_at": event["delivered_at"]
        }))
    # 🔥 REACTION EVENT 
    async def reaction(self, event):
        await self.send(text_data=json.dumps({
            "type": "reaction",
            "action": event["action"],  # added / removed
            "message_id": event["message_id"],
            "user_id": event.get("user_id"),
            "emoji": event.get("emoji"),
            "reaction": event.get("reaction"),
        }))
    
    async def online_users_list(self, event):

        await self.send(text_data=json.dumps({
            "type": "online_users_list",
            "users": event["users"]
        }))

    async def user_online(self, event):
        if event["user_id"] == self.user.id:
            return

        await self.send(text_data=json.dumps({
            "type": "user_online",
            "user_id": event["user_id"],
            "username": event["username"]
        }))
    async def user_offline(self, event):
        if event["user_id"] == self.user.id:
            return

        await self.send(text_data=json.dumps({
            "type": "user_offline",
            "user_id": event["user_id"],
            "username": event["username"]
        }))
        
    async def message_deleted(self, event):
        await self.send(text_data=json.dumps({
            "type": "message_deleted",
            "message_id": event["message_id"]
        }))
    @database_sync_to_async
    def conversation_exists(self):
        """Check if conversation exists"""
        try:
            return Conversation.objects.filter(id=self.conversation_id).exists()
        except:
            return False

    @database_sync_to_async
    def is_participant(self):
        try:
            return ConversationParticipant.objects.filter(
            conversation_id=self.conversation_id,
            user=self.user
        ).exists()
        except:
            return False

    @database_sync_to_async
    def save_message(self, message_text, reply_to_id=None):
        """Save message to database (with reply)"""

        conversation = Conversation.objects.get(id=self.conversation_id)

        reply_to = None

        if reply_to_id:
            try:
                reply_to = Message.objects.get(
                    id=reply_to_id,
                    conversation=conversation  
                )
            except Message.DoesNotExist:
                reply_to = None

        message = Message.objects.create(
            conversation=conversation,
            sender=self.user,
            message_type="text",
            content=message_text,
            reply_to=reply_to  
        )


        print("💾 Message saved:", message.id, "reply_to:", reply_to_id)
        return message
    
    @database_sync_to_async
    def get_reply_data(self, message_id):
        if not message_id:
            return None

        try:
            msg = Message.objects.get(
                id=message_id,
                conversation_id=self.conversation_id
            )

            return {
                "id": msg.id,
                "content": msg.content if not msg.is_deleted else "Deleted message",
                "sender": msg.sender.username,
                "sender_id": msg.sender.id,       
                "is_deleted": msg.is_deleted     
            }
        except Message.DoesNotExist:
            return None

    @database_sync_to_async
    def mark_message_read(self, message_id):
        """Mark message as read"""
        try:
            message = Message.objects.get(id=message_id)
            
            if message.sender == self.user:
                return None

            read_receipt, created = MessageRead.objects.get_or_create(
                message=message,
                user=self.user,
                defaults={'read_at': timezone.now()}
            )

            if not created:
                return None

            print(f"👁 Message {message_id} marked as read by {self.user.username}")
            return read_receipt

        except Message.DoesNotExist:
            print(f"❌ Message {message_id} does not exist")
            return None
        except Exception as e:
            print(f"❌ Error marking message as read: {e}")
            return None

    @database_sync_to_async
    def mark_messages_delivered(self):
        try:
            messages = Message.objects.filter(
            conversation_id=self.conversation_id
        ).exclude(
            sender=self.user
        ).exclude(
            read_receipts__user=self.user
        )

            return list(messages.values_list("id", flat=True))

        except Exception as e:
            print(f"❌ Error marking messages as delivered: {e}")
            return []
    
    @database_sync_to_async
    def delete_message(self, message_id):
        try:
            msg = Message.objects.get(id=message_id)

            if msg.is_deleted:
                return False

            msg.is_deleted = True
            msg.content = ""
            msg.save(update_fields=["is_deleted", "content"])
            return True

        except Message.DoesNotExist:
            return False

    @database_sync_to_async
    def update_last_seen(self):
        try:
            user = User.objects.get(id=self.user.id)
            user.last_seen = timezone.now()
            user.save(update_fields=["last_seen"])
            print(f"⏱ Last seen updated for {user.username}")
        except Exception as e:
            print("❌ Last seen error:", e)
    
    @database_sync_to_async
    def get_message(self, message_id):
        try:
            return Message.objects.get(id=message_id)
        except Message.DoesNotExist:
            return None


    @database_sync_to_async
    def get_attachments(self, message_id):

        from apps.messaging.models import Attachment

        attachments = Attachment.objects.filter(message_id=message_id)

        return [
            {
                "file_url": f"http://127.0.0.1:8000{att.file.url}",
                "file_type": att.file_type,
                "file_size": att.file_size
            }
            for att in attachments
        ]
    
    @database_sync_to_async
    def get_participants(self):
        return list(
            ConversationParticipant.objects.filter(
                conversation_id=self.conversation_id
            ).values_list("user_id", flat=True)
        )
    
    @database_sync_to_async
    def create_notification(self, user_id, message_id):
        try:
            Notification.objects.create(
                user_id=user_id,
                message_id=message_id
            )
        except Exception as e:
            print("❌ Notification error:", e)