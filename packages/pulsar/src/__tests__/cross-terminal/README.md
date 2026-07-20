# Cross-Terminal Snapshot CI (C7)

This directory houses the cross-terminal rendering validation harness for
`@celestial/pulsar`. The goal: ensure markdown renders consistently across
supported terminal emulators.

## Supported emulators

| Emulator     | Protocol support      | Test status |
|-------------|----------------------|-------------|
| kitty       | kitty graphics, OSC 8 | planned     |
| alacritty   | sixel, OSC 8          | planned     |
| iTerm2      | iterm inline images   | planned     |
| Windows Terminal | sixel, OSC 8     | planned     |
| ghostty     | kitty graphics, OSC 8 | planned   |
| contour     | sixel, OSC 8          | planned     |
| tmux-nested | passthrough           | planned     |

## Structure

- `corpora/` — synthetic markdown documents used for snapshot generation.
- `cross-terminal.test.ts` — harness that runs each corpus through each
  emulator and compares against stored baselines.
- `README.md` — this file.

## Running locally

```bash
pnpm test src/__tests__/cross-terminal/cross-terminal.test.ts
```

Emulators that are not installed on the runner are skipped with a warning.

## Adding a new corpus

1. Add a `.md` file to `corpora/`.
2. Run `pnpm test --update` to regenerate baselines.
3. Review the diff and commit the new baseline.

## Baseline policy

- Baselines are stored per-emulator + per-corpus.
- Diff tolerance is 0% for text content; image protocols use structural
  comparison (presence/absence of escape sequences).
- Baseline drift requires explicit reapproval via `pnpm test --update`.
