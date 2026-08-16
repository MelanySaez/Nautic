# serializers.py  — REEMPLAZAR COMPLETO

from rest_framework import serializers
from .models import UserAccount, Equipo, Buque, Cargo


# ==========================
#  Serializers de Usuarios
# ==========================
class UserPublicSerializer(serializers.ModelSerializer):
    buque_id = serializers.SerializerMethodField()
    buque_nombre = serializers.SerializerMethodField()
    position_id = serializers.SerializerMethodField()
    position_nombre = serializers.SerializerMethodField()

    avatar_url = serializers.SerializerMethodField()
    avatar_thumb_url = serializers.SerializerMethodField()
    signature_url = serializers.SerializerMethodField()

    class Meta:
        model = UserAccount
        fields = [
            "id", "email", "username", "first_name", "last_name",
            "role", "is_active",
            "buque_id", "buque_nombre",
            "position_id", "position_nombre",
            "avatar_url", "avatar_thumb_url", "signature_url",
            "created_at", "updated_at"
        ]

    def get_buque_id(self, obj):
        return obj.buque_id

    def get_buque_nombre(self, obj):
        return getattr(obj.buque, 'nombre', None)

    def get_position_id(self, obj):
        return getattr(obj.position, 'id', None)

    def get_position_nombre(self, obj):
        return getattr(obj.position, 'nombre', None)

    def _build_media_url(self, path):
        """Convierte la ruta guardada en DB a URL pública.

        En DB hoy se están guardando rutas del tipo:
          - 'media/uploads/avatars/archivo.png' (legacy)
          - potencialmente en el futuro solo 'uploads/avatars/archivo.png'

        Para evitar el problema de ver /media/media/... en el frontend
        normalizamos eliminando un prefijo inicial 'media/' si existe.
        """
        if not path:
            return ''
        p = str(path).strip().replace('\\', '/').lstrip('/')
        # Colapsar repeticiones media/media/... -> media/
        while p.lower().startswith('media/media/'):
            p = p[6:]  # quitar un 'media/'
        if p.lower().startswith('media/'):
            p = p[6:]
        request = self.context.get('request')
        url_path = f"/media/{p}"
        if request:
            return request.build_absolute_uri(url_path)
        return url_path

    def get_avatar_url(self, obj):
        return self._build_media_url(obj.avatar)

    def get_avatar_thumb_url(self, obj):
        # Placeholder; si luego generas thumbnails, cambia la lógica
        return self._build_media_url(obj.avatar)

    def get_signature_url(self, obj):
        return self._build_media_url(obj.signature)


class UserCreateUpdateSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=6, required=False)
    signature_password = serializers.CharField(write_only=True, min_length=4, required=False)
    buque_id = serializers.PrimaryKeyRelatedField(
        queryset=Buque.objects.all(), source='buque', allow_null=True, required=False
    )
    position_id = serializers.PrimaryKeyRelatedField(
        queryset=Cargo.objects.all(), source='position', allow_null=True, required=False
    )

    class Meta:
        model = UserAccount
        fields = [
            "email", "username", "password", "signature_password", "role", "is_active", "buque_id",
            "first_name", "last_name", "position_id", "avatar", "signature"
        ]

    def validate_role(self, value):
        request = self.context.get('request')
        # Preferimos auth_user (establecido en vistas) y caemos a user solo si corresponde
        actor = getattr(request, 'auth_user', None) or getattr(request, 'user', None)
        # Si es AnonymousUser u objeto sin atributo role, evitamos AttributeError
        actor_role = getattr(actor, 'role', None)
        actor_position = getattr(actor, 'position', None)
        actor_position_name = getattr(actor_position, 'nombre', '') if actor_position else ''
        
        # Verificar si es Jefe de Departamento de Ingeniería
        is_engineering_head = (
            actor_role == 'admin' and 
            actor_position_name.strip().lower().replace(' ', '') == 'jefededepartamentodeingeniería'
        )
        
        # Reglas:
        # 1. Sólo superuser puede asignar rol superuser
        if value == 'superuser' and actor_role != 'superuser':
            raise serializers.ValidationError('Solo un superuser puede asignar rol superuser.')
        
        # 2. Admin normal no puede promover a admin (solo Jefe de Departamento de Ingeniería puede)
        if actor_role == 'admin' and value == 'admin' and not is_engineering_head:
            raise serializers.ValidationError('Solo el Jefe de Departamento de Ingeniería puede crear usuarios admin.')
        
        # 3. Admin no puede promover a superuser
        if actor_role == 'admin' and value == 'superuser':
            raise serializers.ValidationError('Un admin no puede crear/actualizar a superuser.')
        
        return value

    def validate(self, attrs):
        request = self.context.get('request')
        actor = getattr(request, 'auth_user', None) or getattr(request, 'user', None)
        actor_role = getattr(actor, 'role', None)
        actor_position = getattr(actor, 'position', None)
        actor_position_name = getattr(actor_position, 'nombre', '') if actor_position else ''
        
        # Normalizar nombre del cargo del actor para comparación
        import unicodedata
        def normalize_cargo(s):
            if not s:
                return ''
            normalized = unicodedata.normalize('NFD', s.strip())
            normalized = ''.join(c for c in normalized if unicodedata.category(c) != 'Mn')
            return normalized.lower().replace(' ', '')
        
        # Verificar si es Jefe de Departamento de Ingeniería
        is_engineering_head = (
            actor_role == 'admin' and 
            normalize_cargo(actor_position_name) == normalize_cargo('Jefe de Departamento de Ingeniería')
        )
        
        # Lista de cargos de jefatura que solo puede asignar el Jefe de Departamento de Ingeniería
        cargos_jefatura = [
            'Jefe de Departamento de Ingeniería',
            'Jefe División Propulsión',
            'Jefe de Propulsión',
            'Jefe de Control de Averías',
            'Jefe de Refrigeración y Electricidad',
            'Jefe de Maquinarias'
        ]
        
        # Validar asignación de cargos de jefatura (SUPERUSER tiene permiso absoluto)
        if 'position' in attrs and attrs['position'] and actor_role != 'superuser':
            cargo_asignado = attrs['position']
            cargo_asignado_nombre = getattr(cargo_asignado, 'nombre', '')
            cargo_asignado_tipo = getattr(cargo_asignado, 'tipo', 'user')
            cargo_asignado_normalized = normalize_cargo(cargo_asignado_nombre)
            
            # Verificar si el cargo a asignar es de jefatura
            es_cargo_jefatura = any(
                cargo_asignado_normalized == normalize_cargo(cj) 
                for cj in cargos_jefatura
            )
            
            # Si es un cargo de jefatura y el actor NO es superuser ni Jefe de Departamento de Ingeniería
            if es_cargo_jefatura and actor_role != 'superuser' and not is_engineering_head:
                raise serializers.ValidationError({
                    'position_id': 'Solo el Jefe de Departamento de Ingeniería o superuser pueden asignar cargos de jefatura.'
                })
            
            # VALIDACIÓN: Validar que el tipo de cargo coincida con el rol del usuario
            # Esta es una regla de negocio que SIEMPRE debe cumplirse
            target_role = attrs.get('role', getattr(self.instance, 'role', 'user') if self.instance else 'user')
            
            # Validar consistencia cargo-rol (excepto para superuser que no necesita cargo)
            if target_role != 'superuser':
                if target_role == 'admin' and cargo_asignado_tipo == 'user':
                    raise serializers.ValidationError({
                        'position_id': 'Los usuarios con rol "admin" no pueden tener cargos de tipo "user". Debe asignar un cargo de tipo "admin" (jefatura).'
                    })
                elif target_role == 'user' and cargo_asignado_tipo == 'admin':
                    raise serializers.ValidationError({
                        'position_id': 'Los usuarios con rol "user" no pueden tener cargos de tipo "admin" (jefatura). Debe asignar un cargo de tipo "user".'
                    })

        # Restricciones de buque (SUPERUSER y Jefe Ingeniería no tienen restricciones)
        if actor_role == 'superuser' or is_engineering_head:
            # Superuser y Jefe de Departamento de Ingeniería: flexibilidad total
            # Pueden asignar cualquier buque (no forzamos el suyo)
            pass
        elif actor_role == 'admin':
            # Admin normal: restricciones de buque
            if 'buque' in attrs and actor and actor.buque_id and attrs['buque'] and getattr(attrs['buque'], 'id', None) != actor.buque_id:
                raise serializers.ValidationError('Un admin solo puede asignar su propio buque.')
            # Si crea y no viene buque, asignar el suyo
            if not self.instance and not attrs.get('buque'):
                attrs['buque'] = getattr(actor, 'buque', None)
        
        return attrs

    def create(self, validated_data):
        pwd = validated_data.pop("password", None)
        sig_pwd = validated_data.pop("signature_password", None)
        if not pwd:
            raise serializers.ValidationError({'password': 'Requerida para crear usuario'})
        user = UserAccount(**validated_data)
        user.set_password(pwd)
        if sig_pwd:
            user.set_signature_password(sig_pwd)
        user.save()
        return user

    def update(self, instance, validated_data):
        pwd = validated_data.pop("password", None)
        sig_pwd = validated_data.pop("signature_password", None)
        for k, v in validated_data.items():
            setattr(instance, k, v)
        if pwd:
            instance.set_password(pwd)
        if sig_pwd:
            instance.set_signature_password(sig_pwd)
        instance.save()
        return instance


