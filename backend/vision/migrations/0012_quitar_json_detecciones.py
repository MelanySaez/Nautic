"""Drops the detections JSON column and ``ValidacionFoto`` (their data now lives in ``DeteccionFoto``)."""
import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('vision', '0011_deteccion_foto'),
    ]

    operations = [
        migrations.RemoveField(
            model_name='fotoinspeccion',
            name='detecciones',
        ),
        migrations.DeleteModel(
            name='ValidacionFoto',
        ),
        migrations.AlterField(
            model_name='deteccionfoto',
            name='foto',
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE,
                related_name='detecciones', to='vision.fotoinspeccion',
            ),
        ),
    ]
