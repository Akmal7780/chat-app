from rest_framework.throttling import UserRateThrottle


class MessageThrottle(UserRateThrottle):
    scope = "message"


class LoginThrottle(UserRateThrottle):
    scope = "login"


class UploadThrottle(UserRateThrottle):
    scope = "upload"