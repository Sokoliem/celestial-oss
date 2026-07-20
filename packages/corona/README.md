# @celestial/corona

Styling foundation for the Celestial TUI ecosystem. Provides colors (ANSI 16/256/truecolor with OKLAB/OKLCh), text styling, borders, gradients, layout utilities, themes, accessibility, structured logging, spinners, and semantic text-style helpers.

## Installation

Celestial is pre-release and not published to npm yet. Clone the monorepo, run the root install flow in [`README.md`](../../README.md), then use this package from a workspace app or example inside the repo.

## Highlights

- **Color** — ANSI 16, 256, truecolor (24-bit), hex, RGB, HSL, OKLAB, OKLCh with auto-degradation
- **Color arithmetic** — darken, lighten, saturate, desaturate, mix, complement, triad, analogous, grayscale, invert, WCAG contrast/luminance/accessibility checks
- **Color interpolation** — perceptually uniform OKLAB and OKLCh lerp, animation-ready `interpolator`
- **Style** — immutable composable style objects with responsive breakpoint support
- **Borders** — rounded, square, double, thick, hidden + custom; `render()`, `titled()`, and `renderGradientBorder()`
- **Gradient** — first-class `Gradient` type with OKLAB-space interpolation between color stops
- **Shadow** — `renderShadow()` for depth and elevation
- **Layout** — join, place, table, wrap (all ANSI-aware)
- **Theme** — low-level token bags + semantic `SemanticTheme` with tones, spacing, and glyphs; `createTheme()` deep-merges onto `defaultTheme`
- **Domain tokens** — canonical status, safety, lifecycle, and app chrome color families for flagship TUI surfaces
- **Accessibility** — high contrast, ANSI stripping, screen reader announcements, contrast repair, theme audits, and reduced-motion detection
- **Logging** — structured logger with trace/debug/info/warn/error/fatal levels, console + JSON transports, pretty/compact formatters
- **Spinners** — 80+ built-in spinner definitions, composable transforms, high-level `createSpinner()` runner
- **Text-style** — semantic helpers: `label`, `value`, `hint`, `error`, `success`, `warning`, `keyBinding`, `divider`, `active`, `colored`, `when`

## Quick Start

```typescript
import {
  color, style, border, gradient, renderGradientBorder, renderShadow, truncate,
  joinH, joinV, place, table, wrap,
  createTheme, defaultTheme, ensureReadableColor, auditTheme,
  createLogger,
  createSpinner, spinners,
  label, value, error, success,
} from '@celestial/corona';

const s = style({ color: color.hex('#00ff88'), bold: true });
s.render('Hello');

const g = gradient([color.blue, color.red]);
g.sample(0.5);

const frame = renderGradientBorder({
  border: border.rounded,
  width: 24,
  height: 6,
  gradient: gradient([color.blue, color.magenta]),
});

const elevated = renderShadow(frame);

const log = createLogger({ level: 'debug' });
log.info('Server started', { port: 3000 });

const readableAccent = ensureReadableColor(color.cyan, [defaultTheme.colors.background]);
const report = auditTheme(defaultTheme);

const sp = createSpinner('dots', { text: 'Loading...' });
sp.start();
sp.succeed('Done!');
```

---

## Color

```typescript
import { color, resetColorLevelCache, type Color, type ColorLevel } from '@celestial/corona';
```

### ColorLevel

```typescript
type ColorLevel = 'truecolor' | '256' | '16' | 'none';
```

### Named Colors (ANSI 16)

```typescript
color.black
color.red
color.green
color.yellow
color.blue
color.magenta
color.cyan
color.white
color.gray
color.brightRed
color.brightGreen
color.brightYellow
color.brightBlue
color.brightMagenta
color.brightCyan
color.brightWhite
color.reset
```

### Constructors

```typescript
color.ansi(code: number): Color  // 256-color range (0–255)
color.hex(hex: string): Color
color.rgb(r: number, g: number, b: number): Color
color.hsl(h: number, s: number, l: number): Color
color.oklab(l: number, a: number, b: number): Color
color.oklch(l: number, c: number, h: number): Color
color.adaptive(darkHex: string, lightHex: string): Color
color.fromAnsi(ansi: string): Color | null
```

