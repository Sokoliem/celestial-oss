# Decision 0006: Inline prompts are Elm apps

- Status: Accepted
- Date: 2026-08-20
- Public packages: `@celestial/ui`

## Context

Clack/Inquirer-style inline prompts — question, answer, clean exit with
scrollback preserved — are a common CLI need. A first implementation used raw
`node:readline` with `process.stdin.setRawMode` and direct ANSI writes. That
model is incompatible with the framework it ships in:

- an unowned raw-mode stdin and unmanaged stdout writes corrupt a running
  Celestial app's frame diff and fight its input routing;
- `process.exit(130)` inside library code kills the host on Ctrl+C;
- the promise could never reject — no Escape path existed;
- the `validate` option was declared but never called, and `initial` was
  never displayed;
- hardcoded ANSI escapes ignored themes, capabilities, and grapheme widths.

## Decision

`inlinePrompt.text/confirm/select` are small Elm applications run through
`app()` with the `inline: { height }` option.

- Inline mode renders within existing terminal content — no alternate screen
  — so scrollback history is preserved when the prompt finishes. The prompt
  owns the terminal briefly and returns it through the same crash-recovery
  path as any app.
- Cancellation (Escape or Ctrl+C) rejects with the exported
  `PromptCancelledError`. Library code never calls `process.exit`.
- Non-interactive streams (no TTY on stdin or stdout) resolve documented
  defaults: `initial` for text and confirm, the `initialIndex` option for
  select. CLIs therefore behave sanely under pipes.
- `validate` returns `true` or an error string shown inline while editing
  continues. `initial` prefills the value with the cursor at the end.
- Editing moves the cursor in grapheme units (rosetta), with left/right,
  home/end, backspace/delete, and masking; multi-scalar graphemes that arrive
  as multiple key events cannot push the cursor past the cluster.
- Each method accepts an advanced `{ terminal }` option. Supplying a backend
  implies interactive intent, skips the non-TTY fallback, and is the
  headless-testing seam.
- The underlying app factories (`createTextPromptApp`,
  `createSelectPromptApp`, `createConfirmPromptApp`) are public composition
  seams but are not curated builders and do not count toward the builder
  ledger.

## Boundary with Orbit

Prompts *inside* a running Celestial app are `@celestial/orbit`'s lane:
schema-driven fields, validation, and wizards composed into the host's own
update loop. `inlinePrompt` is for standalone CLIs. Rebuilding in-app prompts
on the inline runner was rejected because two prompts cannot own one terminal
and the inline renderer has no notion of a host's layout.

## Consequences and gates

- Headless tests drive every prompt type through a mock backend: editing,
  grapheme clusters, validation retry, Escape/Ctrl+C rejection, wrapping
  navigation, initial values, and non-TTY fallbacks.
- The `minimal-prompt` scaffold template typechecks against the packed
  export surface in CI.
- Concurrent prompts and prompts over a live app remain unsupported by
  contract, documented in the package README.
