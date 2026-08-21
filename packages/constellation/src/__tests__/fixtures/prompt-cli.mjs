// PTY fixture: drives inlinePrompt in a real terminal process.
// Built dist is required (packages/constellation/dist).
import { inlinePrompt, PromptCancelledError } from '../../../dist/index.js';

const mode = process.argv[2] ?? 'flow';

try {
  if (mode === 'cancel') {
    await inlinePrompt.text({ message: 'Secret' });
    console.log('UNREACHABLE');
  } else {
    const name = await inlinePrompt.text({ message: 'Project name' });
    console.log(`NAME=${name}`);
    const target = await inlinePrompt.select({
      message: 'Target',
      options: [
        { label: 'Node SEA', value: 'sea' },
        { label: 'Bun Native', value: 'bun' },
      ],
    });
    console.log(`TARGET=${target}`);
    const ok = await inlinePrompt.confirm({ message: 'Deploy?', initial: true });
    console.log(`DEPLOY=${ok}`);
    console.log('FLOW-COMPLETE');
  }
} catch (error) {
  if (error instanceof PromptCancelledError) {
    console.log('CANCELLED');
    process.exitCode = 0;
  } else {
    console.error(error);
    process.exitCode = 1;
  }
}
