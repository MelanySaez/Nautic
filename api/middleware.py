import re
import logging
from django.http import JsonResponse
from .jwt_utils import decode_token
from .models import UserAccount

API_PREFIX = re.compile(r"^/api/")
PUBLIC = re.compile(r"^/api/auth/(login|refresh|logout)$")

class JWTAuthMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response
        self.log = logging.getLogger("api.auth")

    def __call__(self, request):
        path = request.path
        request.auth_user = None

        if API_PREFIX.match(path) and not PUBLIC.match(path):
            token = request.COOKIES.get("access_token")
            if not token:
                self.log.info("401 no access_token path=%s", path)
                return JsonResponse({"detail": "Authentication required"}, status=401)
            try:
                payload = decode_token(token)
                if payload.get("type") != "access":
                    self.log.info("401 token wrong type path=%s", path)
                    return JsonResponse({"detail": "Invalid token"}, status=401)
                uid = payload.get("uid")
                user = UserAccount.objects.filter(id=uid, is_active=True).first()
                if not user:
                    self.log.info("401 user not found uid=%s path=%s", uid, path)
                    return JsonResponse({"detail": "User not found"}, status=401)
                request.auth_user = user
            except Exception as exc:
                self.log.info("401 invalid/expired token path=%s err=%s", path, exc)
                return JsonResponse({"detail": f"Invalid/expired token: {exc}"}, status=401)
        resp = self.get_response(request)
        try:
            if API_PREFIX.match(path):
                self.log.info("%s %s -> %s user=%s", request.method, path, getattr(resp, 'status_code', '?'), getattr(request, 'auth_user', None) and request.auth_user.id)
        except Exception:
            pass
        return resp
