# @celestial/core

The supported entry point for the Celestial TypeScript terminal UI preview.

```ts
import { Cmd, Sub, app, column, text } from '@celestial/core';
```

The root exports the common application, rendering, styling, layout, animation,
and interaction primitives. Advanced framework code can use the documented
subpaths such as `@celestial/core/nebula` without importing implementation
packages directly.
