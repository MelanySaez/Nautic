"""Photo severity comes from the core_engine taxonomy, not from a local copy."""
from unittest import mock

from django.test import SimpleTestCase

from vision.inference import severidad_por_clase
from vision.tasks import _calcular_severidad


def _det(class_name):
    return {"class_name": class_name, "confidence": 0.9}


class SeveridadPorClaseTests(SimpleTestCase):
    def test_matches_the_core_engine_taxonomy(self):
        from core_engine.vision.domain import severity_map

        self.assertEqual(severidad_por_clase(), severity_map())

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
            self.assertEqual(_calcular_severidad(detecciones), "high")
