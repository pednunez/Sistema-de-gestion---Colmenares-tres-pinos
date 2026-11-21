# -*- coding: utf-8 -*-
"""Ajustes globales de responsive para Colmenares Tres Pinos.

Colocar esta carpeta dentro del repositorio y ejecutar desde su raiz:
    python ResponsiveColmenares/aplicar_responsive.py

Genera respaldos antes de escribir. Si no encuentra un fragmento, aborta sin
escribir cambios (se prevalidan los archivos). No toca el backend.
"""
from __future__ import annotations
from pathlib import Path
import datetime
import re
import shutil
import sys

ROOT = Path(__file__).resolve().parent.parent
MOBILE = ROOT / 'mobile'
STAMP = datetime.datetime.now().strftime('%Y%m%d-%H%M%S')
BACKUP_DIR = ROOT.parent / (ROOT.name + '-respaldo-responsive-' + STAMP)
MARKER = 'RESPONSIVE_COLMENARES_2026'


def ensure(ok, msg):
    if not ok:
        raise ValueError(msg)


def once(s, pattern, output, label, flags=re.S | re.M):
    found=list(re.finditer(pattern,s,flags))
    ensure(len(found)==1, f'{label}: esperaba una coincidencia, encontre {len(found)}. No se ha cambiado nada.')
    return s[:found[0].start()] + output + s[found[0].end():]


def patch_index(s):
    if 'SafeAreaProvider' in s: return s
    s=once(s,r"import React from 'react';", "import React from 'react';\nimport { SafeAreaProvider } from 'react-native-safe-area-context';", 'index import')
    s=once(s,r'return React\.createElement\(AppAutenticado\);',
           'return React.createElement(SafeAreaProvider, null, React.createElement(AppAutenticado));', 'index provider')
    return s


def patch_auth(s):
    if "from 'react-native-safe-area-context'" in s: return s
    m=re.search(r"import\s*\{([^}]+)\}\s*from\s*'react-native';",s,re.S)
    ensure(m is not None and re.search(r'\bSafeAreaView\b',m.group(1)) is not None, 'AppAutenticado: import SafeAreaView')
    content=re.sub(r'\bSafeAreaView\s*,\s*','',m.group(1),count=1)
    s=s[:m.start(1)]+content+s[m.end(1):]
    s=once(s,r"import App from './App';", "import { SafeAreaView } from 'react-native-safe-area-context';\nimport App from './App';", 'auth import')
    s=once(s,r'<SafeAreaView\s+style=\{styles\.contenedor\}>',
           "<SafeAreaView edges={['top', 'bottom', 'left', 'right']} style={styles.contenedor}>", 'auth safe view')
    return s


def patch_login(s):
    if "<SafeAreaView edges={['top', 'bottom', 'left', 'right']}" in s: return s
    s=once(s,r"import \{ COLORS \} from './theme';",
           "import { COLORS } from './theme';\nimport { SafeAreaView } from 'react-native-safe-area-context';", 'Login import')
    s=once(s,r'return\s*\(\s*<KeyboardAvoidingView',
           "return (\n    <SafeAreaView edges={['top', 'bottom', 'left', 'right']} style={styles.pantalla}>\n      <KeyboardAvoidingView", 'Login apertura')
    s=once(s,r'</KeyboardAvoidingView>\s*\);',
           '</KeyboardAvoidingView>\n    </SafeAreaView>\n  );', 'Login cierre')
    s=once(s,r'(?m)^\s*tarjeta:\s*\{',
           "\n  tarjeta: {\n    width: '100%',\n    maxWidth: 520,\n    alignSelf: 'center',",'Login tarjeta')
    return s


