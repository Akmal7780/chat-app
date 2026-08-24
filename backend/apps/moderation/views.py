from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAdminUser
from rest_framework.response import Response

from apps.conversations.models import ConversationReport
from apps.messaging.models import BannedWord, MessageReport
from apps.messaging import services as messaging_services


def _message_report_data(r):
    message = r.message
    return {
        "id": r.id,
        "kind": "message",
        "reason": r.reason,
        "resolved": r.resolved,
        "created_at": r.created_at,
        "reporter": {"id": r.reporter_id, "username": r.reporter.username},
        "message": {
            "id": message.id,
            "content": message.content,
            "is_deleted": message.is_deleted,
            "sender": message.sender.username,
            "conversation_id": message.conversation_id,
        },
    }


def _conversation_report_data(r):
    conv = r.conversation
    return {
        "id": r.id,
        "kind": "conversation",
        "reason": r.reason,
        "resolved": r.resolved,
        "created_at": r.created_at,
        "reporter": {"id": r.reporter_id, "username": r.reporter.username},
        "conversation": {
            "id": conv.id,
            "name": conv.name,
            "type": conv.type,
        },
    }


@api_view(["GET"])
@permission_classes([IsAdminUser])
def reports_list(request):
    show_resolved = request.GET.get("resolved") == "1"

    message_reports = MessageReport.objects.filter(
        resolved=show_resolved
    ).select_related("reporter", "message__sender").order_by("-created_at")[:100]

    conversation_reports = ConversationReport.objects.filter(
        resolved=show_resolved
    ).select_related("reporter", "conversation").order_by("-created_at")[:100]

    results = [_message_report_data(r) for r in message_reports] + \
              [_conversation_report_data(r) for r in conversation_reports]
    results.sort(key=lambda r: r["created_at"], reverse=True)

    return Response(results)


@api_view(["POST"])
@permission_classes([IsAdminUser])
def resolve_message_report(request, report_id):
    updated = MessageReport.objects.filter(id=report_id).update(resolved=True)
    if not updated:
        return Response({"error": "Not found"}, status=status.HTTP_404_NOT_FOUND)
    return Response({"resolved": True})


@api_view(["POST"])
@permission_classes([IsAdminUser])
def resolve_conversation_report(request, report_id):
    updated = ConversationReport.objects.filter(id=report_id).update(resolved=True)
    if not updated:
        return Response({"error": "Not found"}, status=status.HTTP_404_NOT_FOUND)
    return Response({"resolved": True})


@api_view(["POST"])
@permission_classes([IsAdminUser])
def delete_reported_message(request, report_id):
    try:
        report = MessageReport.objects.select_related("message").get(id=report_id)
    except MessageReport.DoesNotExist:
        return Response({"error": "Not found"}, status=status.HTTP_404_NOT_FOUND)

    messaging_services.moderator_delete_message(report.message)
    report.resolved = True
    report.save(update_fields=["resolved"])
    return Response({"deleted": True, "resolved": True})


@api_view(["GET", "POST"])
@permission_classes([IsAdminUser])
def banned_words(request):
    if request.method == "GET":
        words = BannedWord.objects.select_related("added_by").order_by("word")
        return Response([
            {"id": w.id, "word": w.word, "added_by": w.added_by.username if w.added_by else None,
             "created_at": w.created_at}
            for w in words
        ])

    word = (request.data.get("word") or "").strip().lower()
    if not word:
        return Response({"error": "word is required"}, status=status.HTTP_400_BAD_REQUEST)

    obj, created = BannedWord.objects.get_or_create(word=word, defaults={"added_by": request.user})
    if not created:
        return Response({"error": "Already banned"}, status=status.HTTP_400_BAD_REQUEST)
    return Response(
        {"id": obj.id, "word": obj.word, "added_by": request.user.username, "created_at": obj.created_at},
        status=status.HTTP_201_CREATED,
    )


@api_view(["DELETE"])
@permission_classes([IsAdminUser])
def delete_banned_word(request, word_id):
    deleted, _ = BannedWord.objects.filter(id=word_id).delete()
    if not deleted:
        return Response({"error": "Not found"}, status=status.HTTP_404_NOT_FOUND)
    return Response(status=status.HTTP_204_NO_CONTENT)
