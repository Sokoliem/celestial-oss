import type { Color, SemanticTheme, ThemeInput, TokenContract } from '@celestial/core/corona';
import { border, sanitizeTerminalText, style } from '@celestial/core/corona';
import type { Sub as Subscription, ThemeContext, VNode } from '@celestial/core/nebula';
import { box, column, empty, event, focus, measure, row, Sub, scroll, setVNodeMeta, text } from '@celestial/core/nebula';
import { padCellText, wrapCellText } from '@celestial/rosetta';
import { generateFocusGroupId } from './focus-group.js';
import {
  buildNotificationGeometry,
  clampNotificationOffset,
  ensureNotificationVisible,
  moveNotificationSelectionByViewportRows,
  type NotificationGeometry,
  selectNotificationWindow,
} from './notification-geometry.js';
import type {
  NotificationEntry,
  NotificationId,
  NotificationModel,
  NotificationStore,
} from './notification-store.js';
import { useTokens } from './theme.js';

export interface NotificationCenterTokens {
  readonly text: Color;
  readonly textSoft: Color;
  readonly background: Color;
  readonly border: Color;
  readonly selectedBackground: Color;
  readonly hoverBackground: Color;
  readonly info: Color;
  readonly success: Color;
  readonly warning: Color;
  readonly error: Color;
}

export const notificationCenterContract: TokenContract<NotificationCenterTokens> = {
  text: (theme: SemanticTheme) => theme.colors.text,
  textSoft: (theme: SemanticTheme) => theme.colors.textSoft,
  background: (theme: SemanticTheme) => theme.elevation.floating.surface ?? theme.colors.surfaceRaised,
  border: (theme: SemanticTheme) => theme.elevation.floating.border ?? theme.colors.border,
  selectedBackground: (theme: SemanticTheme) => theme.states.selected.bg ?? theme.colors.surfaceAlt,
  hoverBackground: (theme: SemanticTheme) => theme.states.hover.bg ?? theme.colors.surfaceAlt,
  info: (theme: SemanticTheme) => theme.colors.tones.info,
  success: (theme: SemanticTheme) => theme.colors.tones.success,
  warning: (theme: SemanticTheme) => theme.colors.tones.warning,
  error: (theme: SemanticTheme) => theme.colors.tones.danger,
};

export interface NotificationCenterViewport {
  readonly cols: number;
  readonly rows: number;
}

export interface NotificationCenterAction {
  readonly label: string;
  readonly disabled?: boolean;
}

export interface NotificationCenterActionReceipt {
  readonly notificationId: NotificationId;
  readonly actionId: string;
}

export interface NotificationCenterActionCursor {
  readonly notificationId: NotificationId;
  readonly actionId: string;
}

export type NotificationCenterHoverTarget =
  | 'close'
  | 'list'
  | `row:${number}`
  | `dismiss:${number}`
  | `action:${number}:${string}`;

/**
 * UI-only state. Notification data remains exclusively owned by
 * `NotificationModel`, so a host can project the same store into toasts and
 * the durable center without synchronizing two arrays.
 */
export interface NotificationCenterState {
  readonly open: boolean;
  readonly selectedId: NotificationId | null;
  readonly expandedId: NotificationId | null;
  /** Stable action identity, or null while rows own Enter. */
  readonly actionCursor: NotificationCenterActionCursor | null;
  /** Variable-height list offset measured in terminal rows. */
  readonly rowScrollOffset: number;
  readonly hoveredTarget: NotificationCenterHoverTarget | null;
  readonly focusWithin: boolean;
}

export type NotificationCenterMsg =
  | { readonly type: 'open' }
  | { readonly type: 'close' }
  | { readonly type: 'toggle' }
  | { readonly type: 'escape' }
  | { readonly type: 'select'; readonly id: NotificationId }
  | { readonly type: 'select-previous' }
  | { readonly type: 'select-next' }
  | { readonly type: 'select-first' }
  | { readonly type: 'select-last' }
  | { readonly type: 'page-up' }
  | { readonly type: 'page-down' }
  | { readonly type: 'activate-row'; readonly id: NotificationId }
  | { readonly type: 'toggle-expanded' }
  | { readonly type: 'action-previous' }
  | { readonly type: 'action-next' }
  | { readonly type: 'activate' }
  | { readonly type: 'activate-action'; readonly id: NotificationId; readonly actionId: string }
  | { readonly type: 'dismiss'; readonly id?: NotificationId }
  | { readonly type: 'mark-read'; readonly id: NotificationId }
  | { readonly type: 'scroll'; readonly delta: number }
  | { readonly type: 'hover-target'; readonly target: NotificationCenterHoverTarget }
  | { readonly type: 'leave-target' }
  | { readonly type: 'focus-changed'; readonly within: boolean }
  | { readonly type: 'noop' };

export interface NotificationCenterUpdate {
  readonly state: NotificationCenterState;
  readonly store: NotificationModel;
  readonly action?: NotificationCenterActionReceipt;
}

export interface NotificationCenterConfig {
  readonly id?: string;
  readonly title?: string;
  /** Preferred outer width in cells. Defaults to 44. */
  readonly width?: number;
  /** Maximum outer height in rows. Defaults to 18. */
  readonly maxHeight?: number;
  readonly initiallyOpen?: boolean;
  readonly initiallyFocused?: boolean;
  /** The exact store instance that created the projected model. */
  readonly store: NotificationStore;
  /**
   * Explicit Escape ownership for shared toast state. Set false when another
   * composed surface owns the toast Escape binding.
   */
  readonly ownsToastEscape: boolean;
  /** Deterministic host-owned timestamp formatting. */
  readonly formatTimestamp: (timestamp: number, entry: NotificationEntry) => string;
  /**
   * Resolve the store's stable action ID through the host's command model.
   * Invalid or missing resolutions throw instead of silently dropping work.
   */
  readonly resolveAction: (actionId: string, entry: NotificationEntry) => NotificationCenterAction;
  readonly themeCtx?: ThemeContext;
  readonly theme?: ThemeInput;
}

