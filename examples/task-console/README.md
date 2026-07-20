# Task Console

A supported Celestial preview demo that runs three bundled Node worker fixtures and streams structured progress into an Elm-style TUI.

```bash
pnpm demo:tasks
```

Use the arrow keys or mouse to select a task. Press `a` to run all, `r` to retry, `x` to cancel, `Ctrl+P` for commands, and `q` to quit. The test task fails on its first attempt so the retry path is visible.
