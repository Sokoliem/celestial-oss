# @celestial/atlas

Canonical passive capability registry for the Celestial TUI ecosystem.

## What It Owns

- Terminal and surface capability detection
- Capability snapshots and cache management
- Fallback policy helpers such as preferred image protocol and animation policy
- Surface overrides for terminal-adjacent renderers like Portal and test fixtures

## What It Does Not Own

- Runtime orchestration
- Event delivery
- Active terminal negotiation or probes that require I/O

Active protocol negotiation stays in the owning package. For example, Prism keeps DA1 sixel probing.

## Quick Start

```ts
import { getCapabilities, getPreferredImageProtocol, shouldAnimate } from '@celestial/atlas';

const caps = getCapabilities();
const protocol = getPreferredImageProtocol(caps);
const animate = shouldAnimate(caps);
```
