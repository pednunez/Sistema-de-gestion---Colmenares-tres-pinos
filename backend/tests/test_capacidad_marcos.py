
"""Pruebas unitarias de capacidad de marcos S3-T06."""

import unittest

from app.services.capacidad_marcos import (
    EstadoColmena,
    planificar_transferencia,
)


def piso(ocupados: int = 10, contenido: str = "SOLO_CRIA"):
    return [
        {
            "numero": numero,
            "contenido": (
                contenido if numero <= ocupados else "SIN_MARCO"
            ),
        }
        for numero in range(1, 11)
    ]


class CapacidadMarcosTests(unittest.TestCase):

    def test_destino_con_espacio_coloca_en_primera_libre(self):
        origen = EstadoColmena(camara_cria=piso(10))
        destino = EstadoColmena(camara_cria=piso(7))

        plan = planificar_transferencia(
            estado_origen=origen,
            estado_destino=destino,
            ubicacion_origen="CAMARA_CRIA",
            numero_origen=3,
            ubicacion_destino="CAMARA_CRIA",
        )

        self.assertEqual(plan.numero_colocado, 8)
        self.assertEqual(
            plan.origen.camara_cria[2]["contenido"],
            "SIN_MARCO",
        )
        self.assertEqual(
            plan.destino.camara_cria[7]["contenido"],
            "SOLO_CRIA",
        )
        self.assertEqual(
            destino.camara_cria[7]["contenido"],
            "SIN_MARCO",
        )

    def test_piso_lleno_obliga_a_elegir_desplazado(self):
        with self.assertRaisesRegex(ValueError, "lleno"):
            planificar_transferencia(
                estado_origen=EstadoColmena(piso()),
                estado_destino=EstadoColmena(piso()),
                ubicacion_origen="CAMARA_CRIA",
                numero_origen=1,
                ubicacion_destino="CAMARA_CRIA",
            )

    def test_cria_desplazada_regresa_al_origen(self):
        plan = planificar_transferencia(
            estado_origen=EstadoColmena(
                piso(10, "CERA_UNTADA")
            ),
            estado_destino=EstadoColmena(
                piso(10, "SOLO_CRIA")
            ),
            ubicacion_origen="CAMARA_CRIA",
            numero_origen=3,
            ubicacion_destino="CAMARA_CRIA",
            marco_desplazado_numero=7,
        )

        self.assertEqual(plan.accion_desplazado, "INTERCAMBIO")
        self.assertEqual(
            plan.origen.camara_cria[2]["contenido"],
            "SOLO_CRIA",
        )
        self.assertEqual(
            plan.destino.camara_cria[6]["contenido"],
            "CERA_UNTADA",
        )
        self.assertIsNone(plan.material_bodega)

    def test_miel_desplazada_destinada_a_bodega(self):
        plan = planificar_transferencia(
            estado_origen=EstadoColmena(piso()),
            estado_destino=EstadoColmena(
                piso(10, "SOLO_MIEL")
            ),
            ubicacion_origen="CAMARA_CRIA",
            numero_origen=3,
            ubicacion_destino="CAMARA_CRIA",
            marco_desplazado_numero=7,
        )

        self.assertEqual(plan.accion_desplazado, "BODEGA")
        self.assertEqual(
            plan.material_bodega,
            "MARCO_MIEL",
        )
        self.assertEqual(
            plan.origen.camara_cria[2]["contenido"],
            "SIN_MARCO",
        )
        self.assertEqual(
            plan.destino.camara_cria[6]["contenido"],
            "SOLO_CRIA",
        )

    def test_no_desplazamiento_si_hay_espacio(self):
        with self.assertRaisesRegex(
            ValueError,
            "posiciones libres",
        ):
            planificar_transferencia(
                estado_origen=EstadoColmena(piso()),
                estado_destino=EstadoColmena(piso(9)),
                ubicacion_origen="CAMARA_CRIA",
                numero_origen=1,
                ubicacion_destino="CAMARA_CRIA",
                marco_desplazado_numero=5,
            )

    def test_rechaza_alza_que_no_existe(self):
        with self.assertRaisesRegex(
            ValueError,
            "No existe el piso",
        ):
            planificar_transferencia(
                estado_origen=EstadoColmena(piso()),
                estado_destino=EstadoColmena(piso(), None),
                ubicacion_origen="CAMARA_CRIA",
                numero_origen=1,
                ubicacion_destino="ALZA",
            )

    def test_no_acepta_origen_vacio(self):
        with self.assertRaisesRegex(
            ValueError,
            "no contiene un marco",
        ):
            planificar_transferencia(
                estado_origen=EstadoColmena(piso(0)),
                estado_destino=EstadoColmena(piso(9)),
                ubicacion_origen="CAMARA_CRIA",
                numero_origen=1,
                ubicacion_destino="CAMARA_CRIA",
            )

    def test_no_acepta_marcos_duplicados(self):
        duplicados = piso()
        duplicados[3]["numero"] = 2

        with self.assertRaisesRegex(
            ValueError,
            "invalidas",
        ):
            planificar_transferencia(
                estado_origen=EstadoColmena(duplicados),
                estado_destino=EstadoColmena(piso()),
                ubicacion_origen="CAMARA_CRIA",
                numero_origen=1,
                ubicacion_destino="CAMARA_CRIA",
                marco_desplazado_numero=4,
            )

    def test_coherencia_contenido_origen(self):
        with self.assertRaisesRegex(
            ValueError,
            "no coincide",
        ):
            planificar_transferencia(
                estado_origen=EstadoColmena(piso()),
                estado_destino=EstadoColmena(piso(9)),
                ubicacion_origen="CAMARA_CRIA",
                numero_origen=1,
                ubicacion_destino="CAMARA_CRIA",
                contenido_marco="SOLO_MIEL",
            )

    def test_cera_desplazada_distingue_tipo(self):
        plan = planificar_transferencia(
            estado_origen=EstadoColmena(piso()),
            estado_destino=EstadoColmena(
                piso(10, "CERA_ESTAMPADA")
            ),
            ubicacion_origen="CAMARA_CRIA",
            numero_origen=1,
            ubicacion_destino="CAMARA_CRIA",
            marco_desplazado_numero=10,
        )

        self.assertEqual(
            plan.material_bodega,
            "MARCO_CERA_ESTAMPADA",
        )


if __name__ == "__main__":
    unittest.main()