def patch_app(s):
    if MARKER in s: return s
    imp=re.search(r"import\s*\{([^}]+)\}\s*from\s*'react-native';",s,re.S)
    ensure(imp is not None,'App: import react-native')
    middle=imp.group(1)
    for name in ('BackHandler','Keyboard'):
        if not re.search(r'\b'+name+r'\b',middle): middle='\n  '+name+','+middle
    s=s[:imp.start(1)]+middle+s[imp.end(1):]
    s=once(s,r"import \{ COLORS \} from './theme';",
           "import { COLORS } from './theme';\nimport { useSafeAreaInsets } from 'react-native-safe-area-context';",'App import safe')
    s=once(s,r'const\s*\{\s*width\s*\}\s*=\s*useWindowDimensions\(\);',
           'const { width, height } = useWindowDimensions();\n  const insets = useSafeAreaInsets();', 'App pantalla')
    s=once(s,r'const\s+esTablet\s*=\s*width\s*>=\s*768\s*;',
           'const esTablet = width >= 760 && Math.min(width, height) >= 600;\n  const anchoSidebar = Math.max(210, Math.min(270, Math.round(width * 0.28)));', 'App tablet')
    state=re.search(r'const\s*\[pantalla,\s*setPantalla\]\s*=\s*useState\s*<\s*Pantalla\s*>\s*\(pantallaInicial\);',s)
    ensure(state is not None,'App: estado pantalla')
    injected='''
  // RESPONSIVE_COLMENARES_2026: historial de navegacion compartido.
  const historialPantallas = useRef<Pantalla[]>([]);
  const pantallaActualRef = useRef<Pantalla>(pantallaInicial);

  const navegar = (destino: Pantalla) => {
    const actual = pantallaActualRef.current;
    if (destino === actual) return;
    historialPantallas.current.push(actual);
    if (historialPantallas.current.length > 30) historialPantallas.current.shift();
    pantallaActualRef.current = destino;
    setPantalla(destino);
  };

  const [tecladoAbierto, setTecladoAbierto] = useState(false);
  useEffect(() => {
    const abrir = Keyboard.addListener('keyboardDidShow', () => setTecladoAbierto(true));
    const cerrar = Keyboard.addListener('keyboardDidHide', () => setTecladoAbierto(false));
    return () => { abrir.remove(); cerrar.remove(); };
  }, []);
'''
    s=s[:state.end()]+injected+s[state.end():]
    # El setter real permanece dentro de navegar; solo reemplazar transiciones
    # DESPUES de su definicion, excluyendo la vuelta al inicio.
    marker='  const [tecladoAbierto, setTecladoAbierto]'
    pos=s.index(marker)
    s=s[:pos]+s[pos:].replace('setPantalla(', 'navegar(')
    s=once(s,r'(?m)^\s*navegar\(pantallaInicial\);',
           '    historialPantallas.current = [];\n    pantallaActualRef.current = pantallaInicial;\n    setPantalla(pantallaInicial);','App inicio reset')
    handlers='''
  // Historial accesible desde boton inferior y boton fisico Android.
  const volverAtras = () => {
    if (menuAbierto) { setMenuAbierto(false); return; }
    const anterior = historialPantallas.current.pop();
    if (anterior) {
      pantallaActualRef.current = anterior;
      setPantalla(anterior);
    } else if (pantallaActualRef.current !== pantallaInicial) {
      volverInicio();
    }
  };

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const suscripcion = BackHandler.addEventListener('hardwareBackPress', () => {
      if (menuAbierto) { setMenuAbierto(false); return true; }
      if (tutorialVisible) { void cerrarTutorial(); return true; }
      if (pantallaActualRef.current !== pantallaInicial) { volverAtras(); return true; }
      return false;
    });
    return () => suscripcion.remove();
  }, [menuAbierto, tutorialVisible, pantalla, pantallaInicial]);
'''
    anchor=re.search(r'\n\s*// ={5,}\n\s*// ABRIR ESCANER QR',s)
    ensure(anchor is not None,'App: bloque ABRIR ESCANER')
    s=s[:anchor.start()]+'\n'+handlers+s[anchor.start():]
    s=once(s,r'mostrarCerrar\s*&&\s*styles\.sidebarContenidoMovil\s*,',
           "mostrarCerrar && styles.sidebarContenidoMovil,\n        mostrarCerrar && { paddingTop: Math.max(insets.top, Platform.OS === 'ios' ? 44 : 24) },",
           'App safe area en menu')
    s=once(s,r'<View\s+style=\{styles\.sidebarTablet\}>',
           '<View style={[styles.sidebarTablet, { width: anchoSidebar }]}>','App sidebar')
    dock='''
          {/* Botones inferiores fuera del contenido desplazable: no tapan formularios. */}
          {!tecladoAbierto && (
            <View style={styles.navegacionInferior}>
              <Pressable onPress={volverAtras} accessibilityRole="button"
                accessibilityLabel="Volver a la pantalla anterior" style={styles.navegacionBoton}>
                <Text style={styles.navegacionTexto}>‹ Atrás</Text>
              </Pressable>
              <Pressable onPress={volverInicio} accessibilityRole="button"
                accessibilityLabel="Volver al inicio" style={styles.navegacionBoton}>
                <Text style={styles.navegacionTexto}>⌂ Inicio</Text>
              </Pressable>
              {!esTablet && (
                <Pressable onPress={() => setMenuAbierto(true)} accessibilityRole="button"
                  accessibilityLabel="Abrir menú de módulos" style={styles.navegacionBoton}>
                  <Text style={styles.navegacionTexto}>☰ Menú</Text>
                </Pressable>
              )}
            </View>
          )}
'''
    content=re.search(r'<View\s+style=\{styles\.contenidoPrincipal\}>\s*\{contenido\}\s*</View>',s)
    ensure(content is not None,'App: contenidoPrincipal')
    s=s[:content.end()]+dock+s[content.end():]
    style='''
  navegacionInferior: {
    flexDirection: 'row', minHeight: 56,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.forestBorder,
    backgroundColor: COLORS.surface,
    paddingHorizontal: 6, alignItems: 'stretch',
  },
  navegacionBoton: {
    minWidth: 0, flex: 1, minHeight: 50,
    alignItems: 'center', justifyContent: 'center',
    paddingVertical: 9, paddingHorizontal: 5,
  },
  navegacionTexto: {
    color: COLORS.forest, fontSize: 13,
    fontWeight: '700', textAlign: 'center',
  },
'''
    stylepos=re.search(r'const styles\s*=\s*StyleSheet\.create\(\{',s)
    ensure(stylepos is not None,'App: StyleSheet')
    s=s[:stylepos.end()]+style+s[stylepos.end():]
    s=once(s,r'const\s+navegarModulo\s*=\s*\(item:\s*ItemMenu\)\s*=>\s*\{',
           'const navegarModulo = (item: ItemMenu) => {\n    if (!item.roles.includes(usuario.rol as Rol)) return;',
           'App seguridad menu')
    # Asegurar que no vuelva a pasar un acceso Apiarios a ambos roles.
    s=re.sub(r"(id:\s*'apiarios',[\s\S]{0,250}?roles:\s*)TODOS",r'\1SOLO_ADMIN',s,count=1)
    return s


