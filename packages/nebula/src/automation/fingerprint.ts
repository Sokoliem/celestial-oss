import { createHash } from 'node:crypto';
import type { AutomationSnapshot } from './contracts.js';

export function fingerprintAutomationSnapshot(snapshot: AutomationSnapshot): string {
  return createHash('sha1')
    .update(
      JSON.stringify({
        text: snapshot.text,
        focusedActionId: snapshot.focusedActionId,
        actions: snapshot.actions.map((action) => ({
          id: action.id,
          label: action.label,
          role: action.role,
          focused: action.focused,
          row: action.row,
          col: action.col,
        })),
      }),
    )
    .digest('hex');
}
