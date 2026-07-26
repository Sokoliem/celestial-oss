# @celestial/compass

Validated, dependency-free navigation primitives for terminal applications.
Compass provides local URL parsing, deterministic route matching, immutable
history, a headless router, and a modal-safe screen stack. It does not render
views or own animation.

## Installation

Celestial is currently pre-release:

```bash
pnpm add @celestial/compass@preview
```

Contributors using Compass inside this monorepo should reference the workspace
package instead:

```json
{
  "dependencies": {
    "@celestial/compass": "workspace:*"
  }
}
```

## Local URLs

Compass accepts only local URLs beginning with `/`. Parsed queries preserve
pair order and repeated keys.

```ts
import { parseUrl, serializeUrl } from '@celestial/compass';

const location = parseUrl('/users/alice?tab=files&tag=a&tag=b#recent');
// {
//   pathname: "/users/alice",
//   query: [["tab", "files"], ["tag", "a"], ["tag", "b"]],
//   hash: "recent",
//   href: "/users/alice?tab=files&tag=a&tag=b#recent"
// }

serializeUrl({
  pathname: '/search',
  query: [['q', 'terminal UI']],
});
// "/search?q=terminal%20UI"
```

Authorities, control characters, malformed encodings, dot segments, empty
interior path segments, and prototype-sensitive keys are rejected.

## Route matching

Routes have stable IDs. Static segments outrank named parameters, which
outrank a terminal named catch-all, regardless of declaration order.

```ts
import { matchRoute } from '@celestial/compass';

const routes = [
  { id: 'user', pattern: '/users/:id' },
  { id: 'admin', pattern: '/users/admin' },
  { id: 'files', pattern: '/files/*path' },
] as const;

matchRoute(routes, '/users/admin')?.route.id; // "admin"
matchRoute(routes, '/files/docs/readme')?.params.path; // "docs/readme"
```

Ambiguous duplicate structures, repeated parameter names, unnamed or
non-terminal catch-alls, duplicate IDs, and malformed patterns fail during
validation.

## History and router

History always contains at least one parsed location and returns immutable
snapshots. Structurally valid external models, such as restored persistence
data, are canonicalized into frozen snapshots before Compass exposes or
retains them. Even frozen external objects are rebuilt: identity reuse is
reserved for privately branded Compass snapshots, so external Proxies are
never retained after validation.

```ts
import {
  createHistory,
  createRouter,
  currentLocation,
  pushHistory,
} from '@celestial/compass';

let history = createHistory('/');
history = pushHistory(history, '/users/alice');
currentLocation(history).href; // "/users/alice"

const router = createRouter({
  routes: [
    { id: 'home', pattern: '/' },
    { id: 'user', pattern: '/users/:id' },
  ],
});

let model = router.init();
model = router.update(
  { type: 'router:navigate', location: '/users/alice' },
  model,
);

const resolution = router.resolve(model);
if (resolution.status === 'matched') {
  resolution.match.route.id; // "user"
} else {
  console.error(resolution.diagnostic.message);
}
```

The router is intentionally headless: `resolve` returns route data or an
explicit `route-not-found` diagnostic. It never fabricates a fallback view.
An omitted configured location defaults to `/`; an explicit `null` or another
invalid location is rejected instead of being treated as omission.

Public descriptors, route definitions, messages, and persisted models are
accepted only through own data properties. Accessors are rejected without
being invoked. Array inputs must be dense; arrays with custom prototypes or
extra properties are copied into canonical frozen arrays rather than retained.

## Screen stack

The screen stack is a single immutable stack. Modal screens can leave only
through `screen:dismiss`, which records a dismissal receipt.

```ts
import {
  createScreenStack,
  screenStackUpdate,
} from '@celestial/compass';

let screens = createScreenStack({ id: 'home' });
screens = screenStackUpdate(
  { type: 'screen:push', id: 'confirm-delete', modal: true },
  screens,
);
screens = screenStackUpdate(
  { type: 'screen:dismiss', result: true },
  screens,
);

screens.lastDismissal;
// { screen: { id: "confirm-delete", modal: true }, result: true }
```

`screen:push`, `screen:replace`, and `screen:pop` reject attempts to bypass an
active modal. A modal root is also rejected because it could not be dismissed.
Accepted external stack models are re-snapshotted before their screens or
dismissal receipts are exposed.

Screen params and dismissal results are recursively detached and frozen.
Supported nested values are primitive values other than symbols, dense arrays,
and plain records with enumerable own data properties. Accessors, custom
record prototypes, symbol keys or values, functions, circular references, and
impractically large arrays fail closed.

## License

MIT
