# @celestial/mirage

Text effects for the Celestial TUI ecosystem. Gradients, shimmer, glow, breathing, color cycling, and eased/animated variants — all producing ANSI-styled strings.

## Installation

Celestial is pre-release and not published to npm yet. Clone the monorepo, run the root install flow in [`README.md`](../../README.md), then use this package from a workspace app or example inside the repo.

## Highlights

- **Gradient** — horizontal, vertical, and diagonal color gradients on text
- **Shimmer** — sweeping highlight band across text
- **Glow** — padded text with radiating color halo
- **Breathe** — smooth oscillation between two colors
- **Color Cycle** — per-character hue shifting over time
- **Spotlight** — focus highlight with a soft radial falloff
- **Underline Wave** — animated squiggle underline beneath text
- **Stencil** — knockout text cut from a solid or gradient fill
- **Eased variants** — shimmer, breathe, and color cycle with configurable easing functions
- **Animated Gradient** — scrolling gradient that shifts color stops over time
- **Color interpolation** — OKLAB, OKLCH, and general color interpolation utilities

## Quick Start

```typescript
import {
  gradient, shimmer, glow, breathe, colorCycle, spotlight, underlineWave, stencil,
  easedShimmer, easedBreathe, easedColorCycle, animatedGradient,
  colorToHSL, interpolateOKLAB, interpolateOKLCH, interpolateColor,
} from '@celestial/mirage';
import { color } from '@celestial/corona';

gradient('Hello World', { from: color.hex('#ff0088'), to: color.hex('#0088ff') });

shimmer('Loading...', { tick: model.tick, color: color.hex('#ffffff') });

glow('Important!', { color: color.hex('#00ff88') });

spotlight('Focus the middle', { center: 8, radius: 4 });

underlineWave('Deprecated', { tick: model.tick, color: color.hex('#ff5a5a') });

stencil('VOID', { fill: [color.hex('#00d1ff'), color.hex('#0047ff')] });
```

## API Reference

### `gradient(text, opts)`

Apply a color gradient to text. Supports `horizontal` (default), `vertical`, and `diagonal` directions. Provide either `from` + `to` for a two-color gradient, or `colors` with at least two entries for a multi-stop gradient.

```typescript
gradient('Hello', { from: color.hex('#ff0000'), to: color.hex('#0000ff') });

gradient('Multi-stop', { colors: ['#ff0000', '#00ff00', '#0000ff'] });

gradient('Vertical', { from: color.red, to: color.blue, direction: 'vertical' });

gradient('Diagonal', { from: color.red, to: color.blue, direction: 'diagonal' });
```

**`GradientOpts`**

| Field | Type | Required | Default |
|-------|------|----------|---------|
| `from` | `Color` | from+to or colors | — |
| `to` | `Color` | from+to or colors | — |
| `colors` | `Color[]` | from+to or colors | — |
| `direction` | `'horizontal' \| 'vertical' \| 'diagonal'` | no | `'horizontal'` |

### `shimmer(text, opts)`

Apply a sweeping highlight band across text. The band position advances with `tick * speed` and wraps around.

```typescript
shimmer('Loading...', { tick: model.tick, color: color.hex('#ffffff') });

shimmer('Custom', {
  tick: model.tick,
  color: color.hex('#ffff00'),
  baseColor: color.hex('#1a1a2e'),
  width: 5,
  speed: 2,
});
```

**`ShimmerOpts`**

| Field | Type | Required | Default |
|-------|------|----------|---------|
| `tick` | `number` | yes | — |
| `speed` | `number` | no | `1` |
| `color` | `Color` | no | white |
| `baseColor` | `Color` | no | dim gray (L=30) |
| `width` | `number` | no | `3` |

### `glow(text, opts)`

Pads text with spaces on each side, colored with decreasing intensity of the glow color. The text itself gets a full foreground + dimmed background.

```typescript
glow('Important!', { color: color.hex('#00ff88') });

glow('Wide glow', { color: color.hex('#ff4488'), intensity: 4 });
```

**`GlowOpts`**

