import html
import ipaddress
import re
import socket
from urllib.parse import urlparse

import requests

MAX_BYTES = 1 * 1024 * 1024  # 1MB — enough for <head>, avoids downloading huge pages
TIMEOUT = 5
USER_AGENT = "Mozilla/5.0 (compatible; ChatAppLinkPreview/1.0)"

META_TAG_RE = re.compile(
    r"<meta\s+[^>]*?(?:property|name)=[\"'](?P<key>[^\"']+)[\"'][^>]*?content=[\"'](?P<value>[^\"']*)[\"'][^>]*?/?>",
    re.IGNORECASE,
)
TITLE_TAG_RE = re.compile(r"<title[^>]*>(?P<title>.*?)</title>", re.IGNORECASE | re.DOTALL)


class LinkPreviewError(Exception):
    pass


def _assert_public_host(hostname):
    """
    Raises LinkPreviewError if `hostname` resolves to a private, loopback,
    link-local, or otherwise non-public address. This is the SSRF guard —
    without it, a message containing a URL like http://169.254.169.254/ or
    http://localhost:8004/admin/ would make the server fetch its own
    internal/cloud-metadata endpoints on the sender's behalf.
    """
    try:
        addr_info = socket.getaddrinfo(hostname, None)
    except socket.gaierror:
        raise LinkPreviewError("Could not resolve host")

    for family, _, _, _, sockaddr in addr_info:
        ip = ipaddress.ip_address(sockaddr[0])
        if (
            ip.is_private
            or ip.is_loopback
            or ip.is_link_local
            or ip.is_reserved
            or ip.is_multicast
            or ip.is_unspecified
        ):
            raise LinkPreviewError("Refusing to fetch a non-public address")


def fetch_link_preview(url):
    parsed = urlparse(url)

    if parsed.scheme not in ("http", "https"):
        raise LinkPreviewError("Only http/https URLs are supported")

    if not parsed.hostname:
        raise LinkPreviewError("Invalid URL")

    _assert_public_host(parsed.hostname)

    try:
        response = requests.get(
            url,
            timeout=TIMEOUT,
            headers={"User-Agent": USER_AGENT},
            stream=True,
            allow_redirects=True,
        )
    except requests.RequestException:
        raise LinkPreviewError("Failed to fetch URL")

    # A redirect could land on a private address even if the original host
    # was public — re-check the final URL's host too.
    final_host = urlparse(response.url).hostname
    if final_host and final_host != parsed.hostname:
        _assert_public_host(final_host)

    content_type = response.headers.get("Content-Type", "")
    if "text/html" not in content_type:
        response.close()
        raise LinkPreviewError("URL does not point to an HTML page")

    chunks = []
    total = 0
    for chunk in response.iter_content(chunk_size=8192):
        chunks.append(chunk)
        total += len(chunk)
        if total >= MAX_BYTES:
            break
    response.close()

    html_text = b"".join(chunks).decode("utf-8", errors="ignore")

    meta = {}
    for match in META_TAG_RE.finditer(html_text):
        meta[match.group("key").lower()] = match.group("value")

    title = meta.get("og:title") or meta.get("twitter:title")
    if not title:
        title_match = TITLE_TAG_RE.search(html_text)
        title = title_match.group("title").strip() if title_match else None

    description = meta.get("og:description") or meta.get("twitter:description") or meta.get("description")
    image = meta.get("og:image") or meta.get("twitter:image")
    site_name = meta.get("og:site_name")

    if not title:
        raise LinkPreviewError("No preview metadata found")

    return {
        "url": url,
        "title": html.unescape(title)[:200],
        "description": html.unescape(description or "")[:300],
        "image": html.unescape(image) if image else None,
        "site_name": html.unescape(site_name) if site_name else None,
    }
