# Versionado del sistema y componentes de UI institucional

Estado: IMPLEMENTADO y en producción. Documenta (1) el esquema de versionado del
sistema y cómo mostrarlo, y (2) los componentes de UI institucional compartidos
(footer, header, stepper) que estandarizan la apariencia del RGM Digital.

## 1. Versionado — Semantic Versioning (SemVer)

El sistema usa **SemVer**: `MAYOR.MENOR.PARCHE` (ej. `1.4.2`), con sufijos de
pre-lanzamiento cuando aplica. Referencia: https://semver.org/lang/es/

### Fuente única de verdad
- La versión vive SOLO en `frontend-matriculas/package.json` → campo `version`.
- NO escribir la versión a mano en ningún componente. Se inyecta en el build:
  - `vite.config.ts` importa `package.json` (`import pkg from './package.json' with { type: 'json' }`)
    y la expone con `define: { __APP_VERSION__: JSON.stringify(pkg.version) }`.
  - El tipo global está declarado en `src/vite-env.d.ts` (`declare const __APP_VERSION__: string;`).
  - `src/components/Footer.tsx` la muestra como `Versión {__APP_VERSION__}` en la franja inferior.
  - Requisito TS: `tsconfig.node.json` tiene `"resolveJsonModule": true` (necesario para
    importar el package.json en vite.config); el import usa `with { type: 'json' }` porque
    `module` es `nodenext`.
- Como Vite hornea la constante EN EL BUILD, tras cambiar la versión hay que re-`npm run build`
  para que el footer muestre el nuevo número.

### Cuándo subir cada número
| Tipo de cambio | Qué subir | Ejemplo |
|---|---|---|
| Arreglo de bug, ajuste menor, cambio de estilo | PARCHE | `1.0.0` → `1.0.1` |
| Funcionalidad nueva compatible (footer, stepper, reporte, filtro) | MENOR | `1.0.1` → `1.1.0` |
| Cambio grande / incompatible / rediseño / migración obligatoria | MAYOR | `1.1.0` → `2.0.0` |

### Fases de pre-lanzamiento
`alpha` (interno, inestable) → `beta` (pruebas con usuarios reales / piloto) →
`rc` (release candidate, casi listo) → sin sufijo = estable de producción.

- **Estado actual: `1.0.0-beta.1`.** Justificación: está en producción con el piloto real
  (Liceo Bicentenario Marítimo, RBD 1520), probado end-to-end (apoderado firmó con Clave
  Única), pero aún NO escalado a todos los colegios.
- **Cuándo pasar a `1.0.0`**: cuando se declare la puesta en marcha oficial / escalado a los
  demás establecimientos (ver carta Gantt en steering 08).

### Comandos para subir versión (npm actualiza package.json solo)
```
cd frontend-matriculas
npm version patch         # 1.0.0 -> 1.0.1
npm version minor         # 1.0.1 -> 1.1.0
npm version major         # 1.1.0 -> 2.0.0
npm version prerelease    # 1.0.0-beta.1 -> 1.0.0-beta.2
```
> `npm version` crea un commit y un tag git por defecto. Si NO se quiere el tag/commit
> automático, usar `npm version <x> --no-git-tag-version` y commitear a mano.
> Recordar: tras subir versión → `npm run build` → `git push prod main` → redeploy.

## 2. Componentes de UI institucional

### Footer — `src/components/Footer.tsx`
- Footer institucional compartido. Fondo azul SLEP `#25306B`, tipografía Museo Sans / gobCL.
- Franja decorativa superior (celeste `#006BB9` / rojo `#FF1D3D`), estilo Gobierno de Chile.
- **4 columnas** (`items-center`): 
  1. Logo DEP grande (`/images/logo-dep.png`, `h-32`). El logo trae su propio fondo azul/rojo,
     por eso va SIN recuadro blanco (sobre azul se integra). NO reintroducir recuadro.
  2. Soporte del sistema: "Desarrollado por SLEP Valparaíso" + **"Área de Tecnología e
     Informática"** (en bold, destacado).
  3. Contacto: dirección (Blanco 937, 2° piso, Valparaíso), correo `tecnologia@slepvalparaiso.cl`,
     horario (Lun–Jue 9:00–14:00 / 15:00–17:00, Vie 9:00–14:00).
  4. Marco normativo: referencia a la Resolución Exenta 0030/2021.
- **Franja inferior** (barra `#1d2650` más oscura): copyright "© {año} SLEP Valparaíso ·
  Sistema de Registro General de Matrícula Digital..." a la izquierda y "Versión
  {__APP_VERSION__}" a la derecha.
- Decisiones del dueño (iteradas): NO logo Mineduc, NO redes sociales, NO párrafo descriptivo
  largo; el logo DEP destacado; crédito del Área de Informática visible. Mantener así salvo
  nueva instrucción.
- Se usa en dos lugares: dentro de `Layout.tsx` (pantallas internas) y en `Login.tsx`.

### Header / Layout — `src/components/Layout.tsx`
- Header azul `#25306B`, altura `h-20`, logo SLEP `/images/logo_slep.png` a `h-14`
  (se agrandó desde `h-11`/`h-16`). Franja decorativa celeste/rojo arriba.
- **Footer pegado al fondo (sin franja blanca)**: el `<main>` es `flex-1 overflow-auto flex
  flex-col`; dentro, el bloque de contenido es `flex-1 p-6 lg:p-8` y luego va `<Footer />`.
  Así el contenido empuja el footer al borde inferior en pantallas altas y no queda fondo
  gris sobrante. NO volver a poner el footer suelto fuera de este patrón.

### Stepper — `src/components/Stepper.tsx`
- Indicador de progreso por pasos, estilo guía Gobierno Digital de Chile: círculos numerados
  conectados por línea, check en completados, actual resaltado con anillo, siguientes
  atenuados. Colores institucionales. Props: `pasos: {titulo, descripcion?}[]`, `pasoActual`
  (1-indexado), `className?`. Es PURAMENTE visual: no controla navegación.
- Usos actuales:
  - `features/matriculas/NuevaMatricula.tsx`: Identificación → Académico → Autorizaciones
    (reemplazó el indicador de píldoras anterior; `pasoActual` del hook `useNuevaMatricula`).
  - `features/matriculas/ConfirmarRenovacion.tsx` (flujo del piloto): Domicilio → Apoderado →
    Firma. El `pasoActual` se calcula localmente según secciones obligatorias completas
    (`domicilioOk`, `apoderadoOk`) — no parte el formulario en pasos, solo muestra avance.

## 3. Ideas del UI Kit Gobierno Digital pendientes (no implementadas)
Sugerencias para DESPUÉS de la puesta en marcha (no tocar antes del piloto):
- Badges de estado unificados (`estado_renovacion` / `estado_firma`).
- Upload con drag & drop (útil para firma manual en papel, steering 06).
- Snackbar/toast de feedback (ya existe `components/Toast`; evaluar estandarizar).
- Tipografía Roboto Slab en encabezados (cosmético; evaluar vs identidad SLEP actual).

## 4. Despliegue (recordatorio)
Solo cambió frontend en todas estas iteraciones (sin backend ni esquema). Deploy:
```
cd /opt/bitnami/nginx/apps/matriculas
git pull origin main
cd frontend-matriculas && npm ci && npm run build
```
No reiniciar backend ni Nginx (dist estático). Ctrl+F5 / incógnito por caché de Cloudflare.
Ver steering 03 y 04 para el detalle de operación y servidor.
