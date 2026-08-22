import { diffViewer } from '@celestial/ui';

/**
 * diffViewer is a pure view builder: pass unified diff text (or pre-parsed
 * DiffLine[]) and it renders numbered, theme-toned additions and deletions.
 */
export const serverDiff = diffViewer({
  title: 'src/server.ts',
  diffText: [
    '@@ -12,4 +12,4 @@',
    '   export function start() {',
    '-  const server = http.createServer(app);',
    '+  const server = createSecureServer(app);',
    '     server.listen(port);',
  ].join('\n'),
  showLineNumbers: true,
});
