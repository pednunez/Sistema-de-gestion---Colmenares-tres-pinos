import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { registerRootComponent } from 'expo';
import AppAutenticado from './AppAutenticado';
import { useControladorSincronizacion } from './sincronizacion/controlador';

function EntradaMovil() {
  useControladorSincronizacion();
  return React.createElement(SafeAreaProvider, null, React.createElement(AppAutenticado));
}

registerRootComponent(EntradaMovil);
