import random
import re

from allauth.socialaccount.models import SocialAccount


def assign_username_from_social_account(user):
    """
    First-time Google login: the user has no username yet. Derive one from
    their Google profile name (falling back to the email local-part), and
    disambiguate with a random numeric suffix on collision.
    """
    if user.username:
        return

    try:
        social_account = SocialAccount.objects.get(user=user)
        extra_data = social_account.extra_data

        name = extra_data.get("name", "")
        email = extra_data.get("email", "")

        username = re.sub(r"\W+", "", name).lower()
        if not username:
            username = email.split("@")[0]

        if type(user).objects.filter(username=username).exists():
            username += str(random.randint(1000, 9999))

        user.username = username
        user.save()

    except Exception as e:
        print("Username error:", e)


def clear_avatar(instance):
    if instance.avatar:
        instance.avatar.delete(save=False)
    instance.avatar = None
    instance.save()


def parse_device(user_agent):
    """
    Small, dependency-free User-Agent summary ("Chrome on Windows") — good
    enough to tell sessions apart without pulling in a full UA-parsing lib.
    """
    if not user_agent:
        return "Unknown device"

    ua = user_agent

    if "Windows" in ua:
        os_name = "Windows"
    elif "Mac OS X" in ua or "Macintosh" in ua:
        os_name = "macOS"
    elif "Android" in ua:
        os_name = "Android"
    elif "iPhone" in ua or "iPad" in ua:
        os_name = "iOS"
    elif "Linux" in ua:
        os_name = "Linux"
    else:
        os_name = "Unknown OS"

    if "Edg/" in ua:
        browser = "Edge"
    elif "OPR/" in ua or "Opera" in ua:
        browser = "Opera"
    elif "Chrome/" in ua:
        browser = "Chrome"
    elif "Firefox/" in ua:
        browser = "Firefox"
    elif "Safari/" in ua:
        browser = "Safari"
    else:
        browser = "Unknown browser"

    return f"{browser} on {os_name}"


def get_client_ip(request):
    forwarded = request.META.get("HTTP_X_FORWARDED_FOR")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR")
