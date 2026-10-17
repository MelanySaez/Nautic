"""
Comando para poblar el catálogo de secciones del casco (SeccionCasco).

Las secciones están organizadas en dos ejes:
  - Longitudinal: FWD (proa) | MID (centro) | AFT (popa)
  - Vertical:     BTM (fondo) | BLG (pantoque) | SS-P (costado babor)
                  | SS-S (costado estribor) | DK (borde cubierta)

Más zonas especiales: quilla, línea de flotación, zona hélice, tomas de mar.

Uso:
    python manage.py seed_secciones_casco
    python manage.py seed_secciones_casco --reset   (borra y recrea todo)
"""

from django.core.management.base import BaseCommand
from vision.models import SeccionCasco


SECCIONES = [
    # ── Fondo (BTM) ────────────────────────────────────────────────
    {
        'codigo': 'FWD-BTM',
        'nombre': 'Fondo — Proa',
        'descripcion': 'Planchas del fondo en el tercio de proa.',
        'orden': 10,
    },
    {
        'codigo': 'MID-BTM',
        'nombre': 'Fondo — Centro',
        'descripcion': 'Planchas del fondo en el tercio central (master section).',
        'orden': 11,
    },
    {
        'codigo': 'AFT-BTM',
        'nombre': 'Fondo — Popa',
        'descripcion': 'Planchas del fondo en el tercio de popa.',
        'orden': 12,
    },

    # ── Pantoque (BLG) ─────────────────────────────────────────────
    {
        'codigo': 'FWD-BLG-P',
        'nombre': 'Pantoque Babor — Proa',
        'descripcion': 'Zona curva entre fondo y costado babor, tercio de proa.',
        'orden': 20,
    },
    {
        'codigo': 'FWD-BLG-S',
        'nombre': 'Pantoque Estribor — Proa',
        'descripcion': 'Zona curva entre fondo y costado estribor, tercio de proa.',
        'orden': 21,
    },
    {
        'codigo': 'MID-BLG-P',
        'nombre': 'Pantoque Babor — Centro',
        'descripcion': 'Zona curva entre fondo y costado babor, tercio central.',
        'orden': 22,
    },
    {
        'codigo': 'MID-BLG-S',
        'nombre': 'Pantoque Estribor — Centro',
        'descripcion': 'Zona curva entre fondo y costado estribor, tercio central.',
        'orden': 23,
    },
    {
        'codigo': 'AFT-BLG-P',
        'nombre': 'Pantoque Babor — Popa',
        'descripcion': 'Zona curva entre fondo y costado babor, tercio de popa.',
        'orden': 24,
    },
    {
        'codigo': 'AFT-BLG-S',
        'nombre': 'Pantoque Estribor — Popa',
        'descripcion': 'Zona curva entre fondo y costado estribor, tercio de popa.',
        'orden': 25,
    },

    # ── Costado Babor (SS-P / Port) ────────────────────────────────
    {
        'codigo': 'FWD-SS-P',
        'nombre': 'Costado Babor — Proa',
        'descripcion': 'Planchas del costado babor (Port) en el tercio de proa.',
        'orden': 30,
    },
    {
        'codigo': 'MID-SS-P',
        'nombre': 'Costado Babor — Centro',
        'descripcion': 'Planchas del costado babor (Port) en el tercio central.',
        'orden': 31,
    },
    {
        'codigo': 'AFT-SS-P',
        'nombre': 'Costado Babor — Popa',
        'descripcion': 'Planchas del costado babor (Port) en el tercio de popa.',
        'orden': 32,
    },

    # ── Costado Estribor (SS-S / Starboard) ───────────────────────
    {
        'codigo': 'FWD-SS-S',
        'nombre': 'Costado Estribor — Proa',
        'descripcion': 'Planchas del costado estribor (Starboard) en el tercio de proa.',
        'orden': 40,
    },
    {
        'codigo': 'MID-SS-S',
        'nombre': 'Costado Estribor — Centro',
        'descripcion': 'Planchas del costado estribor (Starboard) en el tercio central.',
        'orden': 41,
    },
    {
        'codigo': 'AFT-SS-S',
        'nombre': 'Costado Estribor — Popa',
        'descripcion': 'Planchas del costado estribor (Starboard) en el tercio de popa.',
        'orden': 42,
    },

    # ── Borde de cubierta / Traca de cinta (DK) ───────────────────
    {
        'codigo': 'FWD-DK',
        'nombre': 'Borde Cubierta — Proa',
        'descripcion': 'Traca de cinta (sheerstrake) en el tercio de proa.',
        'orden': 50,
    },
    {
        'codigo': 'MID-DK',
        'nombre': 'Borde Cubierta — Centro',
        'descripcion': 'Traca de cinta (sheerstrake) en el tercio central.',
        'orden': 51,
    },
    {
        'codigo': 'AFT-DK',
        'nombre': 'Borde Cubierta — Popa',
        'descripcion': 'Traca de cinta (sheerstrake) en el tercio de popa.',
        'orden': 52,
    },

    # ── Zonas especiales ───────────────────────────────────────────
    {
        'codigo': 'KEEL',
        'nombre': 'Quilla',
        'descripcion': 'Plancha de quilla (keel strake), línea central inferior del casco.',
        'orden': 60,
    },
    {
        'codigo': 'WL-P',
        'nombre': 'Línea de Flotación Babor',
        'descripcion': (
            'Franja de alta corrosión entre obra viva y obra muerta, lado babor. '
            'Zona de oxidación acelerada por contacto intermitente con agua.'
        ),
        'orden': 61,
    },
    {
        'codigo': 'WL-S',
        'nombre': 'Línea de Flotación Estribor',
        'descripcion': (
            'Franja de alta corrosión entre obra viva y obra muerta, lado estribor. '
            'Zona de oxidación acelerada por contacto intermitente con agua.'
        ),
        'orden': 62,
    },
    {
        'codigo': 'PROP',
        'nombre': 'Zona Hélice y Timón',
        'descripcion': (
            'Área en popa que incluye hélice, timón y planchas adyacentes. '
            'Sujeta a cavitación y erosión intensa.'
        ),
        'orden': 70,
    },
    {
        'codigo': 'SEA-CHEST',
        'nombre': 'Tomas de Mar',
        'descripcion': (
            'Rejillas y área circundante de las tomas de mar (sea chests). '
            'Propensas a incrustaciones marinas y corrosión.'
        ),
        'orden': 71,
    },
]


class Command(BaseCommand):
    help = 'Pobla el catálogo de secciones del casco (SeccionCasco).'

    def add_arguments(self, parser):
        parser.add_argument(
            '--reset',
            action='store_true',
            help='Elimina todas las secciones existentes antes de insertar.',
        )

    def handle(self, *args, **options):
        if options['reset']:
            deleted, _ = SeccionCasco.objects.all().delete()
            self.stdout.write(self.style.WARNING(f'  {deleted} secciones eliminadas.'))

        creadas = 0
        actualizadas = 0

        for datos in SECCIONES:
            obj, created = SeccionCasco.objects.update_or_create(
                codigo=datos['codigo'],
                defaults={
                    'nombre': datos['nombre'],
                    'descripcion': datos['descripcion'],
                    'orden': datos['orden'],
                },
            )
            if created:
                creadas += 1
            else:
                actualizadas += 1

        self.stdout.write(self.style.SUCCESS(
            f'\n  Secciones del casco listas: {creadas} creadas, {actualizadas} actualizadas.'
        ))
        self.stdout.write(f'  Total en catálogo: {SeccionCasco.objects.count()} secciones.\n')
