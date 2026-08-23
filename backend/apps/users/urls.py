from django.urls import path
from .views import (
    RegisterView,
    LoginView,GoogleLogin,UserListView,CurrentUserView,UpdateProfileView,
    BlockUserAPIView, BlockedUsersListView,
    SessionListView, SessionRevokeView, LogoutAPIView,
    VerifyTwoFactorAPIView, TwoStepStatusAPIView, TwoStepEnableAPIView, TwoStepDisableAPIView,
)

urlpatterns = [

    path("register/", RegisterView.as_view()),
    path("login/", LoginView.as_view()),
    path("login/verify-2fa/", VerifyTwoFactorAPIView.as_view()),
    path("google/", GoogleLogin.as_view()),
    path("users_list/", UserListView.as_view()),
    path("users/me/", CurrentUserView.as_view()),
    path("profile/update/", UpdateProfileView.as_view()),
    path("block/<int:user_id>/", BlockUserAPIView.as_view()),
    path("blocked/", BlockedUsersListView.as_view()),
    path("sessions/", SessionListView.as_view()),
    path("sessions/<int:pk>/", SessionRevokeView.as_view()),
    path("logout/", LogoutAPIView.as_view()),
    path("2fa/status/", TwoStepStatusAPIView.as_view()),
    path("2fa/enable/", TwoStepEnableAPIView.as_view()),
    path("2fa/disable/", TwoStepDisableAPIView.as_view()),

]