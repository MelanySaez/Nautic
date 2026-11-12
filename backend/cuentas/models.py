from django.contrib.auth.base_user import AbstractBaseUser, BaseUserManager
from django.contrib.auth.models import PermissionsMixin
from django.db import models


class UsuarioManager(BaseUserManager):
    use_in_migrations = True

    def create_user(self, email, password=None, **campos):
        if not email:
            raise ValueError('El email es obligatorio.')
        # Stored lowercase so the address is unique and matched case-insensitively.
        usuario = self.model(email=self.normalize_email(email).lower(), **campos)
        usuario.set_password(password)
        usuario.save(using=self._db)
        return usuario

    def create_superuser(self, email, password=None, **campos):
        campos.setdefault('is_staff', True)
        campos.setdefault('is_superuser', True)
        return self.create_user(email, password, **campos)


class Usuario(AbstractBaseUser, PermissionsMixin):
    """
    Account that signs in with its email. ``nombre`` and ``cargo`` prefill the
    inspector data of reports; ``is_staff`` opens the Django admin.
    """
    email = models.EmailField(unique=True)
    nombre = models.CharField(max_length=255, blank=True, default='')
    cargo = models.CharField(max_length=255, blank=True, default='')
    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)
    fecha_registro = models.DateTimeField(auto_now_add=True)

    objects = UsuarioManager()

    USERNAME_FIELD = 'email'
    EMAIL_FIELD = 'email'
    REQUIRED_FIELDS = []

    class Meta:
        db_table = 'usuario'
        ordering = ['nombre', 'email']

    def __str__(self):
        return self.nombre or self.email
