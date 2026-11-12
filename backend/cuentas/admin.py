from django.contrib import admin
from django.contrib.auth.admin import UserAdmin

from .models import Usuario


@admin.register(Usuario)
class UsuarioAdmin(UserAdmin):
    ordering = ['email']
    list_display = ['email', 'nombre', 'cargo', 'is_active', 'is_staff']
    search_fields = ['email', 'nombre']
    fieldsets = (
        (None, {'fields': ('email', 'password')}),
        ('Datos', {'fields': ('nombre', 'cargo')}),
        ('Permisos', {'fields': ('is_active', 'is_staff', 'is_superuser', 'groups', 'user_permissions')}),
        ('Fechas', {'fields': ('last_login',)}),
    )
    add_fieldsets = (
        (None, {'classes': ('wide',), 'fields': ('email', 'nombre', 'cargo', 'password1', 'password2')}),
    )
