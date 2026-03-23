from django.shortcuts import render

from rest_framework.decorators import api_view
from rest_framework.response import Response
from .models import Notification

@api_view(["POST"])
def mark_as_read(request):
    conversation_id = request.data.get("conversation_id")

    Notification.objects.filter(
        user=request.user,
        message__conversation_id=conversation_id,
        is_read=False
    ).update(is_read=True)

    return Response({"status": "ok"})
