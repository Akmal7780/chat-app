from django.contrib import admin
from .models import User, UserPresence


admin.site.register(User)
admin.site.register(UserPresence)