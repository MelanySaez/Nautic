import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    """Schema step 1/3: sections gain a (still nullable) vessel and lose global uniqueness."""

    dependencies = [
        ('vision', '0005_foto_versiones'),
    ]

    operations = [
        migrations.AddField(
            model_name='seccioncasco',
            name='buque',
            field=models.ForeignKey(
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name='secciones',
                to='vision.buque',
            ),
        ),
        migrations.AlterField(
            model_name='seccioncasco',
            name='codigo',
            field=models.CharField(max_length=20),
        ),
    ]
