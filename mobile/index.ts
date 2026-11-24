import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { registerRootComponent } from 'expo';
import AppAutenticado from './AppAutenticado';

function EntradaMovil() {
  return React.createElement(SafeAreaProvider, null, React.createElement(AppAutenticado));
}

registerRootComponent(EntradaMovil);
