import { inlinePrompt, PromptCancelledError } from '@celestial/ui';

/**
 * Inline prompts are small Celestial apps that run without the alternate
 * screen, so scrollback is preserved when they finish. Each call resolves
 * with the answer; Escape or Ctrl+C rejects with PromptCancelledError and
 * never exits the process.
 */
export const projectName = {
  message: 'Project name',
  placeholder: 'my-cli',
  validate: (value: string) => (value.length >= 3 ? true : 'Too short'),
};

export const environment = {
  message: 'Select deployment environment',
  options: [
    { label: 'Production', value: 'prod', hint: 'us-east-1' },
    { label: 'Staging', value: 'stage', hint: 'active canary' },
    { label: 'Local Dev', value: 'dev', hint: 'localhost:8080' },
  ],
};

export async function promptForLaunch(): Promise<{ name: string; env: string } | null> {
  try {
    const name = await inlinePrompt.text(projectName);
    const env = await inlinePrompt.select(environment);
    return { name, env };
  } catch (error) {
    if (error instanceof PromptCancelledError) return null;
    throw error;
  }
}
