from django.urls import path
from .views import (
    RegisterView,
    LoginView,GoogleLogin,UserListView,CurrentUserView,UpdateProfileView
)

urlpatterns = [

    path("register/", RegisterView.as_view()),
    path("login/", LoginView.as_view()),
    path("google/", GoogleLogin.as_view()),
    path("users_list/", UserListView.as_view()),
    path("users/me/", CurrentUserView.as_view()),
    path("profile/update/", UpdateProfileView.as_view()),

]