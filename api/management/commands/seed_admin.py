from django.core.management.base import BaseCommand
from api.models import UserAccount

class Command(BaseCommand):
    help = "Crea un usuario admin inicial si no existe"

    def add_arguments(self, parser):
        parser.add_argument("--email", default="admin@example.com")
        parser.add_argument("--username", default="admin")
        parser.add_argument("--password", default="admin123")

    def handle(self, *args, **opts):
        if UserAccount.objects.filter(username=opts["username"]).exists():
            self.stdout.write(self.style.WARNING("Admin ya existe"))
            return
        u = UserAccount(email=opts["email"], username=opts["username"], role="admin", is_active=True)
        u.set_password(opts["password"])
        u.save()
        self.stdout.write(self.style.SUCCESS(f"Admin creado: {u.username} / {u.email}"))
