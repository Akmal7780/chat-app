import requests
from django.conf import settings

TIMEOUT = 5
GIPHY_SEARCH_URL = "https://api.giphy.com/v1/gifs/search"


class GiphyError(Exception):
    pass


def search_gifs(query, limit=24, offset=0):
    if not settings.GIPHY_API_KEY:
        raise GiphyError("GIF search isn't configured (missing GIPHY_API_KEY)")

    if not query:
        return []

    try:
        resp = requests.get(
            GIPHY_SEARCH_URL,
            params={
                "q": query,
                "api_key": settings.GIPHY_API_KEY,
                "limit": min(int(limit), 50),
                "offset": max(int(offset), 0),
                "rating": "pg-13",
            },
            timeout=TIMEOUT,
        )
        resp.raise_for_status()
        data = resp.json()
    except requests.RequestException as e:
        raise GiphyError(f"Giphy request failed: {e}")

    results = []
    for item in data.get("data", []):
        images = item.get("images", {})
        original = images.get("original", {})
        preview = images.get("fixed_width_small") or images.get("preview_gif") or original
        if not original.get("url"):
            continue
        results.append({
            "id": item.get("id"),
            "gif_url": original["url"],
            "preview_url": preview.get("url", original["url"]),
        })

    return results