### Terminal Detection

```typescript
color.level: ColorLevel
resetColorLevelCache(): void
```

`color.level` is a cached getter that auto-detects terminal color support via env vars (`NO_COLOR`, `FORCE_COLOR`, `COLORTERM`, `TERM`). Call `resetColorLevelCache()` to force re-detection.

### Color Interface

```typescript
interface Color {
  fg(): string
  bg(): string
  degrade(level: ColorLevel): Color
  equals(other: Color): boolean
  readonly rgb: [number, number, number] | null
  readonly oklab: [number, number, number] | null
  readonly oklch: [number, number, number] | null
  readonly level: ColorLevel
}
```

### Color Arithmetic

```typescript
color.toHsl(c: Color): [number, number, number]
color.darken(c: Color, amount: number): Color
color.lighten(c: Color, amount: number): Color
color.saturate(c: Color, amount: number): Color
color.desaturate(c: Color, amount: number): Color
color.mix(c1: Color, c2: Color, ratio?: number): Color
color.complement(c: Color): Color
color.triad(c: Color): [Color, Color, Color]
color.analogous(c: Color, count?: number, angle?: number): Color[]
color.toGrayscale(c: Color): Color
color.invert(c: Color): Color
```

`darken`/`lighten`/`saturate`/`desaturate` amounts are 0–100 (percentage points).
`mix` ratio: 0 = all c1, 1 = all c2, 0.5 = equal.
`analogous` defaults: `count = 3`, `angle = 30`.

### WCAG Accessibility

```typescript
color.luminance(c: Color): number
color.contrastRatio(fg: Color, bg: Color): number
color.isAccessible(fg: Color, bg: Color, level?: 'AA' | 'AAA', largeText?: boolean): boolean
```

### Interpolation

```typescript
color.lerp(from: Color, to: Color, t: number): Color
color.lerpOklch(from: Color, to: Color, t: number): Color
color.interpolator(from: Color, to: Color, t: number): Color
```

`lerp` interpolates in OKLAB space (perceptually uniform). `lerpOklch` uses OKLCh with shortest hue path. `interpolator` is an alias for `lerp`, designed to pass to `aurora`'s `TweenConfig.interpolate`.

---

## Style

```typescript
import { style, truncate, type Style, type StyleProps, type ResolvedStyleProps, type StyleEffects, type BreakpointName, type Responsive } from '@celestial/corona';
```

### style()

```typescript
function style(props: StyleProps): Style
```

### Style Interface

```typescript
interface Style {
  render(text: string, breakpoint?: BreakpointName): string
  merge(overrides: Partial<StyleProps>): Style
  unset<K extends keyof StyleProps>(key: K): Style
  measureWidth(text: string, breakpoint?: BreakpointName): number
  readonly props: Readonly<StyleProps>
  resolve(breakpoint: BreakpointName): ResolvedStyleProps
}
```

### StyleProps

Every property accepts a `Responsive<T>` wrapper — either a plain value or a breakpoint map:

```typescript
type Responsive<T> = T | { [key in BreakpointName]?: T }
type BreakpointName = 'xs' | 'sm' | 'md' | 'lg' | 'xl'

interface StyleProps {
  color?: Responsive<Color>
  background?: Responsive<Color>
  bold?: Responsive<boolean>
  italic?: Responsive<boolean>
  underline?: Responsive<boolean>
  strikethrough?: Responsive<boolean>
  dim?: Responsive<boolean>
  blink?: Responsive<boolean>
  reverse?: Responsive<boolean>
  hidden?: Responsive<boolean>
  padding?: Responsive<number | [number, number] | [number, number, number, number]>
  margin?: Responsive<number | [number, number] | [number, number, number, number]>
  width?: Responsive<number>
  height?: Responsive<number>
  align?: Responsive<'left' | 'center' | 'right'>
  border?: Responsive<Border>
  borderColor?: Responsive<Color>
  effects?: Responsive<StyleEffects>
  elevation?: Responsive<number>
  icon?: Responsive<string>
}
```

