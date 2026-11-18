"""Ejecutar desde cualquier directorio: python backend/tests/run_isolated.py.

No lee .env, no conecta PostgreSQL y deshabilita las pruebas de correo real.
Acepta un patrón opcional, por ejemplo test_reportes.py.
"""
import os
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

from pydantic_settings.sources import DotEnvSettingsSource


def main():
    backend = Path(__file__).resolve().parents[1]
    sys.path.insert(0, str(backend))
    os.chdir(backend)
    config = dict(DB_USER="test", DB_PASSWORD="test", DB_HOST="localhost",
                  DB_PORT="5432", DB_NAME="test", JWT_SECRET_KEY="test-key-" * 8,
                  RF03_POSTGRES="0", INVENTARIO_POSTGRES="0", RF03_LIVE_MAIL="0")
    # La fuente lee el archivo durante su construcción, antes de __call__.
    with patch.dict(os.environ, config, clear=True), patch.object(
        DotEnvSettingsSource, "_read_env_files", return_value={}
    ):
        suite = unittest.defaultTestLoader.discover(
            str(backend / "tests"), pattern=sys.argv[1] if len(sys.argv) > 1 else "test_*.py"
        )
        return not unittest.TextTestRunner(stream=sys.stdout, verbosity=2).run(suite).wasSuccessful()


if __name__ == "__main__":
    sys.exit(main())