| Field | Type | Required | Default |
|-------|------|----------|---------|
| `color` | `Color` | yes | — |
| `intensity` | `number` | no | `2` |

### `breathe(text, opts)`

Smoothly oscillates between two colors using a sine wave. Applies a single color to the entire text.

```typescript
breathe('Pulsing', { from: color.hex('#003366'), to: color.hex('#00ccff'), tick: model.tick });

breathe('Fast', { from: color.red, to: color.yellow, tick: model.tick, speed: 3 });
```

**`BreatheOpts`**

| Field | Type | Required | Default |
|-------|------|----------|---------|
| `from` | `Color` | yes | — |
| `to` | `Color` | yes | — |
| `tick` | `number` | yes | — |
| `speed` | `number` | no | `1` |

### `colorCycle(text, opts)`

Each character gets a hue that shifts with position and time, creating a moving rainbow.

```typescript
colorCycle('Rainbow Text', { tick: model.tick });

colorCycle('Vivid', { tick: model.tick, saturation: 100, lightness: 50, speed: 2 });
```

**`ColorCycleOpts`**

| Field | Type | Required | Default |
|-------|------|----------|---------|
| `tick` | `number` | yes | — |
| `speed` | `number` | no | `1` |
| `saturation` | `number` | no | `80` |
| `lightness` | `number` | no | `60` |

### `spotlight(text, opts)`

Highlights a character range with a soft falloff while dimming the rest of the text.

```typescript
spotlight('Search Result', { center: 7, radius: 4 });

spotlight('Animated focus', {
  center: 5,
  radius: 3,
  tick: model.tick,
  color: color.hex('#ffffff'),
  dimLevel: 0.25,
});
```

**`SpotlightOpts`**

| Field | Type | Required | Default |
|-------|------|----------|---------|
| `center` | `number` | yes | — |
| `radius` | `number` | yes | — |
| `color` | `Color` | no | white |
| `dimLevel` | `number` | no | `0.3` |
| `tick` | `number` | no | — |

### `underlineWave(text, opts)`

Appends a second animated underline line below each input line.

```typescript
underlineWave('Validation error', { tick: model.tick, color: color.hex('#ff5a5a') });
```

**`UnderlineWaveOpts`**

| Field | Type | Required | Default |
|-------|------|----------|---------|
| `tick` | `number` | yes | — |
| `color` | `Color` | no | white |
| `amplitude` | `number` | no | `1` |
| `wavelength` | `number` | no | `6` |
| `speed` | `number` | no | `1` |

### `stencil(text, opts)`

Cuts the input text out of a filled bounding box, using spaces for visible glyphs and a solid or gradient fill everywhere else.

```typescript
stencil('VOID', {
  fill: [color.hex('#00d1ff'), color.hex('#0047ff')],
  bgChar: '█',
});
```

**`StencilOpts`**

| Field | Type | Required | Default |
|-------|------|----------|---------|
| `fill` | `Color \| Color[]` | yes | — |
| `bgChar` | `string` | no | `'█'` |

### `easedShimmer(text, opts)`

Shimmer with an eased band position. Uses a ping-pong cycle controlled by `cycleTicks` with an optional `EasingFn` from `@celestial/aurora`.

```typescript
import { easing } from '@celestial/aurora';

easedShimmer('Smooth', { tick: model.tick, easing: easing.easeInOut });

easedShimmer('Custom cycle', {
  tick: model.tick,
  cycleTicks: 90,
  speed: 1.5,
  color: color.hex('#ffcc00'),
});
```

**`EasedShimmerOpts`** (extends `ShimmerOpts`)

| Field | Type | Required | Default |
|-------|------|----------|---------|
| `tick` | `number` | yes | — |
| `speed` | `number` | no | `1` |
| `color` | `Color` | no | white |
| `baseColor` | `Color` | no | dim gray (L=30) |
| `width` | `number` | no | `3` |
| `cycleTicks` | `number` | no | `60` |
| `easing` | `EasingFn` | no | `easeInOut` |

### `easedBreathe(text, opts)`

