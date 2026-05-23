# Zypace — Style Guide

Guia de referencia para mantener coherencia visual y de desarrollo en toda la plataforma: landing, web app y futuras apps nativas.

---

## 1. Fundamentos

### Filosofia visual

Zypace tiene una estetica **dark-first, precision engineering**. La landing page esta inspirada en cuadernos de ingenieria y planos tecnicos (Adrian Newey blueprint aesthetic). La app mantiene el tema oscuro pero con un enfoque funcional y de datos, usando gradientes para jerarquia visual.

### Principios

1. **Oscuridad con contraste**: fondo zinc-950, contenido sobre zinc-900, texto con contraste minimo WCAG AA (4.5:1)
2. **Lime como acento unico**: lime-400 (`#a3e635`) es el color de accion en toda la plataforma
3. **Tipografia de tres ejes**: display (Syne), condensed (Barlow Condensed), mono (Space Mono)
4. **Gradientes para jerarquia**: los bordes gradiente distinguen niveles de importancia en cards
5. **Sin modo claro**: toda la plataforma es dark-only

---

## 2. Colores

### Paleta base

| Token | Tailwind | Hex | Uso |
|-------|----------|-----|-----|
| Fondo pagina | `bg-zinc-950` | `#09090b` | Background global |
| Fondo card | `bg-zinc-900` | `#18181b` | Cards, modales, paneles |
| Fondo input | `bg-zinc-800` | `#27272a` | Inputs, toggles, chips inactivos |
| Borde sutil | `border-zinc-800` | `#27272a` | Separadores, bordes de card |
| Borde fuerte | `border-zinc-700` | `#3f3f46` | Bordes de input, divisores |
| Texto primario | `text-zinc-100` | `#f4f4f5` | Titulos, contenido principal |
| Texto secundario | `text-zinc-400` | `#a1a1aa` | Labels, texto de apoyo |
| Texto terciario | `text-zinc-500` | `#71717a` | Captions, metadata, placeholders |
| Texto decorativo | `text-zinc-600` | `#52525b` | Anotaciones, texto muy sutil |

### Color primario (CTA)

| Estado | Tailwind | Hex |
|--------|----------|-----|
| Default | `bg-lime-400` | `#a3e635` |
| Hover | `bg-lime-500` | `#84cc16` |
| Active | `bg-lime-600` | `#65a30d` |
| Texto sobre lime | `text-black` | `#000000` |
| Glow sutil | `bg-lime-400/10` | — |
| Borde activo | `border-lime-400` | `#a3e635` |
| Sombra CTA | `shadow-lime-400/10` | — |

### Colores semanticos (estados)

| Semantica | Dot / Badge | Fondo | Borde | Texto |
|-----------|-------------|-------|-------|-------|
| Exito | `bg-green-400` | `bg-green-900/50` | `border-green-800` | `text-green-400` |
| Peligro | `bg-red-400` | `bg-red-900/50` | `border-red-800` | `text-red-400` |
| Warning | `bg-amber-400` | `bg-amber-900/50` | `border-amber-800` | `text-amber-400` |
| Info | `bg-blue-400` | `bg-blue-900/50` | `border-blue-800` | `text-blue-400` |
| Positivo (TSB) | `bg-emerald-400` | `bg-emerald-950/40` | `border-emerald-800` | `text-emerald-400` |
| Negativo (TSB) | `bg-amber-400` | `bg-amber-950/40` | `border-amber-800` | `text-amber-400` |

### Colores de entrenamiento (TYPE_STYLES)

Cada tipo de sesion tiene su paleta completa. Estos colores son criticos para la identidad de la app.

| Tipo | Color hex | Dot | Fondo card | Borde | Texto |
|------|-----------|-----|------------|-------|-------|
| Suave | `#4ade80` | `bg-green-400` | `bg-green-950/60` | `border-green-800` | `text-green-400` |
| Largo | `#60a5fa` | `bg-blue-400` | `bg-blue-950/60` | `border-blue-800` | `text-blue-400` |
| Series | `#f87171` | `bg-red-400` | `bg-red-950/60` | `border-red-800` | `text-red-400` |
| Umbral | `#fbbf24` | `bg-amber-400` | `bg-amber-950/60` | `border-amber-800` | `text-amber-400` |
| Tempo | `#fb923c` | `bg-orange-400` | `bg-orange-950/60` | `border-orange-800` | `text-orange-400` |
| Subida | `#facc15` | `bg-yellow-400` | `bg-yellow-950/60` | `border-yellow-700` | `text-yellow-400` |
| Fuerza | `#c084fc` | `bg-purple-400` | `bg-purple-950/60` | `border-purple-800` | `text-purple-400` |
| Descanso | `#52525b` | `bg-zinc-600` | `bg-zinc-900` | `border-zinc-800` | `text-zinc-500` |

