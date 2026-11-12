"""
Grouped detections become rows: one ``DeteccionFoto`` per class per photo.

Copies ``FotoInspeccion.detecciones`` (JSON) into rows and the report review in
``ValidacionFoto`` into ``DeteccionFoto.descartada`` and ``FotoInspeccion.nota_inspector``.
The JSON column and ``ValidacionFoto`` are dropped in 0012. The reverse rebuilds both.
"""
import django.db.models.deletion
from django.db import migrations, models


def json_a_filas(apps, schema_editor):
    Foto = apps.get_model('vision', 'FotoInspeccion')
    Deteccion = apps.get_model('vision', 'DeteccionFoto')
    Validacion = apps.get_model('vision', 'ValidacionFoto')
    revisiones = {v.foto_id: v for v in Validacion.objects.all()}
    filas = []
    for foto in Foto.objects.exclude(detecciones=None).only('id', 'detecciones').iterator():
        revision = revisiones.get(foto.id)
        descartadas = set(revision.descartadas or []) if revision else set()
        vistas = set()
        for det in foto.detecciones or []:
            clase = det.get('class_name') or ''
            if clase in vistas:  # one row per class; the JSON never repeated one, but be safe
                continue
            vistas.add(clase)
            filas.append(Deteccion(
                foto_id=foto.id, clase=clase, cantidad=det.get('count') or 0,
                confianza_max=det.get('max_confidence') or 0.0, descartada=clase in descartadas,
            ))
    Deteccion.objects.bulk_create(filas, batch_size=1000)
    for revision in revisiones.values():
        if revision.nota:
            Foto.objects.filter(pk=revision.foto_id).update(nota_inspector=revision.nota)


def filas_a_json(apps, schema_editor):
    Foto = apps.get_model('vision', 'FotoInspeccion')
    Deteccion = apps.get_model('vision', 'DeteccionFoto')
    Validacion = apps.get_model('vision', 'ValidacionFoto')
    por_foto = {}
    for fila in Deteccion.objects.order_by('foto_id', 'id').iterator():
        por_foto.setdefault(fila.foto_id, []).append(fila)
    for foto_id, filas in por_foto.items():
        Foto.objects.filter(pk=foto_id).update(detecciones=[
            {'class_name': f.clase, 'count': f.cantidad, 'max_confidence': f.confianza_max} for f in filas
        ])
    con_revision = {f_id for f_id, filas in por_foto.items() if any(f.descartada for f in filas)}
    con_revision |= set(Foto.objects.exclude(nota_inspector='').values_list('id', flat=True))
    for foto in Foto.objects.filter(pk__in=con_revision).only('id', 'nota_inspector'):
        Validacion.objects.update_or_create(foto_id=foto.id, defaults={
            'descartadas': sorted(f.clase for f in por_foto.get(foto.id, []) if f.descartada),
            'nota': foto.nota_inspector,
        })


class Migration(migrations.Migration):

    dependencies = [
        ('vision', '0010_reporte_editable'),
    ]

    operations = [
        migrations.AddField(
            model_name='fotoinspeccion',
            name='nota_inspector',
            field=models.TextField(blank=True, default=''),
        ),
        migrations.CreateModel(
            name='DeteccionFoto',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('clase', models.CharField(max_length=64)),
                ('cantidad', models.PositiveIntegerField()),
                ('confianza_max', models.FloatField()),
                ('descartada', models.BooleanField(default=False)),
                # Temporary accessor: ``detecciones`` is still the JSON column until 0012.
                ('foto', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='filas_deteccion', to='vision.fotoinspeccion',
                )),
            ],
            options={
                'db_table': 'deteccion_foto',
                'ordering': ['id'],
                'indexes': [models.Index(fields=['clase', 'foto'], name='deteccion_clase_foto_idx')],
                'constraints': [models.UniqueConstraint(fields=('foto', 'clase'), name='deteccion_foto_clase_uniq')],
            },
        ),
        migrations.RunPython(json_a_filas, filas_a_json),
    ]