Padding/margin accept: `number` (all sides), `[vertical, horizontal]`, or `[top, right, bottom, left]`.

### StyleEffects

```typescript
interface StyleEffects {
  glass?: boolean
  blur?: number
  opacity?: number
  tint?: Color
  vignette?: number
  scanline?: number
  noise?: number
}
```

### truncate()

```typescript
function truncate(text: string, maxWidth: number): string
```

ANSI-aware truncation that preserves escape sequences and appends a reset code if any SGR was opened.

---

## Border

```typescript
import {
  border,
  renderGradientBorder,
  renderShadow,
  type Border,
  type BorderChars,
  type FocusBorderOptions,
  type GradientBorderOpts,
  type ShadowOpts,
  type TitleAlign,
} from '@celestial/corona';
```

### Pre-defined Borders

```typescript
border.rounded  // ╭─╮│╰╯
border.square   // ┌─┐│└┘
border.double   // ╔═╗║╚╝
border.thick    // ┏━┓┃┗┛
border.hidden   // spaces (invisible)
```

### border.custom()

```typescript
border.custom(chars: BorderChars): Border
```

### border.render()

```typescript
border.render(content: string, b: Border, width?: number, borderColor?: Color, focusOptions?: FocusBorderOptions): string
```

### border.titled()

```typescript
border.titled(content: string, b: Border, width: number, title: string, options?: {
  titleAlign?: TitleAlign
  subtitle?: string
  subtitleAlign?: TitleAlign
  borderColor?: Color
  titleColor?: Color
  subtitleColor?: Color
  focused?: boolean
  focusColor?: Color
}): string
```

### renderGradientBorder()

```typescript
function renderGradientBorder(opts: GradientBorderOpts): string
```

```typescript
renderGradientBorder({
  border: border.rounded,
  width: 24,
  height: 6,
  gradient: gradient([color.blue, color.magenta]),
  direction: 'clockwise',
  title: 'Status',
});
```

### Types

```typescript
interface Border { readonly chars: BorderChars }
interface BorderChars {
  topLeft: string; top: string; topRight: string
  left: string; right: string
  bottomLeft: string; bottom: string; bottomRight: string
}
type TitleAlign = 'left' | 'center' | 'right'
interface FocusBorderOptions { focused?: boolean; focusColor?: Color }
interface GradientBorderOpts {
  border: Border
  width: number      // outer box width
  height: number     // outer box height
  gradient: Gradient
  direction?: 'clockwise' | 'horizontal' | 'vertical'
  title?: string
  titleAlign?: TitleAlign
}
```

---

## Shadow

```typescript
function renderShadow(content: string, opts?: ShadowOpts): string
```

```typescript
renderShadow('Panel', { offsetX: 2, offsetY: 1, style: 'fade' });
```

```typescript
interface ShadowOpts {
  offsetX?: number
  offsetY?: number
  color?: Color
  style?: 'solid' | 'fade'
}
```

---

## Gradient

```typescript
import { gradient, type Gradient, type GradientStop } from '@celestial/corona';
```

### gradient()

```typescript
function gradient(stops: GradientStop[] | Color[]): Gradient
```

Pass an explicit stop array or a plain color array (evenly spaced):

```typescript
const g1 = gradient([
  { at: 0, color: color.blue },
  { at: 0.5, color: color.yellow },
  { at: 1, color: color.red },
]);

const g2 = gradient([color.blue, color.yellow, color.red]);
```

### Gradient Interface

```typescript
interface Gradient {
  readonly stops: readonly GradientStop[]
  sample(t: number): Color
}

interface GradientStop {
  at: number
  color: Color
}
```

Interpolation between stops uses OKLAB space for perceptually uniform transitions.

---

## Layout

```typescript
import { joinH, joinV, place, table, wrap } from '@celestial/corona';
```