class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField()


class CurrentUserSerializer(serializers.ModelSerializer):
    buque_id = serializers.SerializerMethodField()
    buque_nombre = serializers.SerializerMethodField()
    position_id = serializers.SerializerMethodField()
    position_nombre = serializers.SerializerMethodField()
    avatar_url = serializers.SerializerMethodField()
    avatar_thumb_url = serializers.SerializerMethodField()
    signature_url = serializers.SerializerMethodField()

    class Meta:
        model = UserAccount
        fields = [
            "id", "email", "username", "first_name", "last_name", "role",
            "buque_id", "buque_nombre",
            "position_id", "position_nombre",
            "avatar_url", "avatar_thumb_url", "signature_url"
        ]

    def get_buque_id(self, obj):
        return obj.buque_id

    def get_buque_nombre(self, obj):
        return getattr(obj.buque, 'nombre', None)

    def get_position_id(self, obj):
        return getattr(obj.position, 'id', None)

    def get_position_nombre(self, obj):
        return getattr(obj.position, 'nombre', None)

    def _build_media_url(self, path):
        if not path:
            return ''
        p = str(path).strip().replace('\\', '/').lstrip('/')
        while p.lower().startswith('media/media/'):
            p = p[6:]
        if p.lower().startswith('media/'):
            p = p[6:]
        request = self.context.get('request')
        url_path = f"/media/{p}"
        if request:
            return request.build_absolute_uri(url_path)
        return url_path

    def get_avatar_url(self, obj):
        return self._build_media_url(obj.avatar)

    def get_avatar_thumb_url(self, obj):
        return self._build_media_url(obj.avatar)

    def get_signature_url(self, obj):
        return self._build_media_url(obj.signature)


class SelfUserUpdateSerializer(serializers.ModelSerializer):
    """Serializer para que el usuario actual actualice su perfil ampliado."""
    password = serializers.CharField(write_only=True, required=False, min_length=6)
    position_id = serializers.PrimaryKeyRelatedField(
        queryset=Cargo.objects.all(), source='position', allow_null=True, required=False
    )

    class Meta:
        model = UserAccount
        fields = [
            "email", "username", "password", "first_name", "last_name",
            "position_id", "avatar", "signature"
        ]

    def update(self, instance, validated_data):
        pwd = validated_data.pop("password", None)
        for k, v in validated_data.items():
            setattr(instance, k, v)
        if pwd:
            instance.set_password(pwd)
        instance.save()
        return instance


# ==========================
#  Serializer de Equipo
# ==========================
class EquipoSerializer(serializers.ModelSerializer):
    class Meta:
        model = Equipo
        fields = "__all__"   # si luego quieres limitar campos, cámbialo por una lista
