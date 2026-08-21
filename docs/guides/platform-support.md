# Platform support

Celestial detects the terminal it's running in and degrades honestly. This
page is the support matrix and the fallback behavior you can rely on.

## Operating systems

| OS | Status | Notes |
| --- | --- | --- |
| Linux | Supported | CI runs framework and PTY tests on `ubuntu-latest`. |
| macOS | Supported | CI runs on `macos-latest` (arm64) and `macos-13` (x64). |
| Windows | Supported | Native win32 input bridge (`packages/nebula/src/win32-input.ts`); CI runs PTY tests on `windows-latest`. ConPTY is first-class. |

Node.js 22 or newer is required everywhere.

## Terminal capabilities

Atlas (`@celestial/atlas`) produces an immutable capability snapshot at
startup: color level, Unicode level, mouse, bracketed paste, focus events,
kitty keyboard, image protocols, synchronized output, performance class, and
the user's reduced-motion preference. The framework consumes it through
policy helpers rather than per-app guessing.

| Capability | When present | Fallback when absent |
| --- | --- | --- |
| Truecolor | Full RGB themes | 256-color palette → 16 base colors → no color |
| Mouse (SGR 1006) | Click/hover/drag/wheel regions | Keyboard paths on every interactive builder |
| Bracketed paste | Multiline paste as one event | Character-stream input |
| Kitty keyboard | Disambiguated modifiers, key release | Legacy control-byte encoding |
| Focus in/out (DEC 1004) | Window-focus subscriptions | Feature simply silent |
| Synchronized output (DEC 2026) | Flicker-free frame swaps | Direct writes |
| Unicode (wide/full/16) | Grapheme-accurate wide glyphs | Conservative width estimates |

## Environment variables and dumb terminals

- `NO_COLOR` (any value) → color level `none`; styling suppresses color but
  layout, borders, and interaction still work.
- `TERM=dumb` → color `none`, mouse/paste/focus protocols disabled.
- `CI=true` does not change rendering; apps decide their own CI behavior.
  `@celestial/test` exists for headless runs.
- `FORCE_COLOR` is intentionally not an override for capability policy;
  styling honors the detected level.

## Multiplexers

tmux, screen, and zellij are detected and downgraded through
`applyMultiplexerDowngrades`: protocols that break inside the multiplexer
(passthrough-dependent features) are stripped while core input and rendering
continue.

## Motion

`shouldAnimate(caps)` combines the reduced-motion OS preference with the
terminal's performance class. Mirage effects and Nova transitions honor it
with deterministic static end states — no partial animations on slow or
accessibility-configured terminals.

## Inline mode

`app(config, { inline: true | { height } })` renders within existing terminal
content without the alternate screen, preserving scrollback — the mode
`inlinePrompt` uses for CLI tools.
