from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('vision', '0002_remove_ano_construccion'),
    ]

    operations = [
        migrations.AddField(
            model_name='fotoinspeccion',
            name='tiempo_inferencia_ms',
            field=models.FloatField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='fotoinspeccion',
            name='severidad',
            field=models.CharField(blank=True, max_length=20, null=True),
        ),
    ]