### Zonas de intensidad (graficos)

| Zona | Color | Uso |
|------|-------|-----|
| Z1 Facil/Largo | `bg-emerald-400` (`#34d399`) | Barras distribucion |
| Z4 Umbral/Tempo | `bg-lime-300` (`#bef264`) | Barras distribucion |
| Z5 Series | `bg-red-400` (`#f87171`) | Barras distribucion |

### Gradientes de card (bordes)

Se usan como `bg-gradient-to-br` sobre un wrapper de `p-[1px] rounded-2xl` para crear bordes gradiente:

| Jerarquia | Gradiente | Uso |
|-----------|-----------|-----|
| Primario | `from-lime-400 via-pink-500 to-purple-600` | Card principal (km semanales) |
| Secundario | `from-emerald-400 via-teal-500 to-cyan-600` | Distribucion intensidad |
| Terciario | `from-indigo-400 via-violet-500 to-fuchsia-600` | Cumplimiento semanal |
| Progreso | `from-yellow-400 via-lime-400 to-red-500` | Avance plan |
| Fitness | `from-violet-300 via-purple-200 to-indigo-300` | CTL/ATL/TSB |
| Strava | `from-blue-300 via-cyan-200 to-sky-200` | Datos Strava |
| Neutral | `from-slate-300 via-slate-200 to-slate-300` | Cards secundarias |

---

## 3. Tipografia

### Familias

```css
@theme {
  --font-display: 'Syne', sans-serif;         /* Headlines, titulos */
  --font-condensed: 'Barlow Condensed', sans-serif; /* Texto outline/hollow, labels compactos */
  --font-mono: 'Space Mono', 'Courier New', monospace; /* Datos, anotaciones, codigo */
}
```

Google Fonts link:
```html
<link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@700;800&family=Syne:wght@700;800&family=Space+Mono:wght@400;700&display=swap" rel="stylesheet" />
```

### Escala tipografica (app)

| Nivel | Tailwind | Uso |
|-------|----------|-----|
| H1 pagina | `text-4xl font-extrabold` | Titulo de pagina ("Tu Panel") |
| H2 seccion | `text-2xl font-bold` | Titulos de seccion, modales grandes |
| H3 card | `text-xl font-bold` | Titulos de card, modales |
| H4 sub | `text-lg font-semibold` | Subtitulos |
| Body | `text-sm` | Texto general, inputs |
| Caption | `text-xs` | Labels, tabs, botones pequenos |
| Micro | `text-[11px]` | Metadata |
| Nano | `text-[10px]` | Status labels, anotaciones |
| Pico | `text-[9px]` | Texto decorativo ingenieria |

### Escala tipografica (landing — clamp responsive)

| Elemento | Tamano | Font |
|----------|--------|------|
| Hero headline | `clamp(3.5rem, 11vw, 13rem)` | Syne 800 (filled) / Barlow Condensed 800 (outline) |
| Hero annotation | `clamp(0.75rem, 1.8vw, 2.2rem)` | Space Mono 400 |
| Section title | `clamp(2rem, 5.5vw, 6.5rem)` | Syne 800 / Barlow Condensed 800 |
| Price | `clamp(3rem, 7.5vw, 9rem)` | Syne 800 |
| Body landing | `clamp(0.85rem, 1.6vw, 1.6rem)` | System sans |

### Tecnica outline/hollow (solo landing)

```tsx
// Grande
const OUTLINE: React.CSSProperties = {
  fontFamily: "'Barlow Condensed', sans-serif",
  fontWeight: 800,
  WebkitTextStroke: '2px rgba(255,255,255,0.7)',
  color: 'transparent',
  letterSpacing: '0.02em',
};

// Pequeno
const OUTLINE_SM: React.CSSProperties = {
  fontFamily: "'Barlow Condensed', sans-serif",
  fontWeight: 800,
  WebkitTextStroke: '1.5px rgba(255,255,255,0.6)',
  color: 'transparent',
  letterSpacing: '0.02em',
};
```

Importante: siempre Barlow Condensed para outline (no Syne). Las contraformas de Barlow son mas abiertas y legibles en hollow a tamanos display.

### Pesos usados

| Peso | Tailwind | Uso |
|------|----------|-----|
| 900 | `font-black` | Numeros de impacto (km, TSB) |
| 800 | `font-extrabold` | Headlines H1 |
| 700 | `font-bold` | H2, H3, labels activos |
| 600 | `font-semibold` | Botones, nav activo |
| 500 | `font-medium` | Labels secundarios |
| 400 | (default) | Body copy |

