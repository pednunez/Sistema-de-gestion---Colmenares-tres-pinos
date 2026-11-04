import unittest
from types import SimpleNamespace
from unittest.mock import Mock, patch

from app.schemas.transferencia_marco import TransferenciaMarcoCreate
from app.services import transferencia_marco as servicio


def piso(ocupados, contenido="SOLO_CRIA"):
    return [
        {"numero": n, "contenido": contenido if n <= ocupados else "SIN_MARCO"}
        for n in range(1, 11)
    ]


def respuesta(colmena_id, ocupados, contenido="SOLO_CRIA"):
    return {
        "colmena_id": colmena_id,
        "camara_cria": piso(ocupados, contenido),
        "alza": None,
    }


class TransferenciaIntegradaTests(unittest.TestCase):
    def setUp(self):
        self.db = Mock()
        self.origen = SimpleNamespace(id=1, cantidad_marcos=10, fecha_actualizacion=None)
        self.destino = SimpleNamespace(id=2, cantidad_marcos=9, fecha_actualizacion=None)
        self.bloqueo = patch.object(
            servicio, "obtener_colmenas_para_transferencia",
            return_value=(self.origen, self.destino),
        )
        self.bloqueo.start()
        self.addCleanup(self.bloqueo.stop)
        self.persistencia = patch.object(
            servicio.colmena_marcos_service, "guardar_estado_actual"
        )
        self.guardar = self.persistencia.start()
        self.addCleanup(self.persistencia.stop)
        self.inventario = patch.object(
            servicio.inventario_service, "registrar_movimiento_bodega"
        )
        self.ingresar = self.inventario.start()
        self.addCleanup(self.inventario.stop)

    def datos(self, **cambios):
        base = dict(
            colmena_origen_id=1,
            colmena_destino_id=2,
            usuario_id=1,
            cantidad_marcos=1,
            tipo_marco="CRIA",
            ubicacion="CAMARA_CRIA",
            numero_marco=2,
            contenido="SOLO_CRIA",
            ubicacion_destino="CAMARA_CRIA",
        )
        base.update(cambios)
        return TransferenciaMarcoCreate(**base)

    def test_lugar_libre_actualiza_totales_sin_bodega(self):
        with patch.object(
            servicio.colmena_marcos_service, "obtener_marcos_colmena",
            side_effect=[respuesta(1, 10), respuesta(2, 9)],
        ):
            transferencia = servicio.crear_transferencia(
                self.db, self.datos(), commit=False
            )
        self.assertEqual(self.origen.cantidad_marcos, 9)
        self.assertEqual(self.destino.cantidad_marcos, 10)
        self.assertEqual(transferencia.numero_destino, 10)
        self.assertIsNone(transferencia.accion_desplazado)
        self.assertEqual(self.guardar.call_count, 2)
        self.ingresar.assert_not_called()
        self.db.commit.assert_not_called()

    def test_cria_retorna_al_origen_sin_variar_cantidad(self):
        self.destino.cantidad_marcos = 10
        with patch.object(
            servicio.colmena_marcos_service, "obtener_marcos_colmena",
            side_effect=[respuesta(1, 10), respuesta(2, 10)],
        ):
            transferencia = servicio.crear_transferencia(
                self.db,
                self.datos(marco_desplazado_numero=5),
                commit=False,
            )
        self.assertEqual(self.origen.cantidad_marcos, 10)
        self.assertEqual(self.destino.cantidad_marcos, 10)
        self.assertEqual(transferencia.accion_desplazado, "INTERCAMBIO")
        self.assertEqual(transferencia.contenido_desplazado, "SOLO_CRIA")
        self.ingresar.assert_not_called()

    def test_miel_desplazada_ingresa_bodega_una_vez(self):
        self.destino.cantidad_marcos = 10
        with patch.object(
            servicio.colmena_marcos_service, "obtener_marcos_colmena",
            side_effect=[respuesta(1, 10), respuesta(2, 10, "SOLO_MIEL")],
        ):
            transferencia = servicio.crear_transferencia(
                self.db,
                self.datos(marco_desplazado_numero=7),
                commit=False,
            )
        self.assertEqual(self.origen.cantidad_marcos, 9)
        self.assertEqual(self.destino.cantidad_marcos, 10)
        self.assertEqual(transferencia.accion_desplazado, "BODEGA")
        self.assertEqual(transferencia.contenido_desplazado, "SOLO_MIEL")
        self.ingresar.assert_called_once()
        datos_stock = self.ingresar.call_args.kwargs["datos"]
        self.assertEqual(datos_stock.material, "MARCO_MIEL")
        self.assertEqual(datos_stock.cantidad, 1)
        self.assertFalse(self.ingresar.call_args.kwargs["commit"])
        self.db.commit.assert_not_called()

    def test_piso_lleno_sin_desplazado_rechaza(self):
        self.destino.cantidad_marcos = 10
        with patch.object(
            servicio.colmena_marcos_service, "obtener_marcos_colmena",
            side_effect=[respuesta(1, 10), respuesta(2, 10)],
        ):
            with self.assertRaisesRegex(ValueError, "lleno"):
                servicio.crear_transferencia(
                    self.db, self.datos(), commit=False
                )
        self.db.add.assert_not_called()
        self.ingresar.assert_not_called()

    def test_no_inventa_posiciones_si_destino_sin_historial(self):
        with patch.object(
            servicio.colmena_marcos_service, "obtener_marcos_colmena",
            side_effect=[respuesta(1, 10), {
                "colmena_id": 2, "camara_cria": None, "alza": None,
            }],
        ):
            with self.assertRaisesRegex(ValueError, "estado de marcos confiable"):
                servicio.crear_transferencia(
                    self.db, self.datos(), commit=False
                )
        self.db.add.assert_not_called()

    def test_legacy_superior_a_diez_rechazada_sin_posiciones(self):
        self.destino.cantidad_marcos = 10
        self.db.scalar.return_value = None
        with self.assertRaisesRegex(ValueError, "diez marcos"):
            servicio.crear_transferencia(
                self.db,
                TransferenciaMarcoCreate(
                    colmena_origen_id=1,
                    colmena_destino_id=2,
                    usuario_id=1,
                    cantidad_marcos=1,
                ),
                commit=False,
            )
        self.db.add.assert_not_called()

    def test_rollback_transaccion_propia_si_falla_persistencia(self):
        self.guardar.side_effect = RuntimeError("Fallo de persistencia")
        with patch.object(
            servicio.colmena_marcos_service, "obtener_marcos_colmena",
            side_effect=[respuesta(1, 10), respuesta(2, 9)],
        ):
            with self.assertRaisesRegex(RuntimeError, "persistencia"):
                servicio.crear_transferencia(self.db, self.datos(), commit=True)
        self.db.rollback.assert_called_once()
        self.db.commit.assert_not_called()

    def test_commit_false_deja_rollback_al_router(self):
        self.guardar.side_effect = RuntimeError("Fallo de persistencia")
        with patch.object(
            servicio.colmena_marcos_service, "obtener_marcos_colmena",
            side_effect=[respuesta(1, 10), respuesta(2, 9)],
        ):
            with self.assertRaisesRegex(RuntimeError, "persistencia"):
                servicio.crear_transferencia(self.db, self.datos(), commit=False)
        self.db.rollback.assert_not_called()
        self.db.commit.assert_not_called()


if __name__ == "__main__":
    unittest.main()
