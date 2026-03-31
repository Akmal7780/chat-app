import pyclamd

def scan_file_for_virus(file):
    try:
        cd = pyclamd.ClamdNetworkSocket(host="clamav", port=3310)

        file.seek(0)
        file_bytes = file.read()   # 🔥 MUHIM
        file.seek(0)

        result = cd.scan_stream(file_bytes)

        if result:
            print("❌ Virus detected:", result)
            return True   # infected
        else:
            print("✅ File clean")
            return False

    except Exception as e:
        print("ClamAV error:", e)

        # 🔥 FAIL SAFE (ENG MUHIM)
        return True   # ❗ infected deb qabul qil