### joinH()

```typescript
function joinH(left: string, right: string, gap?: number): string
```

Join two multi-line blocks side by side. `gap` defaults to `0`.

### joinV()

```typescript
function joinV(top: string, bottom: string, gap?: number): string
```

Join two multi-line blocks vertically. `gap` defaults to `0`.

### place()

```typescript
function place(content: string, width: number, height: number, hAlign?: 'left' | 'center' | 'right', vAlign?: 'top' | 'middle' | 'bottom'): string
```

Place content within a fixed-size box. Defaults: `hAlign = 'left'`, `vAlign = 'top'`.

### table()

```typescript
function table(rows: string[][], colWidths?: number[]): string
```

Render a 2D array as a columnar table. Columns are auto-sized if `colWidths` is omitted.

```typescript
table([
  ['Name', 'Status', 'Uptime'],
  ['web-01', 'running', '99.9%'],
  ['db-01', 'running', '99.5%'],
]);
```

### wrap()

```typescript
function wrap(text: string, maxWidth: number): string
```

Word-wrap text to a max width, preserving ANSI escape sequences.

---

## Theme

```typescript
import {
  theme, createTheme, defaultTheme,
  resolveToneColor, resolveSpacing,
  type Theme, type SemanticTheme, type ThemeInput, type ThemeContrastPolicy,
  type ThemeColors, type ThemeGlyphs, type Tone, type Size,
} from '@celestial/corona';
```

### defaultTheme

A pre-built `SemanticTheme` that adapts to dark vs light terminals via `color.adaptive()`:

```typescript
const t = defaultTheme;
t.colors.text      // body text
t.colors.muted     // subdued text
t.colors.border    // border color
t.colors.surface   // component background
t.colors.inverse   // inverted surface
t.colors.tones.neutral
t.colors.tones.accent
t.colors.tones.info
t.colors.tones.success
t.colors.tones.warning
t.colors.tones.danger
t.spacing.xs       // 0
t.spacing.sm       // 1
t.spacing.md       // 2
t.spacing.lg       // 3
t.spacing.xl       // 4
t.glyphs.divider   // '─'
t.glyphs.bullet    // '•'
t.glyphs.pointer   // '▸'
// ... see ThemeGlyphs for full list
```

### theme() — Low-level Token Bag

```typescript
function theme<T extends Record<string, Color>>(tokens: T): Theme<T>
```

Creates a frozen readonly record of named colors:

```typescript
const myTheme = theme({
  primary: color.hex('#00ff88'),
  secondary: color.hex('#8888ff'),
  background: color.hex('#1a1a2e'),
});
```

### createTheme() — Semantic Theme

```typescript
function createTheme(input?: ThemeInput): SemanticTheme
```

Deep-merges partial overrides onto `defaultTheme`:

```typescript
const custom = createTheme({
  colors: {
    tones: { accent: color.hex('#a78bfa') },
  },
  spacing: { lg: 4 },
});
```

Theme construction is contrast-safe by default. `createTheme()` repairs
semantic text, state, border, and elevated-surface tokens before returning the
theme, so curated components receive readable and visibly distinct tokens even
when an override is unsafe. The default policy enforces WCAG AA text contrast
(4.5:1), graphical contrast (3:1), and a deterministic distinction between
adjacent surfaces.

```typescript
const hardened = createTheme({
  colors: {
    text: color.hex('#303030'),
    surface: color.hex('#303030'),
  },
  contrast: {
    minimum: 4.5,
    graphicalMinimum: 3,
    surfaceMinimum: 1.12,
  },
});

validateThemeContrast(hardened).pass; // true
```

Set `contrast.enforce` to `false` only in diagnostic tooling that deliberately
constructs an invalid theme for auditing. Application themes and component
token contracts should leave enforcement enabled.

### resolveToneColor()

```typescript
function resolveToneColor(themeOrInput?: SemanticTheme | ThemeInput, tone?: Tone): Color
```

### resolveSpacing()

