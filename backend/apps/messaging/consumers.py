import asyncio
import json
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async
from django.utils import timezone
from django.contrib.auth import get_user_model
from apps.notifications.services import notify_conversation_participants
from apps.messaging.serializers import MessageSerializer
from apps.messaging.models import Message, MessageRead
from apps.conversations.models import Conversation,ConversationParticipant
from apps.users.models import UserPresence   
import time
import redis

redis_client = redis.Redis(
    host="127.0.0.1",
    port=6379,
    db=0,
    decode_responses=True
)
User = get_user_model()
ONLINE_USERS = set()
ACTIVE_USERS = {}  
USER_CONNECTION_COUNT = {}  
class ChatConsumer(AsyncWebsocketConsumer):
    def is_rate_limited(self, *args, **kwargs):
            return False

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
        await self.set_user_online()
        
        await self.channel_layer.group_add(
            "online_users",
            self.channel_name
        )
        # ✅ CONNECTION COUNT 
        USER_CONNECTION_COUNT[self.user.id] = USER_CONNECTION_COUNT.get(self.user.id, 0) + 1
        ONLINE_USERS.add(self.user.id)
        
        await self.channel_layer.group_send(
            "online_users",
            {
                "type": "user_online",
                "user_id": self.user.id,
                "username": self.user.username
            }
        )

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
       # ✅ CONNECTION COUNT 
        USER_CONNECTION_COUNT[self.user.id] = USER_CONNECTION_COUNT.get(self.user.id, 1) - 1
        
        # ✅ Offline only when all connections are closed
        if USER_CONNECTION_COUNT.get(self.user.id, 0) <= 0:
            USER_CONNECTION_COUNT.pop(self.user.id, None)
            ONLINE_USERS.discard(self.user.id)
            
            await self.update_last_seen()  
            now = timezone.now()
            await self.channel_layer.group_send("online_users", {
                "type": "user_offline",
                "user_id": self.user.id,
                "username": self.user.username,
                "last_seen": str(now)
            })
            await self.channel_layer.group_send("online_users", {
                "type": "online_users_list",
                "users": list(ONLINE_USERS)
            })

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
            "active_chat", "pin_message", "unpin_message", "forward_message"
            }
            if event_type not in allowed:
                return

            # MESSAGE SEND
            if event_type == "message":
                if await self.is_blocked_in_conversation():
                    await self.send(text_data=json.dumps({
                        "type": "error",
                        "message": "You cannot message this user."
                    }))
                    return

                # 🔥 RATE LIMIT CHECK
                if self.is_rate_limited(self.user.id, self.conversation_id):
                    await self.send(text_data=json.dumps({
                        "type": "error",
                        "message": "Too many messages. Slow down."
                    }))
                    return
                temp_id = data.get("temp_id")
                message_text = data.get("message")
                reply_to_id = data.get("reply_to")

                message_type = "text"

                message = await self.save_message(message_text, reply_to_id, message_type)

                serialized_message = await database_sync_to_async(
                    lambda: MessageSerializer(message, context={"request": None}).data
                )()
                serialized_message["temp_id"] = temp_id

                # =========================
                # IMAGE (for notification)
                # =========================
                image = None
                if serialized_message.get("attachments"):
                    first = serialized_message["attachments"][0]
                    if first["file_type"] == "image":
                        image = first["file_url"]

                # =========================
                # WEBSOCKET MESSAGE
                # =========================
                await self.channel_layer.group_send(
                    self.room_group_name,
                    {
                        "type": "message",
                        "message": serialized_message
                    }
                )

                import asyncio

                asyncio.create_task(
                    self.send_notifications_background(message)
                )

                # =========================
                # DELIVERED
                # =========================
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

            # 📌 PIN / UNPIN MESSAGE
            elif event_type in ("pin_message", "unpin_message"):
                message_id = data.get("message_id")
                if not message_id:
                    return

                pinned = event_type == "pin_message"
                message = await self.set_message_pinned(message_id, pinned)

                if message:
                    await self.channel_layer.group_send(
                        self.room_group_name,
                        {
                            "type": "message_pin_changed",
                            "message_id": message.id,
                            "is_pinned": pinned,
                        }
                    )

            # ➡️ FORWARD MESSAGE
            elif event_type == "forward_message":
                message_id = data.get("message_id")
                target_conversation_id = data.get("target_conversation_id")

                if not message_id or not target_conversation_id:
                    return

                if not await self.is_participant_of(target_conversation_id):
                    await self.send(text_data=json.dumps({
                        "type": "forward_result",
                        "success": False,
                        "error": "You are not a participant of that conversation",
                    }))
                    return

                new_message = await self.forward_message(message_id, target_conversation_id)

                if not new_message:
                    await self.send(text_data=json.dumps({
                        "type": "forward_result",
                        "success": False,
                        "error": "Original message not found",
                    }))
                    return

                serialized_message = await database_sync_to_async(
                    lambda: MessageSerializer(new_message, context={"request": None}).data
                )()

                await self.channel_layer.group_send(
                    f"chat_{target_conversation_id}",
                    {
                        "type": "message",
                        "message": serialized_message
                    }
                )

                await self.send(text_data=json.dumps({
                    "type": "forward_result",
                    "success": True,
                    "target_conversation_id": target_conversation_id,
                    "message": serialized_message,
                }))

                asyncio.create_task(
                    self.send_notifications_background_for(new_message, target_conversation_id)
                )
        except json.JSONDecodeError:
            print("❌ Invalid JSON received")
        except Exception as e:
            print(f"❌ Error in receive: {e}")

    # MESSAGE EVENT
    async def message(self, event):
        await self.send(text_data=json.dumps({
            "type": "message",
            "data": event["message"]
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
    
    async def file_infected(self, event):
        await self.send(text_data=json.dumps({
            "type": "file_infected",
            "message_id": event["message_id"],
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
            "username": event["username"],
            "last_seen": event.get("last_seen") 
        }))
        
    async def message_deleted(self, event):
        await self.send(text_data=json.dumps({
            "type": "message_deleted",
            "message_id": event["message_id"]
        }))

    # 📌 PIN/UNPIN EVENT
    async def message_pin_changed(self, event):
        await self.send(text_data=json.dumps({
            "type": "message_pin_changed",
            "message_id": event["message_id"],
            "is_pinned": event["is_pinned"],
        }))

    async def send_notifications_background(self, message):
        await self.send_notifications_background_for(message, self.conversation_id)

    async def send_notifications_background_for(self, message, conversation_id):
        participants = await self.get_participants_of(conversation_id)

        skip_user_ids = {
            user_id for user_id in participants
            if ACTIVE_USERS.get(user_id) == int(conversation_id)
        }

        await database_sync_to_async(notify_conversation_participants)(
            message, skip_user_ids=skip_user_ids
        )

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
    def is_blocked_in_conversation(self):
        """
        For a private conversation, True if either side has blocked the
        other — blocks new messages while leaving existing history visible.
        """
        from django.db.models import Q
        from apps.users.models import BlockedUser

        try:
            conversation = Conversation.objects.get(id=self.conversation_id)
        except Conversation.DoesNotExist:
            return False

        if conversation.type != Conversation.PRIVATE:
            return False

        other = ConversationParticipant.objects.filter(
            conversation=conversation
        ).exclude(user=self.user).first()

        if not other:
            return False

        return BlockedUser.objects.filter(
            Q(user=self.user, blocked_user=other.user) |
            Q(user=other.user, blocked_user=self.user)
        ).exists()

    @database_sync_to_async
    def save_message(self, message_text, reply_to_id=None, message_type="text"):
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
            message_type=message_type,
            content=message_text,
            reply_to=reply_to  
        )

        print("💾 Message saved:", message.id, "reply_to:", reply_to_id)
        return message
    

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
            
            # 🔥 replies fix (optional but recommended)
            msg.replies.update(reply_to=None)
        # 🔥 DELETE REACTIONS
            msg.reactions.all().delete()
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

            presence, _ = UserPresence.objects.get_or_create(user=user)

            presence.last_seen = timezone.now()
            presence.save(update_fields=["last_seen"])

            print(f"⚫ {user.username} OFFLINE at {presence.last_seen}")

        except Exception as e:
            print("❌ Last seen error:", e)
        
    @database_sync_to_async
    def get_message(self, message_id):
        try:
            return Message.objects.get(id=message_id)
        except Message.DoesNotExist:
            return None

    @database_sync_to_async
    def get_participants_of(self, conversation_id):
        return list(
            ConversationParticipant.objects.filter(
                conversation_id=conversation_id
            ).values_list("user_id", flat=True)
        )

    @database_sync_to_async
    def is_participant_of(self, conversation_id):
        try:
            return ConversationParticipant.objects.filter(
                conversation_id=conversation_id,
                user=self.user
            ).exists()
        except Exception:
            return False

    @database_sync_to_async
    def set_message_pinned(self, message_id, pinned):
        try:
            message = Message.objects.get(
                id=message_id,
                conversation_id=self.conversation_id,
                is_deleted=False,
            )
        except Message.DoesNotExist:
            return None

        message.is_pinned = pinned
        message.save(update_fields=["is_pinned"])
        return message

    @database_sync_to_async
    def forward_message(self, message_id, target_conversation_id):
        try:
            original = Message.objects.get(id=message_id, is_deleted=False)
        except Message.DoesNotExist:
            return None

        target_conversation = Conversation.objects.get(id=target_conversation_id)

        return Message.objects.create(
            conversation=target_conversation,
            sender=self.user,
            message_type=original.message_type,
            content=original.content,
            forwarded_from=original,
        )
    
    @database_sync_to_async
    def set_user_online(self):
        try:
            user = User.objects.get(id=self.user.id)

            presence, _ = UserPresence.objects.get_or_create(user=user)

            presence.last_seen = None
            presence.save(update_fields=["last_seen"])

            print(f"🟢 {user.username} is ONLINE")

        except Exception as e:
            print("❌ Online error:", e)