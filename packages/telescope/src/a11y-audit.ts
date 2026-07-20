import { auditA11yTree, type VNode } from '@celestial/core/nebula';
import type { A11yAuditResult } from './types.js';

export function auditA11y(tree: VNode): A11yAuditResult {
  return auditA11yTree(tree);
}
