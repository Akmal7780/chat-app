from django.contrib import admin
from .models import (
    Message,
    MessageRead,
    TypingIndicator,
    Attachment,
    MessageReport,
    BannedWord,
)


admin.site.register(Message)
admin.site.register(MessageRead)
admin.site.register(TypingIndicator)
admin.site.register(Attachment)


@admin.register(MessageReport)
class MessageReportAdmin(admin.ModelAdmin):
    list_display = ("id", "message", "reporter", "resolved", "created_at")
    list_filter = ("resolved",)
    readonly_fields = ("message", "reporter", "reason", "created_at")


@admin.register(BannedWord)
class BannedWordAdmin(admin.ModelAdmin):
    list_display = ("word", "added_by", "created_at")