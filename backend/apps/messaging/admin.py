from django.contrib import admin
from .models import (
    Message,
    MessageRead,
    TypingIndicator,
    Notification,
    Attachment
)


admin.site.register(Message)
admin.site.register(MessageRead)
admin.site.register(TypingIndicator)
admin.site.register(Notification)
admin.site.register(Attachment)