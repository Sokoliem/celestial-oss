/** Replace terminal control and bidi-control characters in untrusted Markdown. */
export function sanitizeTerminalText(value: string): string {
  return value
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/g, '\ufffd')
    .replace(/[\u202a-\u202e\u2066-\u2069]/g, '\ufffd');
}
