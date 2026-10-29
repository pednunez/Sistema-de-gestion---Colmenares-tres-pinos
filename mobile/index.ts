
import React from 'react';

import {
  registerRootComponent,
} from 'expo';

import App from './App';

import AppAutenticado from './AppAutenticado';

import DiagnosticoCola from './DiagnosticoCola';

import {
  useControladorSincronizacion,
} from './sincronizacion/controlador';

// ==========================================
// COLMENARES TRES PINOS
// ENTRADA PRINCIPAL
// ==========================================

function EntradaMovil() {

  // Comprueba conectividad y requisitos
  // para la futura sincronización.
  //
  // Los envíos reales permanecen
  // desactivados en el controlador.
  useControladorSincronizacion();

  // DESARROLLO
  //
  // Abrir el menú directamente
  // y mostrar diagnóstico local.
  if (__DEV__) {
    return React.createElement(
      DiagnosticoCola,
      null,
      React.createElement(App)
    );
  }

  // PRODUCCIÓN
  //
  // Exigir autenticación.
  return React.createElement(
    AppAutenticado
  );
}

registerRootComponent(EntradaMovil);
