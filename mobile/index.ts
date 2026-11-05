import React from 'react';
import { registerRootComponent } from 'expo';
import AppAutenticado from './AppAutenticado';
import { useControladorSincronizacion } from './sincronizacion/controlador';

function EntradaMovil() {
  useControladorSincronizacion();
  return React.createElement(AppAutenticado);
}

registerRootComponent(EntradaMovil);