```typescript
function resolveSpacing(size?: Size, themeOrInput?: SemanticTheme | ThemeInput): number
```

### Types

```typescript
type Tone = 'neutral' | 'accent' | 'info' | 'success' | 'warning' | 'danger'
type Size = 'xs' | 'sm' | 'md' | 'lg' | 'xl'

type Theme<T extends Record<string, Color> = Record<string, Color>> = Readonly<T>

interface SemanticTheme {
  colors: ThemeColors
  spacing: Record<Size, number>
  glyphs: ThemeGlyphs
}

interface ThemeColors {
  text: Color; muted: Color; border: Color; surface: Color; inverse: Color
  tones: Record<Tone, Color>
}

interface ThemeGlyphs {
  divider: string       // '─' — horizontal line / section separator
  bullet: string        // '•' — list item marker
  keycapLeft: string    // '[' — left side of keyboard key indicator
  keycapRight: string   // ']' — right side of keyboard key indicator
  tagPrefix: string     // '#' — tag/prefix indicator
  selected: string      // '▸' — selected item marker (lists, menus)
  unselected: string    // '○' — unselected item marker
  menuArrow: string     // '▾' — dropdown/submenu arrow
  checked: string       // '◉' — checked checkbox
  unchecked: string     // '○' — unchecked checkbox
  radioOn: string       // '◉' — selected radio button
  radioOff: string      // '○' — unselected radio button
  pipe: string          // '│' — vertical separator
  ellipsis: string      // '…' — truncated text indicator
  pointer: string       // '▸' — general pointer / cursor
  doubleArrowH: string  // '⇄' — horizontal double arrow
  doubleArrowV: string  // '⇅' — vertical double arrow
  cornerTL: string      // '╭' — top-left corner
  cornerTR: string      // '╮' — top-right corner
  cornerBL: string      // '╰' — bottom-left corner
  cornerBR: string      // '╯' — bottom-right corner
}

interface ThemeInput {
  colors?: Partial<Omit<ThemeColors, 'tones'>> & { tones?: Partial<Record<Tone, Color>> }
  spacing?: Partial<Record<Size, number>>
  glyphs?: Partial<ThemeGlyphs>
  contrast?: ThemeContrastPolicy
}

interface ThemeContrastPolicy {
  enforce?: boolean
  minimum?: number
  graphicalMinimum?: number
  surfaceMinimum?: number
}
```

---

## Accessibility

```typescript
import {
  highContrast,
  stripAllStyles,
  announceText,
  reduceMotion,
  ensureReadableColor,
  normalizeThemeContrast,
  auditTheme,
  type AnnouncePriority,
} from '@celestial/corona';
```

```typescript
highContrast(text: string): string
stripAllStyles(text: string): string
announceText(message: string, priority?: AnnouncePriority): string
reduceMotion(): boolean
ensureReadableColor(foreground: Color, backgrounds: Color | readonly Color[], options?: EnsureReadableColorOptions): Color
normalizeThemeContrast(theme: SemanticTheme, options?: NormalizeThemeContrastOptions): SemanticTheme
auditTheme(theme: SemanticTheme, options?: ThemeAuditOptions): ThemeAuditReport
```

`AnnouncePriority = 'polite' | 'assertive'`. `reduceMotion()` checks `NO_MOTION` and `REDUCE_MOTION` env vars. `ensureReadableColor()` nudges a foreground toward the readable black/white target in OKLCh space, `normalizeThemeContrast()` repairs semantic foregrounds, interaction states, borders, and elevation surfaces, and `auditTheme()` combines contrast, glyph, motion, PTY transform, and optional color-vision checks for release gates. `createTheme()` invokes normalization automatically unless diagnostic code explicitly opts out.

---

## PTY Theme Transforms

```typescript
import { createPtyThemeTransform, type PtyThemeConfig } from '@celestial/corona';

const transform = createPtyThemeTransform({
  variant: 'mono',
  ansi16: [
    '#101216', '#c84747', '#61b36a', '#c4a84d',
    '#5d8fd6', '#b779d6', '#51b7b7', '#d7dce2',
    '#6f7782', '#e26464', '#7bd885', '#e2c767',
    '#7aa8ef', '#d098ee', '#72d6d6', '#ffffff',
  ],
});
```