---

## 4. Espaciado

### Container

```
max-w-7xl mx-auto px-4 sm:px-6 lg:px-8
```

### Padding de pagina

```
pt-8 pb-16  (paginas internas de app)
```

### Cards

```
p-5  — card estandar
p-6  — card con formulario o contenido denso
```

### Gaps

| Contexto | Gap |
|----------|-----|
| Grid de cards | `gap-6` a `gap-8` |
| Items dentro de card | `gap-2` a `gap-4` |
| Chips/toggles | `gap-1.5` |
| Seccion a seccion | `mb-8` a `mb-10` |

### Inputs

```
px-3 py-2.5  — inputs de formulario
px-4 py-2    — botones estandar
px-4 py-2.5  — botones CTA
```

---

## 5. Componentes

### 5.1 Botones

**Primario (CTA)**
```
bg-lime-400 text-black font-semibold px-4 py-2.5 rounded-lg
hover:bg-lime-500 active:bg-lime-600 transition-colors
disabled:opacity-50
```

**Secundario**
```
bg-zinc-800 border border-zinc-700 text-zinc-300 font-semibold px-4 py-2 rounded-lg
hover:bg-zinc-700 transition-colors
```

**Terciario / Cancel**
```
border border-zinc-600 text-zinc-400 px-4 py-2 rounded-lg
hover:bg-zinc-800 text-xs font-medium transition-colors
```

**Link inline**
```
text-zinc-400 hover:text-lime-400 transition-colors
```

**Toggle / Chip seleccionable**
```
// Base
px-3 py-1.5 rounded-lg text-xs font-semibold border-2 transition-colors

// Activo
border-lime-400 bg-lime-400/10 text-zinc-100

// Inactivo
border-zinc-700 bg-zinc-800 text-zinc-400 hover:border-lime-400/50
```

### 5.2 Inputs

**Input / Textarea estandar**
```
w-full px-3 py-2.5 border border-zinc-700 rounded-lg bg-zinc-800
text-zinc-100 placeholder-zinc-500 text-sm
focus:ring-2 focus:ring-lime-400 focus:border-lime-400
outline-none transition
```

**Select**
```
w-full rounded-lg border border-zinc-700 px-3 py-2.5 text-sm
bg-zinc-800 text-white
focus:ring-2 focus:ring-lime-400 focus:border-lime-400
outline-none transition
```

**Label**
```
block text-xs font-medium text-zinc-400 mb-1.5
```

**Error**
```
// Input con error: border-red-500 focus:ring-red-500
// Mensaje: text-red-400 text-sm
```

**Checkbox**
```
h-4 w-4 accent-lime-400 border-zinc-700 rounded
```

### 5.3 Cards

**Card simple**
```html
<div class="p-5 bg-zinc-900 border border-zinc-800 rounded-2xl">
  <!-- contenido -->
</div>
```

**Card con borde gradiente (gradient frame)**
```html
<div class="relative rounded-2xl p-[1px] bg-gradient-to-br from-lime-400 via-pink-500 to-purple-600 shadow-lg">
  <div class="rounded-2xl h-full w-full bg-zinc-900/90 backdrop-blur-sm p-5">
    <!-- contenido -->
  </div>
</div>
```

El gradiente del wrapper exterior define la jerarquia visual. Ver tabla de gradientes en seccion Colores.

### 5.4 Header (app)

```
bg-zinc-950/90 backdrop-blur supports-[backdrop-filter]:bg-zinc-950/80
border-b border-zinc-800 sticky top-0 z-40
```

- Logo: `h-8 w-auto` con filtro `brightness(0) invert(1)` (logo blanco sobre oscuro)
- Nav links: `text-sm font-medium`, activo: `text-lime-400 font-semibold`, inactivo: `text-zinc-400 hover:text-lime-400`
- Mobile: hamburguesa SVG custom, panel accordion con `transition-[max-height] duration-300`

### 5.5 Footer

```
border-t border-zinc-800 bg-zinc-950 text-zinc-400 text-sm
```

- Grid 4 columnas en desktop (`md:grid-cols-4`)
- Secciones: logo+desc, Producto, Soporte, Legal
- Links: `text-xs hover:text-lime-400 transition-colors`
- Bottom bar: `text-[11px] text-zinc-600`

### 5.6 Modales

```
// Overlay
fixed inset-0 z-50 flex items-center justify-center bg-black/60

// Panel
bg-zinc-900 border border-zinc-800 rounded-2xl shadow-xl
max-w-md (o max-w-lg) w-full mx-4
max-h-[90vh] overflow-y-auto p-6
```

