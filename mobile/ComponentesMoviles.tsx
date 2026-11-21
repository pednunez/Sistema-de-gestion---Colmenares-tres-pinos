import React, { useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { COLORS } from './theme';

export type OpcionMovil = {
  value: string;
  label: string;
  description?: string;
};

type SelectorListaProps = {
  label?: string;
  value: string;
  opciones: OpcionMovil[];
  placeholder?: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  required?: boolean;
  helper?: string;
};

export function SelectorLista({
  label,
  value,
  opciones,
  placeholder = 'Seleccionar',
  onChange,
  disabled = false,
  required = false,
  helper,
}: SelectorListaProps) {
  const [visible, setVisible] = useState(false);
  const seleccionada = opciones.find(item => item.value === value);

  return (
    <>
      <View style={styles.campo}>
        {!!label && (
          <Text style={styles.label}>
            {label}{required ? ' *' : ''}
          </Text>
        )}
        <Pressable
          disabled={disabled || opciones.length === 0}
          onPress={() => setVisible(true)}
          style={({ pressed }) => [
            styles.selector,
            (disabled || opciones.length === 0) && styles.selectorDeshabilitado,
            pressed && styles.selectorPresionado,
          ]}
          accessibilityRole="button"
          accessibilityLabel={label ? `${label}: ${seleccionada?.label ?? placeholder}` : placeholder}
        >
          <Text
            numberOfLines={1}
            style={seleccionada ? styles.selectorTexto : styles.selectorPlaceholder}
          >
            {seleccionada?.label ?? placeholder}
          </Text>
          <Text style={styles.flecha}>⌄</Text>
        </Pressable>
        {!!helper && <Text style={styles.ayuda}>{helper}</Text>}
      </View>

      <Modal
        visible={visible}
        transparent
        animationType="fade"
        onRequestClose={() => setVisible(false)}
      >
        <Pressable style={styles.overlay} onPress={() => setVisible(false)}>
          <View style={styles.modalSelector} onStartShouldSetResponder={() => true}>
            <View style={styles.modalCabecera}>
              <Text style={styles.modalTitulo}>{label ?? 'Seleccionar opción'}</Text>
              <Pressable onPress={() => setVisible(false)} hitSlop={10}>
                <Text style={styles.cerrar}>×</Text>
              </Pressable>
            </View>
            <ScrollView style={styles.opciones} keyboardShouldPersistTaps="handled">
              {opciones.map(opcion => {
                const activa = opcion.value === value;
                return (
                  <Pressable
                    key={opcion.value}
                    style={[styles.opcion, activa && styles.opcionActiva]}
                    onPress={() => {
                      onChange(opcion.value);
                      setVisible(false);
                    }}
                  >
                    <View style={styles.opcionTextos}>
                      <Text style={[styles.opcionLabel, activa && styles.opcionLabelActiva]}>
                        {opcion.label}
                      </Text>
                      {!!opcion.description && (
                        <Text style={styles.opcionDescripcion}>{opcion.description}</Text>
                      )}
                    </View>
                    {activa && <Text style={styles.check}>✓</Text>}
                  </Pressable>
                );
              })}
              {opciones.length === 0 && (
                <Text style={styles.sinOpciones}>No hay opciones disponibles.</Text>
              )}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

export function InsigniaMovil({
  texto,
  tono = 'neutral',
}: {
  texto: string;
  tono?: 'neutral' | 'verde' | 'azul' | 'ambar' | 'rojo';
}) {
  const estilo = {
    neutral: styles.badgeNeutral,
    verde: styles.badgeVerde,
    azul: styles.badgeAzul,
    ambar: styles.badgeAmbar,
    rojo: styles.badgeRojo,
  }[tono];
  const estiloTexto = {
    neutral: styles.badgeTextoNeutral,
    verde: styles.badgeTextoVerde,
    azul: styles.badgeTextoAzul,
    ambar: styles.badgeTextoAmbar,
    rojo: styles.badgeTextoRojo,
  }[tono];

  return (
    <View style={[styles.badge, estilo]}>
      <Text style={[styles.badgeTexto, estiloTexto]}>{texto}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  campo: {
    gap: 6,
    minWidth: 0,
  },
  label: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: '700',
  },
  selector: {
    minHeight: 46,
    borderWidth: 1,
    borderColor: COLORS.borderStrong,
    borderRadius: 12,
    backgroundColor: COLORS.surface,
    paddingHorizontal: 13,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  selectorDeshabilitado: {
    backgroundColor: COLORS.background,
    opacity: 0.7,
  },
  selectorPresionado: {
    borderColor: COLORS.gold,
  },
  selectorTexto: {
    flex: 1,
    color: COLORS.text,
    fontSize: 13,
  },
  selectorPlaceholder: {
    flex: 1,
    color: COLORS.textMuted,
    fontSize: 13,
  },
  flecha: {
    color: COLORS.forest,
    fontSize: 18,
    lineHeight: 20,
  },
  ayuda: {
    color: COLORS.textSecondary,
    fontSize: 11,
    lineHeight: 16,
  },
  overlay: {
    flex: 1,
    backgroundColor: '#00000066',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 22,
  },
  modalSelector: {
    width: '100%',
    maxWidth: 520,
    maxHeight: '78%',
    backgroundColor: COLORS.surface,
    borderRadius: 18,
    overflow: 'hidden',
  },
  modalCabecera: {
    minHeight: 58,
    paddingHorizontal: 18,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  modalTitulo: {
    color: COLORS.forest,
    fontSize: 16,
    fontWeight: '800',
  },
  cerrar: {
    color: COLORS.textSecondary,
    fontSize: 27,
    lineHeight: 30,
  },
  opciones: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  opcion: {
    minHeight: 52,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    paddingHorizontal: 10,
    paddingVertical: 9,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  opcionActiva: {
    backgroundColor: COLORS.goldSoft,
    borderRadius: 10,
  },
  opcionTextos: {
    flex: 1,
    gap: 2,
  },
  opcionLabel: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: '600',
  },
  opcionLabelActiva: {
    color: COLORS.goldText,
  },
  opcionDescripcion: {
    color: COLORS.textSecondary,
    fontSize: 11,
  },
  check: {
    color: COLORS.goldText,
    fontSize: 18,
    fontWeight: '900',
  },
  sinOpciones: {
    padding: 20,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
  badge: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  badgeNeutral: { backgroundColor: COLORS.background, borderColor: COLORS.borderStrong },
  badgeVerde: { backgroundColor: COLORS.successBg, borderColor: '#B7DEC4' },
  badgeAzul: { backgroundColor: '#EAF4FF', borderColor: '#B9D9F8' },
  badgeAmbar: { backgroundColor: COLORS.goldSoft, borderColor: COLORS.goldBorder },
  badgeRojo: { backgroundColor: COLORS.dangerBg, borderColor: '#F4C6C3' },
  badgeTexto: { fontSize: 10, fontWeight: '800' },
  badgeTextoNeutral: { color: COLORS.textSecondary },
  badgeTextoVerde: { color: COLORS.successDeep },
  badgeTextoAzul: { color: '#155B9A' },
  badgeTextoAmbar: { color: COLORS.goldText },
  badgeTextoRojo: { color: COLORS.danger },
});
