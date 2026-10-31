"""Photo severity comes from the core_engine taxonomy, not from a local copy."""
from unittest import mock

from django.test import SimpleTestCase

from vision.inference import severidad_por_clase
from vision.models import NivelSeveridad
from vision.tasks import _calcular_severidad


def _det(class_name):
    return {"class_name": class_name, "confidence": 0.9}


class SeveridadPorClaseTests(SimpleTestCase):
    def test_every_taxonomy_level_is_a_known_nivel(self):
        # Compatibility contract with nautic_core: a level NivelSeveridad does not
        # know would be ignored, under-reporting the photo severity.
        severidades = severidad_por_clase()
        self.assertTrue(severidades)
        for clase, texto in severidades.items():
            self.assertIsNotNone(NivelSeveridad.desde_texto(texto), (clase, texto))

    def test_component_classes_have_no_severity(self):
        severidades = severidad_por_clase()
        for componente in ("ship_hull", "propeller", "anode"):
            self.assertNotIn(componente, severidades)


class CalcularSeveridadTests(SimpleTestCase):
    def test_returns_the_worst_anomaly(self):
        detecciones = [_det("paint_peel"), _det("corrosion"), _det("marine_growth")]
        self.assertEqual(_calcular_severidad(detecciones), "critical")

    def test_ignores_components(self):
        detecciones = [_det("ship_hull"), _det("paint_peel")]
        self.assertEqual(_calcular_severidad(detecciones), "low")

    def test_no_anomalies_returns_none(self):
        self.assertIsNone(_calcular_severidad([_det("ship_hull"), _det("propeller")]))
        self.assertIsNone(_calcular_severidad([]))

    def test_follows_the_library_when_it_changes(self):
        with mock.patch(
            "vision.tasks.severidad_por_clase",
            return_value={"paint_peel": "high", "corrosion": "medium"},
        ):
            detecciones = [_det("paint_peel"), _det("corrosion")]
            self.assertEqual(_calcular_severidad(detecciones), "high")

    def test_unknown_severity_label_is_ignored(self):
        with mock.patch(
            "vision.tasks.severidad_por_clase",
            return_value={"corrosion": "extreme", "defect": "high"},
        ):
            detecciones = [_det("corrosion"), _det("defect")]
            with self.assertLogs("vision.tasks", level="WARNING") as logs:
                self.assertEqual(_calcular_severidad(detecciones), "high")
        self.assertIn("extreme", logs.output[0])