`createPtyThemeTransform()` composes ANSI-16 palette remapping with the selected PTY transform variant. It returns `undefined` for the identity/no-palette case so renderers can skip per-cell color work.

---

## Logging

```typescript
import {
  createLogger,
  consoleTransport, jsonTransport,
  pretty, json, compact,
  LOG_LEVELS, shouldLog,
  type Logger, type LogEntry, type LogLevel, type Transport, type FormatterFn, type LoggerConfig,
} from '@celestial/corona';
```

### createLogger()

```typescript
function createLogger(config?: LoggerConfig): Logger
```

```typescript
const log = createLogger({
  level: 'debug',
  transports: [consoleTransport()],
  context: { service: 'api' },
});

log.info('Started', { port: 3000 });
log.error('Failed', { code: 'ECONNREFUSED' });

const child = log.child({ requestId: 'abc' });
child.warn('Slow request', { duration: 5230 });
```

### Logger Interface

```typescript
interface Logger {
  trace(message: string, data?: Record<string, unknown>): void
  debug(message: string, data?: Record<string, unknown>): void
  info(message: string, data?: Record<string, unknown>): void
  warn(message: string, data?: Record<string, unknown>): void
  error(message: string, data?: Record<string, unknown>): void
  fatal(message: string, data?: Record<string, unknown>): void
  child(context: Record<string, unknown>): Logger
}
```

### Transports

```typescript
consoleTransport(options?: { formatter?: FormatterFn; level?: LogLevel }): Transport
jsonTransport(options?: { stream?: NodeJS.WritableStream }): Transport
```

`consoleTransport` writes to `process.stderr`. `jsonTransport` writes one JSON line per entry.

### Formatters

```typescript
pretty(): FormatterFn
json(): FormatterFn
compact(): FormatterFn
```

`pretty()` — ANSI-styled with timestamp, level badge, and dimmed context/data.
`json()` — one JSON line per entry.
`compact()` — `[LEVEL] message`, no timestamp.

### Levels

```typescript
type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal'

const LOG_LEVELS: Record<LogLevel, number>
// trace=0, debug=10, info=20, warn=30, error=40, fatal=50

shouldLog(messageLevel: LogLevel, configuredLevel: LogLevel): boolean
```

### Types

```typescript
interface LogEntry {
  readonly level: LogLevel
  readonly message: string
  readonly timestamp: Date
  readonly context: Record<string, unknown>
  readonly data?: Record<string, unknown>
}

interface LoggerConfig {
  readonly level?: LogLevel
  readonly transports?: Transport[]
  readonly context?: Record<string, unknown>
  readonly formatter?: FormatterFn
}

interface Transport { readonly write: (entry: LogEntry) => void }
type FormatterFn = (entry: LogEntry) => string
```

---

## Spinner

```typescript
import {
  resolve, renderAt, fromFrames, procedural, registerAll, lookup, listNames,
  reverse, mirror, concat, alternate, speed, mapFrames,
  prefix, suffix, pad, colorize, rainbow, bold, dim, gradient as spinnerGradient,
  beside, stretch, sample, slide, fillEmpty,
  createSpinner,
  spinners, symbols,
  type SpinnerDefinition, type ResolvedSpinner, type Frame,
  type RunnerOptions, type SpinnerTransform, type SpinnerInstance,
} from '@celestial/corona';
```

### SpinnerInstance (High-level Runner)

```typescript
function createSpinner(spinner?: string | SpinnerDefinition, options?: RunnerOptions): SpinnerInstance
```

```typescript
const sp = createSpinner('dots', { text: 'Building...', prefix: '>>', indent: 2 });
sp.start();
sp.update('Still building...');
sp.succeed('Build complete!');

sp.stop();
sp.fail('Build failed');
sp.warn('Warning issued');
sp.info('See logs');
```