export interface NotificationCenter {
  init(store?: NotificationModel): NotificationCenterState;
  update(
    msg: NotificationCenterMsg,
    state: NotificationCenterState,
    store: NotificationModel,
    viewport: NotificationCenterViewport,
  ): NotificationCenterUpdate;
  view(state: NotificationCenterState, store: NotificationModel, viewport: NotificationCenterViewport): VNode;
  subscriptions(state: NotificationCenterState, store: NotificationModel): Subscription<NotificationCenterMsg>;
}

interface NormalizedViewport {
  readonly cols: number;
  readonly rows: number;
}

interface ResolvedNotificationAction extends NotificationCenterAction {
  readonly id: string;
}

interface NotificationProjection {
  readonly state: NotificationCenterState;
  readonly entries: readonly NotificationEntry[];
  readonly rowNodes: readonly VNode[];
  readonly geometry: NotificationGeometry<NotificationId>;
  readonly listHeight: number;
  readonly surfaceWidth: number;
  readonly surfaceHeight: number;
  readonly innerWidth: number;
}

const LEVEL_MARK: Readonly<Record<NotificationEntry['level'], string>> = {
  info: 'i',
  success: '+',
  warning: '!',
  error: 'x',
};

function validConfiguredDimension(value: number | undefined, label: string, fallback: number): number {
  if (value === undefined) return fallback;
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${label} must be a positive safe integer; received ${String(value)}`);
  }
  return value;
}

function safeText(value: string): string {
  return sanitizeTerminalText(String(value), {
    allowSgr: false,
    allowHyperlinks: false,
    controlPolicy: 'escape',
  });
}

function safeMultilineText(value: string): string {
  return value.split('\n').map(safeText).join('\n');
}

const SINGLE_LINE_CONTROL = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/u;

function validatedSingleLine(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`${label} must be a non-empty string.`);
  }
  if (SINGLE_LINE_CONTROL.test(value)) {
    throw new TypeError(`${label} must not contain C0, C1, or line-separator controls.`);
  }
  return value;
}

function normalizedViewport(viewport: NotificationCenterViewport): NormalizedViewport {
  if (viewport === null || typeof viewport !== 'object') {
    throw new TypeError('Notification center viewport must be an object.');
  }
  if (!Number.isSafeInteger(viewport.cols) || viewport.cols <= 0) {
    throw new RangeError(`Notification center viewport cols must be a positive safe integer; received ${String(viewport.cols)}.`);
  }
  if (!Number.isSafeInteger(viewport.rows) || viewport.rows <= 0) {
    throw new RangeError(`Notification center viewport rows must be a positive safe integer; received ${String(viewport.rows)}.`);
  }
  return {
    cols: viewport.cols,
    rows: viewport.rows,
  };
}

function isPositiveId(value: unknown): value is NotificationId {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function isHoverTarget(value: unknown): value is NotificationCenterHoverTarget {
  if (value === 'close' || value === 'list') return true;
  if (typeof value !== 'string') return false;
  const idTarget = /^(?:row|dismiss):([1-9][0-9]*)$/u.exec(value);
  if (idTarget) return isPositiveId(Number(idTarget[1]));
  const actionTarget = /^action:([1-9][0-9]*):(.+)$/u.exec(value);
  if (!actionTarget || !isPositiveId(Number(actionTarget[1]))) return false;
  try {
    const actionId = decodeURIComponent(actionTarget[2]!);
    return (
      actionId.trim().length > 0
      && !SINGLE_LINE_CONTROL.test(actionId)
      && encodeURIComponent(actionId) === actionTarget[2]
    );
  } catch {
    return false;
  }
}

function assertCenterState(state: NotificationCenterState): void {
  if (state === null || typeof state !== 'object') {
    throw new TypeError('Notification center state must be an object.');
  }
  if (typeof state.open !== 'boolean') throw new TypeError('Notification center state.open must be a boolean.');
  if (state.selectedId !== null && !isPositiveId(state.selectedId)) {
    throw new RangeError('Notification center state.selectedId must be null or a positive safe integer.');
  }
  if (state.expandedId !== null && !isPositiveId(state.expandedId)) {
    throw new RangeError('Notification center state.expandedId must be null or a positive safe integer.');
  }
  if (!Number.isSafeInteger(state.rowScrollOffset) || state.rowScrollOffset < 0) {
    throw new RangeError('Notification center state.rowScrollOffset must be a non-negative safe integer.');
  }
  if (state.hoveredTarget !== null && !isHoverTarget(state.hoveredTarget)) {
    throw new TypeError('Notification center state.hoveredTarget is malformed.');
  }
  if (typeof state.focusWithin !== 'boolean') {
    throw new TypeError('Notification center state.focusWithin must be a boolean.');
  }
  if (state.actionCursor !== null) {
    if (
      typeof state.actionCursor !== 'object'
      || !isPositiveId(state.actionCursor.notificationId)
      || typeof state.actionCursor.actionId !== 'string'
      || state.actionCursor.actionId.trim().length === 0
      || SINGLE_LINE_CONTROL.test(state.actionCursor.actionId)
    ) {
      throw new TypeError('Notification center state.actionCursor must contain a valid notificationId and actionId.');
    }
  }
}

function assertCenterMessage(msg: NotificationCenterMsg): void {
  if (msg === null || typeof msg !== 'object' || typeof msg.type !== 'string') {
    throw new TypeError('Notification center message must be an object with a string type.');
  }
  switch (msg.type) {
    case 'open':
    case 'close':
    case 'toggle':
    case 'escape':
    case 'select-previous':
    case 'select-next':
    case 'select-first':
    case 'select-last':
    case 'page-up':
    case 'page-down':
    case 'toggle-expanded':
    case 'action-previous':
    case 'action-next':
    case 'activate':
    case 'leave-target':
    case 'noop':
      return;
    case 'select':
    case 'activate-row':
    case 'mark-read':
      if (!isPositiveId(msg.id)) throw new RangeError(`Notification center ${msg.type} id must be a positive safe integer.`);
      return;
    case 'activate-action':
      if (!isPositiveId(msg.id)) throw new RangeError('Notification center activate-action id must be a positive safe integer.');
      validatedSingleLine(msg.actionId, 'Notification center activate-action actionId');
      return;
    case 'dismiss':
      if (msg.id !== undefined && !isPositiveId(msg.id)) {
        throw new RangeError('Notification center dismiss id must be a positive safe integer when supplied.');
      }
      return;
    case 'scroll':
      if (!Number.isFinite(msg.delta)) {
        throw new RangeError(`Notification center scroll delta must be finite; received ${String(msg.delta)}.`);
      }
      return;
    case 'hover-target':
      if (!isHoverTarget(msg.target)) throw new TypeError('Notification center hover target is malformed.');
      return;
    case 'focus-changed':
      if (typeof msg.within !== 'boolean') throw new TypeError('Notification center focus-changed within must be a boolean.');
      return;
    default:
      throw new RangeError(`Unknown notification center message type "${String((msg as { type: unknown }).type)}".`);
  }
}

function inboxEntries(store: NotificationModel): readonly NotificationEntry[] {
  return store.entries.filter((entry) => entry.delivery === 'inbox' || entry.delivery === 'both');
}

function entryById(entries: readonly NotificationEntry[], id: NotificationId | null): NotificationEntry | undefined {
  return id === null ? undefined : entries.find((entry) => entry.id === id);
}

function reconcileState(state: NotificationCenterState, store: NotificationModel): NotificationCenterState {
  const entries = inboxEntries(store);
  const selectedEntry = entryById(entries, state.selectedId);
  const selectedId = selectedEntry?.id ?? entries[0]?.id ?? null;
  const expandedId = state.expandedId === selectedId && selectedId !== null ? selectedId : null;
  const expandedEntry = entryById(entries, expandedId);
  const actionCursor =
    state.actionCursor !== null
    && state.actionCursor.notificationId === expandedId
    && expandedEntry?.actionIds.includes(state.actionCursor.actionId)
      ? state.actionCursor
      : null;
  const rowScrollOffset = state.rowScrollOffset;

  if (
    selectedId === state.selectedId
    && expandedId === state.expandedId
    && actionCursor === state.actionCursor
    && rowScrollOffset === state.rowScrollOffset
  ) {
    return state;
  }

  return {
    ...state,
    selectedId,
    expandedId,
    actionCursor,
    rowScrollOffset,
  };
}

function targetForRow(id: NotificationId): NotificationCenterHoverTarget {
  return `row:${id}`;
}

function targetForDismiss(id: NotificationId): NotificationCenterHoverTarget {
  return `dismiss:${id}`;
}

function encodeActionId(actionId: string): string {
  return encodeURIComponent(actionId);
}

function targetForAction(id: NotificationId, actionId: string): NotificationCenterHoverTarget {
  return `action:${id}:${encodeActionId(actionId)}`;
}

function resolveEntryActions(config: NotificationCenterConfig, entry: NotificationEntry): readonly ResolvedNotificationAction[] {
  return entry.actionIds.map((id) => {
    const resolved = config.resolveAction(id, entry);
    if (resolved === null || typeof resolved !== 'object') {
      throw new TypeError(`Notification action "${safeText(id)}" did not resolve to an action descriptor.`);
    }
    if (resolved.disabled !== undefined && typeof resolved.disabled !== 'boolean') {
      throw new TypeError(`Notification action "${safeText(id)}" disabled must be a boolean when supplied.`);
    }
    return {
      id,
      label: validatedSingleLine(resolved.label, `Notification action "${safeText(id)}" label`),
      disabled: resolved.disabled === true,
    };
  });
}

function buildRowNode(
  surfaceId: string,
  config: NotificationCenterConfig,
  tokens: NotificationCenterTokens,
  state: NotificationCenterState,
  entry: NotificationEntry,
  innerWidth: number,
  tags: {
    readonly row: string;
    readonly dismiss: string;
    readonly action: string;
    readonly hover: string;
    readonly leave: string;
  },
): VNode {
  const selected = state.selectedId === entry.id;
  const expanded = state.expandedId === entry.id;
  const hoveredRow = state.hoveredTarget === targetForRow(entry.id);
  const summaryBackground = selected ? tokens.selectedBackground : hoveredRow ? tokens.hoverBackground : tokens.background;
  const closeWidth = Math.min(3, innerWidth);
  const summaryWidth = Math.max(0, innerWidth - closeWidth);
  const prefix = `${selected ? '>' : ' '} ${entry.read ? ' ' : '*'}${LEVEL_MARK[entry.level]} `;
  const messageWidth = Math.max(1, summaryWidth - 5);
  const messageLines = wrapCellText(safeText(entry.message), messageWidth);
  const safeMessageLines = messageLines.length > 0 ? messageLines : [''];
  const timestamp = validatedSingleLine(
    config.formatTimestamp(entry.updatedAt, entry),
    `Formatted timestamp for notification ${String(entry.id)}`,
  );
  const occurrenceBadge = entry.occurrences > 1 ? ` [x${String(entry.occurrences)}]` : '';
  const summaryLines = [
    ...safeMessageLines.map((line, index) =>
      padCellText(`${index === 0 ? prefix : ' '.repeat(5)}${line}`, summaryWidth),
    ),
    padCellText(`${' '.repeat(5)}${timestamp}${occurrenceBadge}`, summaryWidth),
  ];
  const summaryBody = column(
    ...summaryLines.map((line) => text(line, style({ color: tokens.text, background: summaryBackground, bold: selected }))),
  );
  const summaryControl = event(
    `${surfaceId}:row:${entry.id}`,
    summaryBody,
    { onClick: tags.row, onMouseEnter: tags.hover, onMouseLeave: tags.leave },
    {
      label: `${expanded ? 'Collapse' : 'Expand'} ${safeText(entry.message)}`,
      intent: 'toggle',
      keyboardHint: 'Enter',
      affordances: ['hover', 'click'],
      cursor: 'pointer',
    },
  );
  setVNodeMeta(summaryControl, {
    testId: `notification-row-control-${entry.id}`,
    a11y: {
      role: 'button',
      label: `${expanded ? 'Collapse' : 'Expand'} ${entry.level} ${entry.read ? 'read' : 'unread'} notification: ${safeText(entry.message)}, ${String(entry.occurrences)} ${entry.occurrences === 1 ? 'occurrence' : 'occurrences'}`,
      expanded,
      selected,
    },
  });

  const dismissHovered = state.hoveredTarget === targetForDismiss(entry.id);
  const dismissControl = event(
    `${surfaceId}:dismiss:${entry.id}`,
    text(padCellText('[x]', closeWidth, { align: 'right' }), style({
      color: dismissHovered ? tokens.text : tokens.textSoft,
      background: dismissHovered ? tokens.hoverBackground : summaryBackground,
      bold: dismissHovered,
    })),
    { onClick: tags.dismiss, onMouseEnter: tags.hover, onMouseLeave: tags.leave },
    {
      label: `Dismiss ${safeText(entry.message)}`,
      intent: 'dismiss',
      affordances: ['hover', 'click'],
      cursor: 'pointer',
    },
  );
  setVNodeMeta(dismissControl, {
    testId: `notification-dismiss-${entry.id}`,
    a11y: { role: 'button', label: `Dismiss notification: ${safeText(entry.message)}` },
  });

  const children: VNode[] = [row(summaryControl, dismissControl)];
  if (expanded) {
    if (entry.detail) {
      const detailWidth = Math.max(1, innerWidth - 2);
      const detailLines = wrapCellText(safeMultilineText(entry.detail), detailWidth);
      const detailNode = column(
        ...detailLines.map((line) => text(padCellText(`  ${line}`, innerWidth), style({ color: tokens.textSoft, background: tokens.background }))),
      );
      setVNodeMeta(detailNode, {
        testId: `notification-detail-${entry.id}`,
        a11y: { role: 'region', label: `Details for ${safeText(entry.message)}` },
      });
      children.push(detailNode);
    }

    for (const action of resolveEntryActions(config, entry)) {
      const target = targetForAction(entry.id, action.id);
      const actionSelected =
        state.actionCursor?.notificationId === entry.id
        && state.actionCursor.actionId === action.id;
      const actionHovered = state.hoveredTarget === target;
      const actionBackground = actionSelected
        ? tokens.selectedBackground
        : actionHovered
          ? tokens.hoverBackground
          : tokens.background;
      const actionWidth = Math.max(1, innerWidth - 4);
      const actionLines = wrapCellText(action.label, actionWidth);
      const encodedActionId = encodeActionId(action.id);
      const actionNode = event(
        `${surfaceId}:action:${entry.id}:${encodedActionId}`,
        column(
          ...(actionLines.length > 0 ? actionLines : ['']).map((line, lineIndex) =>
            text(
              padCellText(`${lineIndex === 0 ? actionSelected ? '  > ' : '    ' : '    '}${line}`, innerWidth),
              style({
                color: action.disabled ? tokens.textSoft : tokens.text,
                background: actionBackground,
                bold: actionSelected && !action.disabled,
                dim: action.disabled,
              }),
            ),
          ),
        ),
        action.disabled
          ? { onMouseEnter: tags.hover, onMouseLeave: tags.leave }
          : { onClick: tags.action, onMouseEnter: tags.hover, onMouseLeave: tags.leave },
        action.disabled
          ? { label: action.label, intent: 'submit', affordances: ['hover'] }
          : {
              label: action.label,
              intent: 'submit',
              keyboardHint: 'Enter',
              affordances: ['hover', 'click'],
              cursor: 'pointer',
            },
      );
      setVNodeMeta(actionNode, {
        testId: `notification-action-${entry.id}-${encodedActionId}`,
        a11y: {
          role: 'button',
          label: action.label,
          disabled: action.disabled,
          selected: actionSelected,
        },
      });
      children.push(actionNode);
    }
  }

  const rowNode = column(...children);
  setVNodeMeta(rowNode, {
    testId: `notification-row-${entry.id}`,
    a11y: {
      role: 'listitem',
      label: `${entry.level}, ${entry.read ? 'read' : 'unread'}, ${String(entry.occurrences)} ${entry.occurrences === 1 ? 'occurrence' : 'occurrences'}: ${safeText(entry.message)}`,
      selected,
      expanded,
    },
  });
  return rowNode;
}

function safeSurfaceId(value: string | undefined): string {
  if (value === undefined) return generateFocusGroupId('notification-center');
  if (typeof value !== 'string' || value.trim().length === 0 || /[\u0000-\u001f\u007f-\u009f]/u.test(value)) {
    throw new TypeError('Notification center id must be a non-empty control-free string.');
  }
  return value;
}

function eventIdSuffix(elementId: string, prefix: string): number | null {
  if (!elementId.startsWith(prefix)) return null;
  const value = Number(elementId.slice(prefix.length));
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

export function createNotificationCenter(config: NotificationCenterConfig): NotificationCenter {
  if (!config || typeof config.resolveAction !== 'function') {
    throw new TypeError('Notification center requires a resolveAction(actionId, entry) function.');
  }
  if (
    !config.store
    || typeof config.store.init !== 'function'
    || typeof config.store.validateModel !== 'function'
    || typeof config.store.markRead !== 'function'
    || typeof config.store.hideLatestToast !== 'function'
    || typeof config.store.dismiss !== 'function'
  ) {
    throw new TypeError('Notification center requires the exact NotificationStore that owns its model.');
  }
  if (typeof config.formatTimestamp !== 'function') {
    throw new TypeError('Notification center requires a deterministic formatTimestamp(timestamp, entry) function.');
  }
  if (typeof config.ownsToastEscape !== 'boolean') {
    throw new TypeError('Notification center requires explicit ownsToastEscape ownership.');
  }
  if (config.initiallyOpen !== undefined && typeof config.initiallyOpen !== 'boolean') {
    throw new TypeError('Notification center initiallyOpen must be a boolean when supplied.');
  }
  if (config.initiallyFocused !== undefined && typeof config.initiallyFocused !== 'boolean') {
    throw new TypeError('Notification center initiallyFocused must be a boolean when supplied.');
  }

  const preferredWidth = validConfiguredDimension(config.width, 'notification center width', 44);
  const maxHeight = validConfiguredDimension(config.maxHeight, 'notification center maxHeight', 18);
  const title = validatedSingleLine(config.title === undefined ? 'Notifications' : config.title, 'Notification center title');
  const surfaceId = safeSurfaceId(config.id);
  const focusId = `${surfaceId}:focus`;
  const closeElementId = `${surfaceId}:close`;
  const listElementId = `${surfaceId}:list`;
  const rowPrefix = `${surfaceId}:row:`;
  const dismissPrefix = `${surfaceId}:dismiss:`;
  const actionPrefix = `${surfaceId}:action:`;
  const tags = {
    close: `${surfaceId}:close-click`,
    row: `${surfaceId}:row-click`,
    dismiss: `${surfaceId}:dismiss-click`,
    action: `${surfaceId}:action-click`,
    hover: `${surfaceId}:hover`,
    leave: `${surfaceId}:leave`,
    scroll: `${surfaceId}:scroll`,
  } as const;
  const storeOps = config.store;

  const assertStoreModel = (model: NotificationModel): NotificationModel => {
    const validated = storeOps.validateModel(model);
    if (validated.ok) return model;
    const first = validated.diagnostics[0]!;
    throw new TypeError(`${first.field}: ${first.message}`);
  };

  const resolveActionById = (entry: NotificationEntry, actionId: string): ResolvedNotificationAction | undefined =>
    resolveEntryActions(config, entry).find((action) => action.id === actionId);

  const project = (
    state: NotificationCenterState,
    store: NotificationModel,
    viewportInput: NotificationCenterViewport,
  ): NotificationProjection => {
    const effectiveState = reconcileState(state, store);
    const viewport = normalizedViewport(viewportInput);
    const surfaceWidth = Math.max(1, Math.min(preferredWidth, viewport.cols));
    const surfaceHeight = Math.max(1, Math.min(maxHeight, viewport.rows));
    const innerWidth = Math.max(1, surfaceWidth - 2);
    const listHeight = Math.max(1, surfaceHeight - 4);
    const entries = inboxEntries(store);
    const tokens = useTokens(notificationCenterContract, config, 'NotificationCenter');
    const rowNodes = entries.map((entry) =>
      buildRowNode(surfaceId, config, tokens, effectiveState, entry, innerWidth, tags),
    );
    const geometry = buildNotificationGeometry(
      rowNodes.map((node, index) => ({
        id: entries[index]!.id,
        height: Math.max(1, measure(node, innerWidth).height),
      })),
    );
    const clampedOffset = clampNotificationOffset(geometry, effectiveState.rowScrollOffset, listHeight);
    const projectedState =
      clampedOffset === effectiveState.rowScrollOffset
        ? effectiveState
        : { ...effectiveState, rowScrollOffset: clampedOffset };
    return {
      state: projectedState,
      entries,
      rowNodes,
      geometry,
      listHeight,
      surfaceWidth,
      surfaceHeight,
      innerWidth,
    };
  };

  const keepSelectedVisible = (
    state: NotificationCenterState,
    store: NotificationModel,
    viewport: NotificationCenterViewport,
  ): NotificationCenterState => {
    if (!state.open) return reconcileState(state, store);
    const projection = project(state, store, viewport);
    if (projection.state.selectedId === null) return projection.state;
    const rowScrollOffset = ensureNotificationVisible(
      projection.geometry,
      projection.state.selectedId,
      projection.state.rowScrollOffset,
      projection.listHeight,
    );
    return rowScrollOffset === projection.state.rowScrollOffset
      ? projection.state
      : { ...projection.state, rowScrollOffset };
  };

  const activateAction = (
    state: NotificationCenterState,
    store: NotificationModel,
    id: NotificationId,
    actionId: string,
  ): NotificationCenterUpdate => {
    const entries = inboxEntries(store);
    const entry = entryById(entries, id);
    if (!entry) return { state, store };
    const action = resolveActionById(entry, actionId);
    if (!action || action.disabled) return { state, store };
    return {
      state: {
        ...state,
        selectedId: id,
        expandedId: id,
        actionCursor: { notificationId: id, actionId },
      },
      store,
      action: { notificationId: id, actionId },
    };
  };

  const controller: NotificationCenter = {
    init(store = storeOps.init()): NotificationCenterState {
      assertStoreModel(store);
      const entries = inboxEntries(store);
      return {
        open: config.initiallyOpen === true,
        selectedId: entries[0]?.id ?? null,
        expandedId: null,
        actionCursor: null,
        rowScrollOffset: 0,
        hoveredTarget: null,
        focusWithin: config.initiallyFocused === true,
      };
    },

    update(msg, state, store, viewport): NotificationCenterUpdate {
      normalizedViewport(viewport);
      assertCenterMessage(msg);
      assertCenterState(state);
      assertStoreModel(store);
      // This precedence chain is intentionally handled before reconciliation:
      // one Escape owns one transition, even if external store changes left
      // other UI fields stale.
      if (msg.type === 'escape') {
        if (state.actionCursor !== null) {
          return { state: { ...state, actionCursor: null }, store };
        }
        if (state.expandedId !== null) {
          return { state: { ...state, expandedId: null }, store };
        }
        if (state.open) {
          return controller.update({ type: 'close' }, state, store, viewport);
        }
        if (config.ownsToastEscape && store.visibleToastIds.length > 0) {
          return { state, store: storeOps.hideLatestToast(store) };
        }
        return { state, store };
      }

      const current = keepSelectedVisible(state, store, viewport);
      const entries = inboxEntries(store);
      switch (msg.type) {
        case 'open': {
          const next = { ...current, open: true };
          return { state: keepSelectedVisible(next, store, viewport), store };
        }
        case 'close':
          return {
            state: {
              ...current,
              open: false,
              expandedId: null,
              actionCursor: null,
              hoveredTarget: null,
              focusWithin: false,
            },
            store,
          };
        case 'toggle':
          return current.open
            ? controller.update({ type: 'close' }, current, store, viewport)
            : controller.update({ type: 'open' }, current, store, viewport);
        case 'select': {
          if (!entryById(entries, msg.id)) return { state: current, store };
          const next = {
            ...current,
            selectedId: msg.id,
            expandedId: current.expandedId === msg.id ? current.expandedId : null,
            actionCursor: null,
          };
          return { state: keepSelectedVisible(next, store, viewport), store };
        }
        case 'select-previous':
        case 'select-next': {
          if (entries.length === 0) return { state: current, store };
          const currentIndex = Math.max(0, entries.findIndex((entry) => entry.id === current.selectedId));
          const delta = msg.type === 'select-previous' ? -1 : 1;
          const nextIndex = Math.max(0, Math.min(entries.length - 1, currentIndex + delta));
          const selectedId = entries[nextIndex]!.id;
          const next = {
            ...current,
            selectedId,
            expandedId: current.expandedId === selectedId ? selectedId : null,
            actionCursor: null,
          };
          return { state: keepSelectedVisible(next, store, viewport), store };
        }
        case 'select-first':
        case 'select-last': {
          const selected = msg.type === 'select-first' ? entries[0] : entries.at(-1);
          if (!selected) return { state: current, store };
          const next = {
            ...current,
            selectedId: selected.id,
            expandedId: current.expandedId === selected.id ? selected.id : null,
            actionCursor: null,
          };
          return { state: keepSelectedVisible(next, store, viewport), store };
        }
        case 'page-up':
        case 'page-down': {
          const projection = project(current, store, viewport);
          const selectedId = moveNotificationSelectionByViewportRows(
            projection.geometry,
            current.selectedId ?? undefined,
            msg.type === 'page-up' ? 'up' : 'down',
            projection.listHeight,
          );
          if (selectedId === undefined) return { state: current, store };
          const next = {
            ...current,
            selectedId,
            expandedId: current.expandedId === selectedId ? selectedId : null,
            actionCursor: null,
          };
          return { state: keepSelectedVisible(next, store, viewport), store };
        }
        case 'activate-row': {
          const entry = entryById(entries, msg.id);
          if (!entry) return { state: current, store };
          const expanding = current.expandedId !== entry.id;
          const nextStore = expanding && !entry.read ? storeOps.markRead(store, entry.id) : store;
          const next = {
            ...current,
            selectedId: entry.id,
            expandedId: expanding ? entry.id : null,
            actionCursor: null,
          };
          return { state: keepSelectedVisible(next, nextStore, viewport), store: nextStore };
        }
        case 'toggle-expanded': {
          if (current.selectedId === null) return { state: current, store };
          return controller.update({ type: 'activate-row', id: current.selectedId }, current, store, viewport);
        }
        case 'action-previous':
        case 'action-next': {
          const entry = entryById(entries, current.expandedId);
          if (!entry || entry.actionIds.length === 0) return { state: current, store };
          const delta = msg.type === 'action-previous' ? -1 : 1;
          const currentIndex =
            current.actionCursor === null
              ? -1
              : entry.actionIds.indexOf(current.actionCursor.actionId);
          const nextIndex =
            current.actionCursor === null
              ? delta > 0
                ? 0
                : entry.actionIds.length - 1
              : (currentIndex + delta + entry.actionIds.length) % entry.actionIds.length;
          const actionCursor = {
            notificationId: entry.id,
            actionId: entry.actionIds[nextIndex]!,
          };
          return { state: { ...current, actionCursor }, store };
        }
        case 'activate': {
          const entry = entryById(entries, current.selectedId);
          if (!entry) return { state: current, store };
          if (current.actionCursor !== null) {
            return activateAction(current, store, entry.id, current.actionCursor.actionId);
          }
          return controller.update({ type: 'activate-row', id: entry.id }, current, store, viewport);
        }
        case 'activate-action':
          return activateAction(current, store, msg.id, msg.actionId);
        case 'dismiss': {
          const id = msg.id ?? current.selectedId;
          if (id === null) return { state: current, store };
          const removedIndex = entries.findIndex((entry) => entry.id === id);
          if (removedIndex < 0) return { state: current, store };
          const nextStore = storeOps.dismiss(store, id);
          if (current.selectedId !== id) {
            return { state: keepSelectedVisible(current, nextStore, viewport), store: nextStore };
          }
          const remaining = inboxEntries(nextStore);
          const selectedId = remaining[Math.min(removedIndex, remaining.length - 1)]?.id ?? null;
          const next = {
            ...current,
            selectedId,
            expandedId: null,
            actionCursor: null,
          };
          return { state: keepSelectedVisible(next, nextStore, viewport), store: nextStore };
        }
        case 'mark-read':
          return entryById(entries, msg.id)
            ? { state: current, store: storeOps.markRead(store, msg.id) }
            : { state: current, store };
        case 'scroll': {
          if (msg.delta === 0) return { state: current, store };
          const projection = project(current, store, viewport);
          const delta = Math.sign(msg.delta) * Math.min(100_000, Math.max(1, Math.floor(Math.abs(msg.delta))));
          const requested = Math.max(0, projection.state.rowScrollOffset + delta);
          const rowScrollOffset = clampNotificationOffset(projection.geometry, requested, projection.listHeight);
          const selectedGeometry = projection.geometry.rows.find((candidate) => candidate.id === current.selectedId);
          const selectedRemainsVisible =
            selectedGeometry !== undefined
            && selectedGeometry.top >= rowScrollOffset
            && selectedGeometry.bottom <= rowScrollOffset + projection.listHeight;
          const replacement =
            selectedRemainsVisible
              ? undefined
              : delta > 0
                ? projection.geometry.rows.find((candidate) => candidate.bottom > rowScrollOffset)
                : [...projection.geometry.rows]
                    .reverse()
                    .find((candidate) => candidate.top < rowScrollOffset + projection.listHeight);
          const scrolled = {
            ...current,
            selectedId: replacement?.id ?? current.selectedId,
            expandedId: replacement ? null : current.expandedId,
            actionCursor: replacement ? null : current.actionCursor,
            rowScrollOffset,
          };
          return {
            state: keepSelectedVisible(scrolled, store, viewport),
            store,
          };
        }
        case 'hover-target':
          return {
            state: current.hoveredTarget === msg.target ? current : { ...current, hoveredTarget: msg.target },
            store,
          };
        case 'leave-target':
          return {
            state: current.hoveredTarget === null ? current : { ...current, hoveredTarget: null },
            store,
          };
        case 'focus-changed':
          return {
            state: current.focusWithin === msg.within ? current : { ...current, focusWithin: msg.within },
            store,
          };
        case 'noop':
          return { state: current, store };
      }
    },

    view(state, store, viewport): VNode {
      normalizedViewport(viewport);
      assertCenterState(state);
      assertStoreModel(store);
      if (!state.open) return empty(0, 0);
      const projection = project(state, store, viewport);
      const tokens = useTokens(notificationCenterContract, config, 'NotificationCenter');
      const unreadCount = projection.entries.reduce((count, entry) => count + (entry.read ? 0 : 1), 0);
      const closeWidth = Math.min(3, projection.innerWidth);
      const titleWidth = Math.max(0, projection.innerWidth - closeWidth);
      const headerLabel = unreadCount > 0 ? `${title} (${unreadCount})` : title;
      const closeHovered = projection.state.hoveredTarget === 'close';
      const closeControl = event(
        closeElementId,
        text(padCellText('[x]', closeWidth, { align: 'right' }), style({
          color: closeHovered ? tokens.text : tokens.textSoft,
          background: closeHovered ? tokens.hoverBackground : tokens.background,
          bold: closeHovered,
        })),
        { onClick: tags.close, onMouseEnter: tags.hover, onMouseLeave: tags.leave },
        {
          label: `Close ${title}`,
          intent: 'close',
          keyboardHint: 'Escape',
          affordances: ['hover', 'click'],
          cursor: 'pointer',
        },
      );
      setVNodeMeta(closeControl, {
        testId: 'notification-center-close',
        a11y: { role: 'button', label: `Close ${title}` },
      });
      const heading = text(
        padCellText(headerLabel, titleWidth),
        style({ color: tokens.text, background: tokens.background, bold: true }),
      );
      setVNodeMeta(heading, {
        testId: 'notification-center-heading',
        a11y: { role: 'heading', label: headerLabel, level: 2 },
      });
      const header = row(
        heading,
        closeControl,
      );

      const listWindow = selectNotificationWindow(
        projection.geometry,
        projection.state.rowScrollOffset,
        projection.listHeight,
        1,
      );
      const visibleRows = projection.rowNodes.slice(listWindow.startIndex, listWindow.endIndex);
      const virtualChildren: VNode[] = [];
      if (listWindow.spacerAbove > 0) virtualChildren.push(empty(projection.innerWidth, listWindow.spacerAbove));
      virtualChildren.push(...visibleRows);
      if (listWindow.spacerBelow > 0) virtualChildren.push(empty(projection.innerWidth, listWindow.spacerBelow));
      if (projection.entries.length === 0) {
        virtualChildren.push(text(padCellText('No notifications', projection.innerWidth), style({
          color: tokens.textSoft,
          background: tokens.background,
          dim: true,
        })));
      }
      const listContent = column(...virtualChildren);
      setVNodeMeta(listContent, {
        testId: 'notification-center-list-content',
        a11y: { role: 'list', label: `${title}, ${projection.entries.length} items` },
      });
      const listViewport = event(
        listElementId,
        scroll(listContent, { height: projection.listHeight, offset: listWindow.scrollOffset }),
        { onScroll: tags.scroll, onMouseEnter: tags.hover, onMouseLeave: tags.leave },
        {
          label: title,
          intent: 'scroll',
          keyboardHint: 'Up, Down, Home, End, Page Up, Page Down',
          affordances: ['hover', 'scroll'],
        },
      );

      const selectedIndex = projection.entries.findIndex((entry) => entry.id === projection.state.selectedId);
      const progress = projection.entries.length === 0
        ? '0/0'
        : `${Math.max(0, selectedIndex) + 1}/${projection.entries.length}`;
      // A textual position receipt is deliberate here: the public Horizon
      // scrolling surface uses the same inspectable pattern, while a visual
      // thumb would introduce a second global scrollbar API.
      const footerText = padCellText(`${progress}  Up/Down Home/End Pg`, projection.innerWidth);
      const footer = text(footerText, style({ color: tokens.textSoft, background: tokens.background, dim: true }));
      const surface = box(
        column(header, listViewport, footer),
        style({
          border: border.rounded,
          borderColor: tokens.border,
          background: tokens.background,
        }),
        {
          width: projection.surfaceWidth,
          height: projection.surfaceHeight,
          overflow: 'hidden',
        },
      );
      const root = focus(focusId, surface, { focused: projection.state.focusWithin, tabIndex: 0 });
      setVNodeMeta(root, {
        testId: 'notification-center',
        a11y: {
          role: 'region',
          label: `${title}, ${unreadCount} unread`,
          live: 'off',
          expanded: true,
        },
      });
      return root;
    },

    subscriptions(state, store): Subscription<NotificationCenterMsg> {
      assertCenterState(state);
      assertStoreModel(store);
      const subs: Subscription<NotificationCenterMsg>[] = [];
      const hasEscapeTarget =
        state.actionCursor !== null
        || state.expandedId !== null
        || state.open
        || (config.ownsToastEscape && store.visibleToastIds.length > 0);
      if (hasEscapeTarget) subs.push(Sub.key('escape', { type: 'escape' }));
      if (!state.open) return subs.length === 0 ? Sub.none() : Sub.batch(...subs);

      const entries = inboxEntries(store);
      subs.push(
        Sub.focus((focused) => ({ type: 'focus-changed', within: focused === focusId })),
        Sub.elementMouse((mouseEvent): NotificationCenterMsg => {
          if (mouseEvent.handlerTag === tags.close && mouseEvent.elementId === closeElementId) {
            return { type: 'close' };
          }
          if (mouseEvent.handlerTag === tags.row) {
            const id = eventIdSuffix(mouseEvent.elementId, rowPrefix);
            return id === null ? { type: 'noop' } : { type: 'activate-row', id };
          }
          if (mouseEvent.handlerTag === tags.dismiss) {
            const id = eventIdSuffix(mouseEvent.elementId, dismissPrefix);
            return id === null ? { type: 'noop' } : { type: 'dismiss', id };
          }
          if (mouseEvent.handlerTag === tags.action && mouseEvent.elementId.startsWith(actionPrefix)) {
            const suffix = mouseEvent.elementId.slice(actionPrefix.length);
            const separator = suffix.indexOf(':');
            const id = Number(suffix.slice(0, separator));
            const entry = Number.isSafeInteger(id) && id > 0 ? entryById(entries, id) : undefined;
            let actionId: string | undefined;
            try {
              actionId = separator < 0 ? undefined : decodeURIComponent(suffix.slice(separator + 1));
            } catch {
              actionId = undefined;
            }
            return entry && actionId
              && entry.actionIds.includes(actionId)
              ? { type: 'activate-action', id: entry.id, actionId }
              : { type: 'noop' };
          }
          if (mouseEvent.handlerTag === tags.scroll && mouseEvent.elementId === listElementId) {
            return typeof mouseEvent.deltaY === 'number'
              && Number.isFinite(mouseEvent.deltaY)
              && mouseEvent.deltaY !== 0
              ? { type: 'scroll', delta: mouseEvent.deltaY }
              : { type: 'noop' };
          }
          if (mouseEvent.handlerTag === tags.leave) return { type: 'leave-target' };
          if (mouseEvent.handlerTag === tags.hover) {
            if (mouseEvent.elementId === closeElementId) return { type: 'hover-target', target: 'close' };
            if (mouseEvent.elementId === listElementId) return { type: 'hover-target', target: 'list' };
            const rowId = eventIdSuffix(mouseEvent.elementId, rowPrefix);
            if (rowId !== null) return { type: 'hover-target', target: targetForRow(rowId) };
            const dismissId = eventIdSuffix(mouseEvent.elementId, dismissPrefix);
            if (dismissId !== null) return { type: 'hover-target', target: targetForDismiss(dismissId) };
            if (mouseEvent.elementId.startsWith(actionPrefix)) {
              const suffix = mouseEvent.elementId.slice(actionPrefix.length);
              const separator = suffix.indexOf(':');
              const id = Number(suffix.slice(0, separator));
              try {
                const actionId = separator < 0 ? '' : decodeURIComponent(suffix.slice(separator + 1));
                if (Number.isSafeInteger(id) && id > 0 && actionId.length > 0) {
                  return { type: 'hover-target', target: targetForAction(id, actionId) };
                }
              } catch {
                return { type: 'noop' };
              }
            }
          }
          return { type: 'noop' };
        }),
      );

      if (state.focusWithin) {
        subs.push(
          Sub.key('up', { type: 'select-previous' }),
          Sub.key('down', { type: 'select-next' }),
          Sub.key('pageup', { type: 'page-up' }),
          Sub.key('pagedown', { type: 'page-down' }),
          Sub.key('home', { type: 'select-first' }),
          Sub.key('end', { type: 'select-last' }),
          Sub.key('left', { type: 'action-previous' }),
          Sub.key('right', { type: 'action-next' }),
          Sub.key('enter', { type: 'activate' }),
          Sub.key('space', { type: 'activate' }),
          Sub.key('delete', { type: 'dismiss' }),
        );
      }
      return Sub.batch(...subs);
    },
  };

  return controller;
}
