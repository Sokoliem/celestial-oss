# @celestial/atlas

Canonical passive capability registry for the Celestial TUI ecosystem.

Atlas answers the question every other package asks first: *what can this
terminal actually do?* It produces a single immutable `AtlasCapabilities`
snapshot — color depth, Unicode level, mouse/focus/paste protocols, image
protocols, performance class, motion policy — that the runtime, styling,
animation, and charting packages use to degrade safely instead of guessing.

## What It Owns

- Terminal and surface capability detection (`AtlasCapabilities`)
- Capability snapshots and cache management
- Fallback policy helpers such as preferred image protocol and animation policy
- A terminal database (`TERMINAL_DB`) for known-emulator profiles
- Multiplexer detection and downgrade policy (tmux, screen, zellij)
- Surface overrides for terminal-adjacent renderers and test fixtures

## What It Does Not Own

- Runtime orchestration
- Event delivery
- Active terminal negotiation or probes that require I/O

Active protocol negotiation stays in the owning package. For example, Prism keeps DA1 sixel probing.

## The capability snapshot

```ts
import { getCapabilities } from '@celestial/atlas';

const caps = getCapabilities();
// caps.colorLevel:      'none' | '16' | '256' | 'truecolor'
// caps.unicodeLevel:    'none' | 'basic' | 'wide' | 'full' | 'unicode16'
// caps.mouseTracking / focusEvents / bracketedPaste / kittyKeyboard: boolean
// caps.reducedMotion:   honor the user's motion preference
// caps.performanceClass:'low' | 'standard' | 'high'
// …and image-protocol flags (kittyGraphics, iterm2Images, sixelGraphics).
```

`getCapabilities()` caches its snapshot; `detectCapabilities()` forces a fresh
detection and `resetCapabilitiesCache()` clears the cache (tests).
`getTerminalSize()` / `onResize(handler)` cover live geometry.

## Capability-driven fallbacks

The snapshot is designed for *policy*, not branching spaghetti:

```ts
import { getCapabilities, getPreferredImageProtocol, shouldAnimate } from '@celestial/atlas';

const caps = getCapabilities();
const protocol = getPreferredImageProtocol(caps); // 'kitty' | 'iterm2' | 'sixel' | 'octant' | … | 'none'
const animate = shouldAnimate(caps);              // false under reduced motion

if (caps.colorLevel === 'none') {
  // TERM=dumb or NO_COLOR: render without color or styling.
}
```

- `shouldAnimate(caps)` combines the reduced-motion preference with the
  performance class; Mirage and Nova honor it for deterministic static output.
- `canEmit(caps, protocol)` / `resolveSurfaceCapabilities(...)` gate optional
  protocols (see `EmitProtocol`).
- `detectMultiplexer()` + `applyMultiplexerDowngrades(caps)` strip protocols
  that break inside tmux/screen/zellij.
- `lookupTerminal(name)` / `TERMINAL_DB` provide known-emulator baselines;
  `DEFAULT_TERMINAL` is the conservative floor.

## Async detection

Some answers need a round-trip to the terminal. `detectCapabilitiesAsync()`,
`queryDeviceAttributes()`, and `querySecondaryAttributes()` perform DA1/DA2
queries with timeouts; the passive registry never blocks the render loop.

## Registry and surfaces

`createCapabilityRegistry()` / `getDefaultCapabilityRegistry()` let hosts
register custom `CapabilityDetector`s and produce named `CapabilityProfile`s
— how `@celestial/test` fixtures and non-terminal surfaces publish honest
capability sets instead of pretending to be a full emulator.

## Stability

Preview versions can change APIs between releases.

## License

MIT.
