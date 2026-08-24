def get_file_type(filename):
    if not filename:
        return "file"

    # 🔥 query params ni olib tashlaymiz
    filename = filename.split("?")[0]

    ext = filename.split(".")[-1].lower()

    if ext in ["jpg", "jpeg", "png", "gif", "webp"]:
        return "image"
    elif ext in ["mp4", "mov", "avi", "webm"]:
        return "video"
    else:
        return "file"


# Executables and script formats that can run code on their own — blocked
# outright regardless of what ClamAV's signature scan finds, since a novel
# (unsigned) executable is exactly the case a signature scanner misses.
# Matches the extension list most mail providers (e.g. Gmail) reject.
DANGEROUS_EXTENSIONS = {
    "exe", "bat", "cmd", "com", "cpl", "scr", "msi", "msix", "msixbundle",
    "msp", "mst", "pif", "hta", "vb", "vbe", "vbs", "vxd", "wsc", "wsf",
    "wsh", "ps1", "ps1xml", "psc1", "psc2", "jse", "js", "jar", "app",
    "gadget", "apk", "appx", "appxbundle", "dmg", "dll", "sys", "lnk",
    "sh", "bin", "run", "iso", "reg",
}


def is_dangerous_extension(filename):
    if not filename:
        return False
    filename = filename.split("?")[0]
    if "." not in filename:
        return False
    ext = filename.rsplit(".", 1)[-1].lower()
    return ext in DANGEROUS_EXTENSIONS