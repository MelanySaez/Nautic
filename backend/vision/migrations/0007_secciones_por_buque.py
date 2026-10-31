from django.db import migrations


def copiar_secciones_por_buque(apps, schema_editor):
    """Give every vessel its own copy of the global sections and re-point its photos.

    Global sections are the rows without a vessel. Each photo moves to the copy
    (same ``codigo``) owned by its inspection's vessel; the global rows are then
    deleted. With no global sections (never-seeded DB) each existing vessel gets
    the standard set instead, the same default a new vessel gets.
    """
    Buque = apps.get_model('vision', 'Buque')
    Seccion = apps.get_model('vision', 'SeccionCasco')
    Foto = apps.get_model('vision', 'FotoInspeccion')

    globales = list(Seccion.objects.filter(buque__isnull=True).order_by('orden', 'codigo'))
    if not globales:
        # Only the fields this historical model has: later keys in the constant must not break replays.
        from vision.secciones import SECCIONES_ESTANDAR

        Seccion.objects.bulk_create(
            Seccion(
                buque=buque,
                codigo=d['codigo'],
                nombre=d['nombre'],
                descripcion=d['descripcion'],
                orden=d['orden'],
            )
            for buque in Buque.objects.all()
            for d in SECCIONES_ESTANDAR
        )
        return

    for buque in Buque.objects.all():
        copias = Seccion.objects.bulk_create(
            Seccion(
                buque=buque,
                codigo=s.codigo,
                nombre=s.nombre,
                descripcion=s.descripcion,
                orden=s.orden,
            )
            for s in globales
        )
        for vieja, copia in zip(globales, copias):
            Foto.objects.filter(
                inspeccion__buque=buque, seccion_id=vieja.id,
            ).update(seccion_id=copia.id)

    # FotoInspeccion.seccion is PROTECT: every photo was re-pointed above.
    Seccion.objects.filter(buque__isnull=True).delete()


class Migration(migrations.Migration):
    """
    Data step 2/3. The reverse is an explicit no-op: per-vessel rows cannot be
    merged back into a global catalog, so reversing 0006 afterwards fails on the
    restored global ``codigo`` uniqueness when vessels share codes.
    """

    dependencies = [
        ('vision', '0006_seccion_buque_nullable'),
    ]

    operations = [
        migrations.RunPython(copiar_secciones_por_buque, migrations.RunPython.noop, elidable=False),
    ]
