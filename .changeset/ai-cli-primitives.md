---
'@celestial/ui': minor
---

Rework the AI & CLI primitives to the component contract: `toolCall` is now a full component descriptor with typed messages, deterministic ids, theme-token contracts, and a focus-gated keyboard toggle; `diffViewer` ships a state-accurate unified-diff parser (hunk-aware headers, `\ No newline` handling, metadata/binary safety, combined-diff preservation) with theme tokens and width-aware chrome; `inlinePrompt` is rebuilt as Elm apps in inline mode with `PromptCancelledError`, validation, grapheme-safe editing, and non-TTY fallbacks.
