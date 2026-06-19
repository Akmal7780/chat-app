from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import AllowAny

from .serializers import SuggestReplySerializer,ChatSummarySerializer,TranslateSerializer,GrammarFixSerializer,RewriteSerializer
from .services import generate_reply,summarize_chat,translate_message,grammar_fix,rewrite_message


class SuggestReplyAPIView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = SuggestReplySerializer(data=request.data)

        serializer.is_valid(raise_exception=True)

        suggestion = generate_reply(
            serializer.validated_data["messages"]
        )

        return Response(
            {
                "suggestion": suggestion
            },
            status=status.HTTP_200_OK
        )

class ChatSummaryAPIView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = ChatSummarySerializer(
            data=request.data
        )

        serializer.is_valid(raise_exception=True)

        summary = summarize_chat(
            serializer.validated_data["messages"]
        )

        return Response(
            {
                "summary": summary
            },
            status=status.HTTP_200_OK
        )

class TranslateAPIView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = TranslateSerializer(
            data=request.data
        )

        serializer.is_valid(raise_exception=True)

        translated_text = translate_message(
            serializer.validated_data["message"],
            serializer.validated_data["target_language"]
        )

        return Response(
            {
                "translated_text": translated_text
            },
            status=status.HTTP_200_OK
        )

class GrammarFixAPIView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = GrammarFixSerializer(
            data=request.data
        )

        serializer.is_valid(raise_exception=True)

        corrected_text = grammar_fix(
            serializer.validated_data["message"]
        )

        return Response(
            {
                "corrected_text": corrected_text
            },
            status=status.HTTP_200_OK
        )


class RewriteAPIView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = RewriteSerializer(
            data=request.data
        )

        serializer.is_valid(raise_exception=True)

        rewritten_text = rewrite_message(
            serializer.validated_data["message"],
            serializer.validated_data["tone"]
        )

        return Response(
            {
                "rewritten_text": rewritten_text
            },
            status=status.HTTP_200_OK
        )