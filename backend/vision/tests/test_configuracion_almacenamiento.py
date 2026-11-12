from django.core.exceptions import ImproperlyConfigured
from django.test import SimpleTestCase, override_settings
from django.core.files.storage import default_storage

from storages.backends.s3 import S3Storage

from config.almacenamiento import EXPIRACION_POR_DEFECTO, configurar_storages

STATICFILES = {'BACKEND': 'django.contrib.staticfiles.storage.StaticFilesStorage'}


class ConfigurarStoragesTests(SimpleTestCase):
    def test_sin_variables_usa_disco_local(self):
        self.assertEqual(
            configurar_storages({}),
            {
                'default': {'BACKEND': 'django.core.files.storage.FileSystemStorage'},
                'staticfiles': STATICFILES,
            },
        )

    def test_local_explicito_no_exige_variables_s3(self):
        storages = configurar_storages({'STORAGE_BACKEND': 'local'})

        self.assertEqual(
            storages['default']['BACKEND'], 'django.core.files.storage.FileSystemStorage'
        )

    def test_el_nombre_del_backend_ignora_mayusculas_y_espacios(self):
        storages = configurar_storages({'STORAGE_BACKEND': ' S3 ', 'S3_BUCKET': 'b'})

        self.assertEqual(storages['default']['BACKEND'], 'storages.backends.s3.S3Storage')

    def test_s3_completo(self):
        storages = configurar_storages({
            'STORAGE_BACKEND': 's3',
            'S3_BUCKET': 'nautic-fotos',
            'S3_ACCESS_KEY_ID': 'AKIA-TEST',
            'S3_SECRET_ACCESS_KEY': 'secreto-test',
            'S3_ENDPOINT_URL': 'https://acct.r2.cloudflarestorage.com',
            'S3_REGION': 'auto',
            'S3_LOCATION': 'prod',
            'S3_URL_EXPIRE_SECONDS': '600',
        })

        self.assertEqual(storages['staticfiles'], STATICFILES)
        self.assertEqual(
            storages['default'],
            {
                'BACKEND': 'storages.backends.s3.S3Storage',
                'OPTIONS': {
                    'bucket_name': 'nautic-fotos',
                    'access_key': 'AKIA-TEST',
                    'secret_key': 'secreto-test',
                    'endpoint_url': 'https://acct.r2.cloudflarestorage.com',
                    'region_name': 'auto',
                    'location': 'prod',
                    'querystring_auth': True,
                    'querystring_expire': 600,
                    'default_acl': None,
                    'file_overwrite': False,
                    'signature_version': 's3v4',
                },
            },
        )

    def test_s3_minimo_deja_las_credenciales_a_boto3(self):
        opciones = configurar_storages(
            {'STORAGE_BACKEND': 's3', 'S3_BUCKET': 'nautic-fotos'}
        )['default']['OPTIONS']

        self.assertEqual(opciones['bucket_name'], 'nautic-fotos')
        self.assertEqual(opciones['querystring_expire'], EXPIRACION_POR_DEFECTO)
        self.assertEqual(EXPIRACION_POR_DEFECTO, 900)
        for ausente in ('access_key', 'secret_key', 'endpoint_url', 'region_name', 'location'):
            self.assertNotIn(ausente, opciones)

    def test_s3_siempre_firma_las_urls_y_no_sobrescribe(self):
        opciones = configurar_storages(
            {'STORAGE_BACKEND': 's3', 'S3_BUCKET': 'b'}
        )['default']['OPTIONS']

        self.assertIs(opciones['querystring_auth'], True)
        self.assertIsNone(opciones['default_acl'])
        self.assertIs(opciones['file_overwrite'], False)
        self.assertEqual(opciones['signature_version'], 's3v4')

    def test_variables_opcionales_vacias_cuentan_como_ausentes(self):
        # .env.example leaves them blank (``S3_REGION=``).
        opciones = configurar_storages({
            'STORAGE_BACKEND': 's3',
            'S3_BUCKET': 'b',
            'S3_ACCESS_KEY_ID': '',
            'S3_SECRET_ACCESS_KEY': '  ',
            'S3_ENDPOINT_URL': '',
            'S3_REGION': '',
            'S3_LOCATION': '',
            'S3_URL_EXPIRE_SECONDS': '',
        })['default']['OPTIONS']

        self.assertEqual(
            set(opciones),
            {'bucket_name', 'querystring_auth', 'querystring_expire', 'default_acl',
             'file_overwrite', 'signature_version'},
        )
        self.assertEqual(opciones['querystring_expire'], 900)

    def test_expiracion_invalida_falla(self):
        for crudo in ('abc', '0', '-5', '1.5'):
            with self.subTest(crudo=crudo), self.assertRaisesMessage(
                ImproperlyConfigured, 'S3_URL_EXPIRE_SECONDS'
            ):
                configurar_storages({
                    'STORAGE_BACKEND': 's3', 'S3_BUCKET': 'b', 'S3_URL_EXPIRE_SECONDS': crudo,
                })

    def test_backend_desconocido_falla(self):
        with self.assertRaisesMessage(ImproperlyConfigured, 'STORAGE_BACKEND desconocido'):
            configurar_storages({'STORAGE_BACKEND': 'gcs'})

    def test_s3_sin_bucket_falla(self):
        for env in ({'STORAGE_BACKEND': 's3'}, {'STORAGE_BACKEND': 's3', 'S3_BUCKET': ' '}):
            with self.subTest(env=env), self.assertRaisesMessage(
                ImproperlyConfigured, 'S3_BUCKET'
            ):
                configurar_storages(env)

    def test_credenciales_incompletas_fallan_sin_filtrar_el_valor(self):
        with self.assertRaises(ImproperlyConfigured) as ctx:
            configurar_storages({
                'STORAGE_BACKEND': 's3', 'S3_BUCKET': 'b', 'S3_ACCESS_KEY_ID': 'AKIA-SECRETA',
            })

        self.assertNotIn('AKIA-SECRETA', str(ctx.exception))


class StorageS3InstanciableTests(SimpleTestCase):
    """The generated config is accepted by Django and resolves to S3Storage (no network)."""

    def test_default_storage_es_s3storage_con_urls_firmadas(self):
        storages = configurar_storages({
            'STORAGE_BACKEND': 's3',
            'S3_BUCKET': 'nautic-fotos',
            'S3_ACCESS_KEY_ID': 'AKIA-TEST',
            'S3_SECRET_ACCESS_KEY': 'secreto-test',
            'S3_REGION': 'us-east-1',
            'S3_URL_EXPIRE_SECONDS': '300',
        })

        with override_settings(STORAGES=storages):
            # Building the URL signs locally with boto3; it performs no request.
            url = default_storage.url('inspecciones/originales/a.jpg')

            self.assertIsInstance(default_storage._wrapped, S3Storage)

        self.assertIn('nautic-fotos', url)
        self.assertIn('X-Amz-Signature=', url)
        self.assertIn('X-Amz-Expires=300', url)
