from rest_framework import serializers

class SuggestReplySerializer(serializers.Serializer):
    messages = serializers.ListField(
        child=serializers.CharField(),
        min_length=1
    )

class ChatSummarySerializer(serializers.Serializer):
    messages = serializers.ListField(
        child=serializers.CharField(),
        min_length=1
    )

class TranslateSerializer(serializers.Serializer):
    message = serializers.CharField(max_length=1000)
    target_language = serializers.CharField(max_length=20)

    def validate_message(self, value):
        if len(value.strip()) < 1:
            raise serializers.ValidationError(
                "Xabar bo'sh bo'lishi mumkin emas."
            )

        if len(value) > 1000:
            raise serializers.ValidationError(
                "Xabar 1000 belgidan oshmasligi kerak."
            )

        return value
    

class GrammarFixSerializer(serializers.Serializer):
    message = serializers.CharField(max_length=1000)

class ChatSearchSerializer(serializers.Serializer):
    messages = serializers.ListField(
        child=serializers.CharField(),
        min_length=1
    )
    question = serializers.CharField(max_length=500)

    def validate_question(self, value):
        if len(value.strip()) < 1:
            raise serializers.ValidationError(
                "Savol bo'sh bo'lishi mumkin emas."
            )
        return value


class RewriteSerializer(serializers.Serializer):
    message = serializers.CharField(max_length=1000)
    tone = serializers.ChoiceField(
        choices=[
            "professional",
            "friendly",
            "formal",
            "polite"
        ]
    )