```typescript
interface SpinnerInstance {
  start(text?: string): SpinnerInstance
  stop(): SpinnerInstance
  succeed(text?: string): SpinnerInstance
  fail(text?: string): SpinnerInstance
  warn(text?: string): SpinnerInstance
  info(text?: string): SpinnerInstance
  update(text: string): SpinnerInstance
  setSpinner(spinner: string | SpinnerDefinition): SpinnerInstance
  readonly isSpinning: boolean
  text: string
}
```

### RunnerOptions

```typescript
interface RunnerOptions {
  spinner?: string | SpinnerDefinition
  text?: string
  color?: string
  stream?: NodeJS.WritableStream   // defaults to process.stderr
  hideCursor?: boolean              // defaults to true
  prefix?: string                   // text prepended before the spinner
  indent?: number                   // number of spaces to indent; defaults to 0
}
```

### Engine (Pure Functions)

```typescript
resolve(def: SpinnerDefinition): ResolvedSpinner
renderAt(spinner: ResolvedSpinner, elapsedMs: number): Frame
fromFrames(name: string, frames: readonly string[], interval?: number): SpinnerDefinition
procedural(name: string, render: (tick: number) => string, interval?: number): SpinnerDefinition
registerAll(spinners: Record<string, SpinnerDefinition>): void
lookup(name: string): SpinnerDefinition | undefined
listNames(): string[]
```

### Composition Operators

All operators return a new `SpinnerDefinition` and can be chained:

```typescript
const custom = concat(
  colorize(spinners.dots, 36),
  speed(spinners.dots, 120),
);
```

```typescript
reverse(spinner: SpinnerDefinition): SpinnerDefinition
mirror(spinner: SpinnerDefinition): SpinnerDefinition
concat(...spinners: SpinnerDefinition[]): SpinnerDefinition
alternate(...spinners: SpinnerDefinition[]): SpinnerDefinition
speed(spinner: SpinnerDefinition, intervalMs: number): SpinnerDefinition
mapFrames(spinner: SpinnerDefinition, fn: (frame: Frame, index: number) => Frame): SpinnerDefinition
prefix(spinner: SpinnerDefinition, pre: string): SpinnerDefinition
suffix(spinner: SpinnerDefinition, suf: string): SpinnerDefinition
pad(spinner: SpinnerDefinition, width: number, char?: string): SpinnerDefinition
colorize(spinner: SpinnerDefinition, ansiCode: number): SpinnerDefinition
rainbow(spinner: SpinnerDefinition, codes?: number[]): SpinnerDefinition
bold(spinner: SpinnerDefinition): SpinnerDefinition
dim(spinner: SpinnerDefinition): SpinnerDefinition
gradient(spinner: SpinnerDefinition, fromRgb: [number, number, number], toRgb: [number, number, number]): SpinnerDefinition
beside(left: SpinnerDefinition, right: SpinnerDefinition, separator?: string): SpinnerDefinition
stretch(spinner: SpinnerDefinition, factor: number): SpinnerDefinition
sample(spinner: SpinnerDefinition, every: number): SpinnerDefinition
slide(pattern: string, windowSize: number, interval?: number): SpinnerDefinition
fillEmpty(filled: string, empty: string, width: number, interval?: number): SpinnerDefinition
```

### Built-in Spinners

The `spinners` object contains 80+ built-in definitions organized by category:

```typescript
spinners.dots          spinners.dots2         spinners.dots3        ... spinners.dots12
spinners.line          spinners.arrow         spinners.circle       spinners.star
spinners.bouncingBar   spinners.material      spinners.aesthetic    spinners.moon
spinners.clock         spinners.earth         spinners.matrix       spinners.noise
spinners.heartbeat     spinners.breathe       spinners.orbit        spinners.glitch
spinners.brailleWave   spinners.brailleSpiral spinners.sineWave     spinners.dvd
// ... and 60+ more
```

### Types