### 5.7 Badges / Status dots

**Dot indicador**
```
w-1.5 h-1.5 rounded-full bg-{color}-400
```

**Badge de estado**
```
text-[10px] font-semibold px-2.5 py-1 rounded-full
bg-{color}-900/40 border border-{color}-800 text-{color}-400
```

---

## 6. Layout

### Estructura global

```
min-h-screen flex flex-col bg-zinc-950
  > AppHeader (sticky top-0 z-40)
  > main.flex-1 (contenido)
  > AppFooter (mt-auto)
```

### Breakpoints (Tailwind defaults)

| Prefix | Min-width | Uso tipico |
|--------|-----------|------------|
| (base) | 0 | Mobile |
| `sm:` | 640px | 2 columnas |
| `md:` | 768px | Nav desktop, grids |
| `lg:` | 1024px | 3 columnas, sidebar |
| `xl:` | 1280px | 4 columnas |

### Grids frecuentes

```
grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6  — Dashboard stats
grid grid-cols-1 lg:grid-cols-3 gap-8                  — Content + sidebar
grid grid-cols-7 gap-2                                  — Dias de la semana
grid md:grid-cols-2 gap-6                               — FAQ 2 columnas
grid md:grid-cols-4 gap-10                              — Footer
```

---

## 7. Bordes y radios

| Elemento | Radio |
|----------|-------|
| Cards, modales | `rounded-2xl` (16px) |
| Botones, inputs | `rounded-lg` (8px) |
| Chips, tags | `rounded-lg` (8px) |
| Minimo | `rounded` (4px) |
| Circular | `rounded-full` |

---

## 8. Sombras

| Nivel | Tailwind | Uso |
|-------|----------|-----|
| Sutil | `shadow-sm` | Cards secundarias |
| Media | `shadow-lg` | Cards con gradiente |
| Alta | `shadow-xl` | Modales |
| Maxima | `shadow-2xl` | Banners flotantes |
| Glow lime | `shadow-lime-400/10` | Botones CTA |
| Glow dark | `shadow-black/60` | Elementos elevados |

---

## 9. Animaciones

### Scroll reveal (global)

```css
[data-reveal] {
  opacity: 0;
  transform: translateY(28px);
  transition: opacity 0.9s cubic-bezier(0.16, 1, 0.3, 1),
              transform 0.9s cubic-bezier(0.16, 1, 0.3, 1);
}
[data-reveal].is-visible {
  opacity: 1;
  transform: translateY(0);
}
```

Activado por `IntersectionObserver` que anade clase `.is-visible`.

### SVG path draw (landing)

```css
.draw-path {
  stroke-dasharray: 1;
  stroke-dashoffset: 1;
  animation: drawPath 2.4s cubic-bezier(0.16, 1, 0.3, 1) 0.4s forwards;
}
```

### Transiciones comunes

```
transition-colors       — Todos los botones, links (150ms default)
transition              — Inputs (color + ring)
transition-all          — Barras de progreso
transition-[max-height] duration-300 ease-in-out  — Accordion mobile menu
animate-pulse           — Skeleton loaders
```

### Easing preferido

- Interacciones UI: default Tailwind (150ms ease)
- Scroll reveal / draw: `cubic-bezier(0.16, 1, 0.3, 1)` (ease-out exponencial)

---

## 10. Iconografia

- **Sin libreria de iconos externa**. Todos los iconos son SVG inline.
- Hamburguesa: SVG custom con `stroke="currentColor"`, path dinamico segun estado open/closed
- Indicadores: dots coloreados (`w-1.5 h-1.5 rounded-full`)
- Emojis usados como iconos en contextos informales (tips, estados de animo)
- Strava: logo oficial SVG importado
- Logo Zypace: PNG con `filter: brightness(0) invert(1)` para invertir a blanco

---

## 11. Landing page — Estetica ingenieria

Elementos exclusivos de la landing que no se usan en la app:

### Grid de plano

```tsx
const GRID: React.CSSProperties = {
  backgroundImage: `linear-gradient(rgba(163,230,53,0.035) 1px, transparent 1px),
                     linear-gradient(90deg, rgba(163,230,53,0.035) 1px, transparent 1px)`,
  backgroundSize: '64px 64px',
};
```

### Marcas de registro (RegMark)

Cruces con circulo en esquinas, simulando marcas de impresion tecnica:
```
w-6 h-6, lineas bg-zinc-800, circulo border-zinc-800
```

### Bloque de titulo (TitleBlock)

