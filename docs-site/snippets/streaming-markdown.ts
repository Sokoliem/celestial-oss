import { createMarkdownStream } from '@celestial/pulsar';

/**
 * Progressive markdown for token-streaming models: append chunks as they
 * arrive and read the snapshot. `snapshot.rendered` is ANSI-styled terminal
 * text. Blocks commit at paragraph boundaries — an unterminated code fence
 * stays pending instead of tearing the frame mid-stream.
 */
export const stream = createMarkdownStream({ width: 64 });

export const snapshot = stream.append(
  [
    '# Refactoring Architecture',
    '',
    'Here is the revised state management pipeline:',
    '',
    '1. Actions are dispatched to the **Elm runtime**',
    '2. Pure reducers return `[Model, Cmd]` tuples',
    '3. The virtual terminal renders without tearing',
    '',
    '```typescript',
    'const [model, cmd] = update(message, currentModel);',
    '```',
    '',
    '',
  ].join('\n'),
);
