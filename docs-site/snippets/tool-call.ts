import { toolCall } from '@celestial/ui';

/**
 * toolCall returns a full component descriptor: init() seeds the model,
 * update(msg, model) folds messages, and view(model) renders the card.
 * onToggle reports the next collapsed state when the user clicks the card
 * or presses Space/Enter while it is focused.
 */
export const bashCard = toolCall({
  name: 'bash',
  status: 'success',
  input: { command: 'pnpm run test:pty' },
  output: '✓ 68 tests passed (0 failures) [2.1s]',
  durationMs: 840,
  collapsed: false,
  onToggle: (collapsed) => console.info('bash card', collapsed ? 'collapsed' : 'expanded'),
});

export const [bashCardModel] = bashCard.init();
export const bashCardView = bashCard.view(bashCardModel);