Tabla inferior derecha del hero tipo cajetin de plano tecnico:
```
font-mono text-[10px], border-zinc-800, grid de celdas con Proyecto/Rev/Escala/Ano
```

### Radial glows

```
bg-[radial-gradient(ellipse_55%_45%_at_8%_70%,rgba(163,230,53,0.06),transparent)]
```

Posicionados como `absolute inset-0 pointer-events-none` para ambientacion sutil.

### Video scroll

RAF-throttle pattern: un solo `requestAnimationFrame` por frame, guardado con flag `rafPending`. No usar lerp (causa artifacts de salto).

---

## 12. Patrones de datos y graficos

### Sparklines

SVG inline con `polyline`, datos mapeados a coordenadas. Sin libreria de charts.

### Barras apiladas (distribucion Z1/Z4/Z5)

Divs con `h-full` y width porcentual, coloreados segun zona:
```
Z1: bg-emerald-400
Z4: bg-lime-300
Z5: bg-red-400
```

### Graficos de fitness (CTL/ATL/TSB)

SVG custom con `linearGradient`:
```
CTL: #059669 → #06b6d4 (emerald → cyan)
ATL: #dc2626 → #f97316 (red → orange)
```

---

## 13. Estados interactivos

| Estado | Patron |
|--------|--------|
| Hover (boton) | `hover:bg-{next-shade}` |
| Hover (link) | `hover:text-lime-400` |
| Focus | `focus:ring-2 focus:ring-lime-400 focus:border-lime-400 outline-none` |
| Active (boton) | `active:bg-lime-600` |
| Disabled | `disabled:opacity-50` |
| Selected (nav) | `text-lime-400 font-semibold` |
| Selected (toggle) | `border-lime-400 bg-lime-400/10 text-zinc-100` |
| Completed (workout) | `ring-2 ring-green-400` |
| Error (input) | `border-red-500 focus:ring-red-500` |

---

## 14. Contraste y accesibilidad

### Reglas de contraste minimo sobre `#09090b`

| Tailwind | Ratio aprox. | Uso permitido |
|----------|-------------|---------------|
| `text-zinc-800` | ~1.3:1 | Nunca para texto legible |
| `text-zinc-700` | ~2:1 | Solo decorativo (lineas, bordes) |
| `text-zinc-600` | ~3:1 | Solo anotaciones decorativas (titulos de plano) |
| `text-zinc-500` | ~4.5:1 | Minimo para texto legible (captions, placeholders) |
| `text-zinc-400` | ~7:1 | Texto secundario, labels |
| `text-zinc-100` | ~18:1 | Texto primario |

**Regla**: todo texto que deba leerse usa minimo `text-zinc-500`. `text-zinc-600` y menores son solo decorativos.

### Focus visible

Todos los elementos interactivos llevan `focus:ring-2 focus:ring-lime-400`.

---

## 15. Nomenclatura y convenciones de codigo

### Archivos

- Paginas: `src/pages/{Name}Page.tsx` (PascalCase + "Page")
- Componentes: `src/components/{Name}.tsx` (PascalCase)
- Contextos: `src/context/{Name}Context.tsx`
- Tipos: `src/types.ts` o `src/types/`
- Assets: `src/assets/`

### CSS

- Tailwind v4 con `@import "tailwindcss"`
- Tokens custom en `@theme {}` dentro de `src/index.css`
- Clases utilitarias inline (no archivos CSS por componente)
- Estilos inline (`style={}`) solo para valores dinamicos o tecnicas CSS no disponibles en Tailwind (WebkitTextStroke, clamp custom)

### Constantes de estilo

Cuando un patron de estilos se repite dentro de un componente, extraer a constante local:
```tsx
const labelClass = "block text-xs font-medium text-zinc-400 mb-1.5";
const chipBase = "px-3 py-1.5 rounded-lg text-xs font-semibold border-2 transition-colors";
```

No crear archivos de constantes globales de estilo. Cada componente es autocontenido.

---

## 16. Resumen rapido

```
Fondo:       zinc-950
Cards:       zinc-900, rounded-2xl, border-zinc-800
Inputs:      zinc-800, rounded-lg, border-zinc-700
CTA:         lime-400, text-black, rounded-lg
Texto 1:     zinc-100
Texto 2:     zinc-400
Texto 3:     zinc-500
Display:     Syne 700-800
Condensed:   Barlow Condensed 700-800
Mono:        Space Mono 400-700
Outline:     Barlow Condensed 800 + WebkitTextStroke
Focus:       ring-2 ring-lime-400
Transicion:  transition-colors (default 150ms)
Tema:        dark-only
```
