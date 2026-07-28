export { auditA11yTree } from './automation/a11y-audit.js';
export { auditInteractionTree } from './automation/interaction-audit.js';
export type {
  AutomationA11yAuditResult,
  AutomationA11yRuleName,
  AutomationA11yViolation,
  AutomationActionSnapshot,
  AutomationElementSnapshot,
  AutomationInteractionAuditOptions,
  AutomationInteractionRuleName,
  AutomationSnapshot,
  AutomationTextRun,
} from './automation/contracts.js';
export { fingerprintAutomationSnapshot } from './automation/fingerprint.js';
export { createLensBridgeClientFromEnv, type LensBridgeClient, type LensBridgeCommand } from './automation/lens-bridge.js';
export type { VNodeMeta } from './automation/metadata.js';
export { getVNodeMeta, setVNodeMeta, withClass, withMetadata, withState } from './automation/metadata.js';
export { buildAutomationSnapshot } from './automation/snapshot.js';
export { extractAutomationTextRuns, extractNodeText } from './automation/text.js';