def patch_stock(s):
    if 'anchoPanelResponsive' in s: return s
    m=re.search(r'const\s*\{\s*width:\s*anchoPantalla\s*\}\s*=\s*useWindowDimensions\(\);',s)
    if m is None:
        print('AVISO: StockLocales tiene otra version, no se ajusta automaticamente.')
        return s
    s=s[:m.end()]+'\n  const [anchoPanelResponsive, setAnchoPanelResponsive] = useState(0);\n  const anchoDisponible = anchoPanelResponsive || anchoPantalla;'+s[m.end():]
    s=re.sub(r'(const\s+columnas\s*=\s*)anchoPantalla',r'\1anchoDisponible',s,count=1)
    s=re.sub(r'(\?\s*3\s*:\s*)anchoPantalla',r'\1anchoDisponible',s,count=1)
    s=re.sub(r'(const\s+anchoTablaReparacion\s*=\s*Math\.max\(920,\s*)anchoPantalla',r'\1anchoDisponible',s,count=1)
    s=re.sub(r'(const\s+anchoTablaHistorial\s*=\s*Math\.max\(1120,\s*)anchoPantalla',r'\1anchoDisponible',s,count=1)
    s=once(s,r'<ScrollView\s*\n\s*contentContainerStyle=\{styles\.contenidoWeb\}',
           '<ScrollView\n        contentContainerStyle={styles.contenidoWeb}\n        onLayout={(evento) => setAnchoPanelResponsive(evento.nativeEvent.layout.width)}',
           'Stock viewport')
    return s


