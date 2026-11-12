import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    """Schema step 3/3: the vessel is required and ``codigo`` is unique per vessel."""

    dependencies = [
        ('vision', '0007_secciones_por_buque'),
    ]

    operations = [
        migrations.AlterField(
            model_name='seccioncasco',
            name='buque',
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE,
                related_name='secciones',
                to='vision.buque',
            ),
        ),
        migrations.AddConstraint(
            model_name='seccioncasco',
            constraint=models.UniqueConstraint(
                fields=('buque', 'codigo'), name='seccion_buque_codigo_uniq',
            ),
        ),
    ]
