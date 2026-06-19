"""
URL configuration for config project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/6.0/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""
from django.contrib import admin
from django.urls import path,include
from django.conf import settings
from django.conf.urls.static import static

urlpatterns = [
    path('admin/', admin.site.urls),
    path("api/users/", include("apps.users.urls")),
    path("api/ai/", include("apps.ai.urls")),
    path("api/auth/", include("dj_rest_auth.urls")),

    path("api/notifications/", include("apps.notifications.urls")),

    path(
        "api/auth/registration/",
        include("dj_rest_auth.registration.urls")
    ),
    path("accounts/", include("allauth.urls")),
    path("api/", include("apps.conversations.urls")),
    path("api/", include("apps.messaging.urls")),
]
if settings.DEBUG:
    urlpatterns += static(settings.STATIC_URL, document_root=settings.STATIC_ROOT)
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