def patch_reportes(s):
    if 'anchoPanelResponsive' in s: return s
    if 'const tablet = width >= 760;' not in s:
        print('AVISO: ReportesLocales tiene otra version, no se ajusta automaticamente.')
        return s
    s=s.replace('  const tablet = width >= 760;',
                '  const [anchoPanelResponsive, setAnchoPanelResponsive] = useState(0);\n  const anchoDisponible = anchoPanelResponsive || width;\n  const tablet = anchoDisponible >= 760;',1)
    s=s.replace('(width - 128) / 5)', '(anchoDisponible - 128) / 5)').replace('(width - 66) / 2)', '(anchoDisponible - 66) / 2)')
    s=once(s,r'<ScrollView\s+keyboardShouldPersistTaps="handled"\s+contentContainerStyle=\{styles\.contenido\}',
           '<ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.contenido}\n        onLayout={(evento) => setAnchoPanelResponsive(evento.nativeEvent.layout.width)}',
           'Reportes viewport')
    s=s.replace("modalCaja: { width: '100%'", "modalCaja: { width: '100%', maxWidth: 600",1)
    return s


def patch_config(s):
    # Expo: permitir vertical y horizontal; en tablet se adapta a la rotacion.
    if re.search(r'"orientation"\s*:\s*"default"',s): return s
    return once(s,r'"orientation"\s*:\s*"portrait"',
                '"orientation": "default"','app.json orientacion')


def report_audit():
    lines=['PANTALLAS A REVISAR EN TELEFONO Y TABLET','','Anchos fijos de 400dp o mas (no necesariamente errores):','']
    for f in sorted(MOBILE.glob('*.tsx')):
        xs=[]
        for i,line in enumerate(f.read_text(encoding='utf-8-sig').splitlines(),1):
            if re.search(r'\bwidth\s*:\s*(?:[4-9]\d\d|[1-9]\d{3,})\b',line):
                xs.append(f'{i}: {line.strip()[:100]}')
        if xs:
            lines.append(f.name)
            lines.extend('  '+v for v in xs[:16])
            lines.append('')
    lines.append('Verificar con los modulos en pantallas reales; tablas en scroll horizontal son intencionales.')
    return '\n'.join(lines)+'\n'


def main():
    ensure(MOBILE.is_dir(),f'No existe {MOBILE}. Extrae la carpeta dentro de la raiz del proyecto.')
    targets=[('index.ts',patch_index),('AppAutenticado.tsx',patch_auth),('Login.tsx',patch_login),('App.tsx',patch_app),('app.json',patch_config)]
    for filename,method in [('StockLocales.tsx',patch_stock),('ReportesLocales.tsx',patch_reportes)]:
        if (MOBILE/filename).exists(): targets.append((filename,method))
    staged=[]
    for name,handler in targets:
        f=MOBILE/name
        ensure(f.is_file(),f'No se encontro {f}')
        original=f.read_text(encoding='utf-8-sig')
        updated=handler(original)
        if updated != original: staged.append((f,updated))
    if not staged:
        print('Este ajuste ya estaba aplicado; no hay cambios que hacer.')
        return
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    for f,updated in staged:
        backup=BACKUP_DIR/f.name
        shutil.copy2(f,backup)
        f.write_text(updated,encoding='utf-8')
        print(f'OK {f.relative_to(ROOT)} | respaldo: {backup.name}')
    (BACKUP_DIR/'REVISAR_RESPONSIVE.txt').write_text(report_audit(),encoding='utf-8')
    print('Respaldos y auditoria:',BACKUP_DIR)
    print('Hecho. Siguiente: cd mobile; npx expo install react-native-safe-area-context; npx tsc --noEmit')

if __name__=='__main__':
    try: main()
    except Exception as err:
        print('ERROR:',err,file=sys.stderr)
        sys.exit(1)
