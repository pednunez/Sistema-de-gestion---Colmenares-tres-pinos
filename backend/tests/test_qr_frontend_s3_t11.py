"""S3-T11: el QR impreso debe abrir el frontend y no un endpoint JSON."""
import unittest
from unittest.mock import patch
from fastapi import HTTPException
from app.database import settings
from app.routers.colmenas import construir_url_publica_qr


class QRFrontendTests(unittest.TestCase):
    def test_qr_usa_frontend_url(self):
        with patch.object(settings, "FRONTEND_URL", "https://colmenares.example.cl/"):
            self.assertEqual(
                construir_url_publica_qr("abc-123"),
                "https://colmenares.example.cl/?qr=abc-123",
            )

    def test_qr_no_se_genera_sin_frontend_url(self):
        with patch.object(settings, "FRONTEND_URL", ""):
            with self.assertRaises(HTTPException) as cm:
                construir_url_publica_qr("abc-123")
            self.assertEqual(cm.exception.status_code, 503)

    def test_qr_rechaza_url_invalida(self):
        with patch.object(settings, "FRONTEND_URL", "localhost:5173"):
            with self.assertRaises(HTTPException) as cm:
                construir_url_publica_qr("abc-123")
            self.assertEqual(cm.exception.status_code, 503)

    def test_qr_codifica_codigo(self):
        with patch.object(settings, "FRONTEND_URL", "https://colmenares.example.cl"):
            self.assertEqual(
                construir_url_publica_qr("a b"),
                "https://colmenares.example.cl/?qr=a+b",
            )
