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