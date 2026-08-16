from django.http import JsonResponse

def require_admin(request):
    user = getattr(request, "auth_user", None)
    if not user or user.role not in ("admin", "superuser"):
        return JsonResponse({"detail": "Admin/Superuser only"}, status=403)
    return None