```typescript
type Frame = string

interface SpinnerDefinition {
  readonly name: string
  readonly frames?: readonly Frame[]
  readonly render?: (tick: number) => Frame
  readonly interval?: number  // defaults to 80 (ms)
}

interface ResolvedSpinner {
  readonly name: string
  readonly interval: number
  frame(tick: number): Frame
  readonly length: number
}

type SpinnerTransform = (spinner: SpinnerDefinition) => SpinnerDefinition
```

### symbols

```typescript
symbols.success  // ✔ (or √ on Windows)
symbols.error    // ✖ (or × on Windows)
symbols.warning  // ⚠ (or ‼ on Windows)
symbols.info     // ℹ (or i on Windows)
```

---

## Text-Style Helpers

```typescript
import {
  createTextStyle, label, value, hint, keyBinding,
  error, success, warning, divider, when, active, colored,
  type TextStyleConfig, type TextStyle,
} from '@celestial/corona';
```

Standalone functions use a default text-style instance:

```typescript
label('Name:')
value('Celestial')
hint('(optional)')
keyBinding('q', 'Quit')
error('Connection failed')
success('Deployed!')
warning('Low disk space')
divider(40)
active('Active', true)
active('Inactive', false)
colored('custom', color.hex('#ff00ff'))
when(true, 'yes', 'no')
```

### createTextStyle()

```typescript
function createTextStyle(config?: TextStyleConfig): TextStyle
```

```typescript
const ts = createTextStyle({
  labelColor: color.brightCyan,
  valueColor: color.brightWhite,
  hintColor: color.gray,
  errorColor: color.brightRed,
  successColor: color.brightGreen,
  warningColor: color.brightYellow,
});

ts.label('Status:');
ts.keyBinding('s', 'Save');
ts.combine(ts.label('Port: '), ts.value('3000'));
ts.when(isConnected, ts.success('Online'), ts.error('Offline'));
```

### TextStyleConfig

```typescript
interface TextStyleConfig {
  labelColor?: Color
  valueColor?: Color
  hintColor?: Color
  keyColor?: Color
  errorColor?: Color
  successColor?: Color
  warningColor?: Color
  activeColor?: Color
}
```

### TextStyle Interface

```typescript
interface TextStyle {
  label(text: string): string
  value(text: string): string
  hint(text: string): string
  key(text: string): string
  keyBinding(key: string, description: string): string
  error(text: string): string
  success(text: string): string
  warning(text: string): string
  colored(text: string, c: Color): string
  divider(width: number, char?: string): string
  active(text: string, isActive: boolean, customActiveColor?: Color): string
  combine(...segments: string[]): string
  when(condition: boolean, ifTrue: string, ifFalse?: string): string
}
```

---

## Domain Tokens

```typescript
import {
  statusTokens,
  safetyTokens,
  lifecycleTokens,
  appChromeTokens,
  defineDomainTokens,
  resolveDomainTokens,
  type DomainTokenContract,
  type StatusTokenValues,
  type SafetyTokenValues,
  type LifecycleTokenValues,
  type AppChromeTokenValues,
} from '@celestial/corona';
```

- `statusTokens` covers `success`, `warning`, `danger`, and `info`
- `safetyTokens` covers `safe`, `caution`, `destructive`, and `irreversible`
- `lifecycleTokens` covers `pending`, `inflight`, `suspended`, `succeeded`, `failed`, `cancelled`, and `retrying`
- `appChromeTokens` covers flagship app chrome roles such as panel surfaces, overlays, menus, selected rows, badges, focus rings, and resize handles

`destructive` is intentionally orange-leaning so it reads as "confirm first", while `irreversible` uses the full danger channel.

---

## Related Packages

- **@celestial/nebula** — Core runtime (Elm Architecture, vdom, signals)
- **@celestial/aurora** — Animation primitives (tweens, springs, easing)
- **@celestial/constellation** — UI components using corona styles
- **@celestial/ui** — Accessible components styled with Corona's semantic tokens
- **@celestial/telescope** — Testing utilities for Celestial apps

## License

MIT
