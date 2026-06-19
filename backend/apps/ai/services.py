from openai import OpenAI
from django.conf import settings

client = OpenAI(
    api_key=settings.DEEPSEEK_API_KEY,
    base_url="https://api.deepseek.com"
)


def generate_reply(messages: list[str]):
    try:
        conversation = "\n".join(messages)

        response = client.chat.completions.create(
            model="deepseek-chat",
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are a smart chat reply assistant. "
                        "Read the conversation and generate the most natural next reply. "
                        "Maximum 15 words. "
                        "One sentence only. "
                        "Return only the reply."
                    )
                },
                {
                    "role": "user",
                    "content": conversation
                }
            ],
            max_tokens=40,
            temperature=0.7
        )

        return response.choices[0].message.content.strip()

    except Exception as e:
        return f"AI Error: {str(e)}"


def summarize_chat(messages: list[str]):
    try:
        conversation = "\n".join(messages)

        response = client.chat.completions.create(
            model="deepseek-chat",
            messages=[
                {
                    "role": "system",
                    "content": (
                        "Summarize this conversation in 3-4 short sentences. "
                        "Focus only on the important points."
                    )
                },
                {
                    "role": "user",
                    "content": conversation
                }
            ],
            max_tokens=150,
            temperature=0.3
        )

        return response.choices[0].message.content.strip()

    except Exception as e:
        return f"AI Error: {str(e)}"

def translate_message(message: str, target_language: str):
    try:
        if len(message) > 1000:
            return "AI Error: Message is too long."

        response = client.chat.completions.create(
            model="deepseek-chat",
            messages=[
                {
                    "role": "system",
                    "content": (
                        f"Translate the text into {target_language}. "
                        "Return only the translated text. "
                        "Do not add explanations."
                    )
                },
                {
                    "role": "user",
                    "content": message
                }
            ],
            max_tokens=300,
            temperature=0
        )

        return response.choices[0].message.content.strip()

    except Exception as e:
        return f"AI Error: {str(e)}"


def grammar_fix(message: str):
    try:
        if len(message) > 1000:
            return "AI Error: Message is too long."

        response = client.chat.completions.create(
            model="deepseek-chat",
            messages=[
                {
                    "role": "system",
                    "content": (
                        "Correct grammar, spelling, and punctuation mistakes. "
                        "Keep the original meaning. "
                        "Return only the corrected text."
                    )
                },
                {
                    "role": "user",
                    "content": message
                }
            ],
            max_tokens=300,
            temperature=0
        )

        return response.choices[0].message.content.strip()

    except Exception as e:
        return f"AI Error: {str(e)}"


def rewrite_message(message: str, tone: str):
    try:
        if len(message) > 1000:
            return "AI Error: Message is too long."

        response = client.chat.completions.create(
            model="deepseek-chat",
            messages=[
                {
                    "role": "system",
                    "content": (
                        f"Rewrite the message in a {tone} tone. "
                        "Detect the language of the original message automatically. "
                        "Return the rewritten text in the SAME language as the input. "
                        "Keep the original meaning. "
                        "Return only the rewritten text."
                    )
                },
                {
                    "role": "user",
                    "content": message
                }
            ],
            max_tokens=200,
            temperature=0.7
        )

        return response.choices[0].message.content.strip()

    except Exception as e:
        return f"AI Error: {str(e)}"

def search_chat(messages: list[str], question: str):
    try:
        conversation = "\n".join(messages)

        response = client.chat.completions.create(
            model="deepseek-chat",
            messages=[
                {
                    "role": "system",
                    "content": (
                        "Answer the user's question using ONLY the conversation. "
                        "If the answer is not found, say: "
                        "'Information not found in the conversation.'"
                    )
                },
                {
                    "role": "user",
                    "content": (
                        f"Conversation:\n{conversation}\n\n"
                        f"Question:\n{question}"
                    )
                }
            ],
            max_tokens=200,
            temperature=0
        )

        return response.choices[0].message.content.strip()

    except Exception as e:
        return f"AI Error: {str(e)}"