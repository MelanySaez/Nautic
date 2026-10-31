from django.db import connection
from django.db.migrations.executor import MigrationExecutor
from django.test import TransactionTestCase

ANTES = [('vision', '0006_seccion_buque_nullable')]
DESPUES = [('vision', '0008_seccion_buque_requerido')]


class SeccionesPorBuqueMigracionTests(TransactionTestCase):
    def _migrar(self, destino):
        executor = MigrationExecutor(connection)
        executor.migrate(destino)
        return MigrationExecutor(connection).loader.project_state(destino).apps

    def tearDown(self):
        # Leave the test database at the latest schema for the following tests.
        executor = MigrationExecutor(connection)
        executor.migrate(executor.loader.graph.leaf_nodes())

    def test_cada_buque_recibe_su_copia_y_conserva_sus_fotos(self):
        apps = self._migrar(ANTES)
        Buque, Seccion = apps.get_model('vision', 'Buque'), apps.get_model('vision', 'SeccionCasco')
        Inspeccion, Foto = apps.get_model('vision', 'InspeccionCasco'), apps.get_model('vision', 'FotoInspeccion')
        a = Buque.objects.create(nombre='A', tipo='Fragata')
        b = Buque.objects.create(nombre='B', tipo='Fragata')
        Seccion.objects.create(codigo='FWD', nombre='Proa', orden=1)
        quilla = Seccion.objects.create(codigo='KEEL', nombre='Quilla', orden=2)
        foto_a = Foto.objects.create(
            inspeccion=Inspeccion.objects.create(buque=a), seccion=quilla, imagen_original='x.jpg',
        )
        foto_b = Foto.objects.create(
            inspeccion=Inspeccion.objects.create(buque=b), seccion=quilla, imagen_original='y.jpg',
        )

        apps = self._migrar(DESPUES)
        Seccion, Foto = apps.get_model('vision', 'SeccionCasco'), apps.get_model('vision', 'FotoInspeccion')

        self.assertEqual(Seccion.objects.count(), 4)
        for buque in (a, b):
            self.assertEqual(
                list(Seccion.objects.filter(buque_id=buque.id).values_list('codigo', flat=True)),
                ['FWD', 'KEEL'],
            )
        for foto, buque in ((foto_a, a), (foto_b, b)):
            seccion = Foto.objects.get(pk=foto.pk).seccion
            self.assertEqual((seccion.codigo, seccion.buque_id), ('KEEL', buque.id))