Breathe with eased interpolation using a ping-pong pattern instead of a raw sine wave.

```typescript
easedBreathe('Smooth', {
  from: color.hex('#003366'),
  to: color.hex('#00ccff'),
  tick: model.tick,
});
```

**`EasedBreatheOpts`**

| Field | Type | Required | Default |
|-------|------|----------|---------|
| `from` | `Color` | yes | — |
| `to` | `Color` | yes | — |
| `tick` | `number` | yes | — |
| `speed` | `number` | no | `1` |
| `cycleTicks` | `number` | no | `120` |
| `easing` | `EasingFn` | no | `easeInOut` |

### `easedColorCycle(text, opts)`

Color cycle with eased per-character hue distribution. The easing function is applied to each character's position ratio.

```typescript
easedColorCycle('Clustered', { tick: model.tick, easing: easing.easeIn });

easedColorCycle('Spread', { tick: model.tick, easing: easing.linear });
```

**`EasedColorCycleOpts`**

| Field | Type | Required | Default |
|-------|------|----------|---------|
| `tick` | `number` | yes | — |
| `speed` | `number` | no | `1` |
| `saturation` | `number` | no | `80` |
| `lightness` | `number` | no | `60` |
| `easing` | `EasingFn` | no | `easeInOut` |

### `animatedGradient(text, opts)`

Scrolling gradient that shifts color stop positions over time. Supports the same `horizontal`, `vertical`, and `diagonal` directions as `gradient`.

```typescript
animatedGradient('Scrolling', {
  colors: [color.hex('#ff0088'), color.hex('#00ff88'), color.hex('#0088ff')],
  tick: model.tick,
});

animatedGradient('Vertical scroll', {
  colors: [color.hex('#1a1a2e'), color.hex('#0f3460'), color.hex('#e94560')],
  tick: model.tick,
  direction: 'vertical',
  speed: 2,
});
```

**`AnimatedGradientOpts`**

| Field | Type | Required | Default |
|-------|------|----------|---------|
| `colors` | `Color[]` | yes (min 2) | — |
| `tick` | `number` | yes | — |
| `speed` | `number` | no | `1` |
| `direction` | `'horizontal' \| 'vertical' \| 'diagonal'` | no | `'horizontal'` |

## Color Utilities

### `colorToHSL(c)`

Convert a `Color` to HSL values. Returns `[h, s, l]` where `h` is 0–360, `s` is 0–100, `l` is 0–100.

```typescript
const [h, s, l] = colorToHSL(color.hex('#ff4488'));
```

### `interpolateOKLAB(l1, a1, b1, l2, a2, b2, ratio)`

Linear interpolation between two OKLAB values. `ratio` is clamped to 0–1. Returns `[L, a, b]`.

```typescript
const [L, a, b] = interpolateOKLAB(0.5, 0.1, 0.05, 0.8, -0.05, 0.1, 0.5);
```

### `interpolateOKLCH(l1, c1, h1, l2, c2, h2, ratio)`

Interpolation between two OKLCH values using the shortest hue path. `ratio` is clamped to 0–1. Returns `[L, C, h]`.

```typescript
const [L, C, h] = interpolateOKLCH(0.7, 0.15, 120, 0.5, 0.2, 300, 0.5);
```

### `interpolateColor(from, to, ratio)`

Interpolate between two `Color` values using OKLAB linear interpolation. Returns a new `Color`.

```typescript
const mid = interpolateColor(color.hex('#ff0000'), color.hex('#0000ff'), 0.5);
```

## Terminal Support

Effects require truecolor (24-bit) support for best results. On terminals with limited color support, colors are automatically downsampled.

| Terminal | Support |
|----------|---------|
| Kitty | Full |
| iTerm2 | Full |
| Alacritty | Full |
| Windows Terminal | Full |
| GNOME Terminal | Full |
| Screen/Tmux | Limited (256-color) |

## Related Packages

- **@celestial/aurora** — Animation primitives (easing functions, tweens, springs)
- **@celestial/corona** — Color, styling, borders, gradients, themes

## License

MIT
