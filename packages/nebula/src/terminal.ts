/**
 * Low-level terminal control abstraction for the celesTUI ecosystem.
 *
 * Public facade for key parsing, ANSI helpers, and terminal backends.
 */

export { ansi } from './terminal/ansi.js';
export { createTerminal, type TerminalBackend } from './terminal/backend.js';
export { createKeyInputDecoder, type KeyEvent, type KeyInputDecoder, parseKeyInput } from './terminal/key-input.js';
