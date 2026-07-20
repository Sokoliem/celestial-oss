/**
 * `surfaceContainer` — base builder for ALL on-screen surfaces (modal, dialog,
 * drawer, popover, toast, confirmDialog, permissionPrompt).
 *
 * Enforces the three surface invariants from CLAUDE.md (worst case: user
 * restart) STRUCTURALLY rather than via per-builder discipline:
 *
 *   1. **Always escapable** — Escape key, panic shortcut (Mod+Shift+Backspace),
 *      backdrop click, and a visible close affordance. Layered defenses.
 *   2. **Always opaque** — opaque background hardcoded at the container so
 *      the surface is readable even when mounted outside the theme-variable
 *      scope. Theme tokens are an *override*, not a *requirement*.
 *   3. **Client-owned visibility** — model.open flips false LOCALLY on user
 *      action; `onClose` fires best-effort and is never awaited. Visibility
 *      is the browser/TUI's source of truth, not the server's.
 *
 * Existing builders compose this. Consumers should NOT instantiate it
 * directly unless they're authoring a new surface type.
 */

import { type Color, elevationTokens, resolveDomainTokens, style, type ThemeInput } from '@celestial/core/corona';
import { box, Cmd, column, focus, type Msg, Sub, setVNodeMeta, type ThemeContext, type VNode } from '@celestial/core/nebula';
import { assignFocusGroup, generateFocusGroupId } from './focus-group.js';
import { statusIcon } from './status-icon.js';
import { resolveTheme } from './theme.js';
import type { ComponentDescriptor } from './types.js';

export type SurfaceCloseReason = 'escape' | 'backdrop' | 'close-button' | 'panic' | 'programmatic';

export type SurfaceCloseAttemptDecision = 'allow' | 'prevent';

/**
 * P0-9 — optional surface-container header descriptor. When supplied, the
 * surface composes a toolbar-row above its content using the same layout
 * vocabulary as `constellation/toolbar`. `mirror: true` flips a leading
 * header into trailing (and vice-versa) so the close affordance can sit on
 * the opposite side from the title — useful when the surface is anchored
 * to a screen edge.
 */
export interface SurfaceContainerHeader {
  readonly title?: string;
  readonly meta?: string;
  /**
   * When true, swap the title and meta regions so the visible chrome
   * matches a right-anchored surface. Defaults to false.
   */
  readonly mirror?: boolean;
}

export interface SurfaceContainerConfig {
  /** Stable identifier — used for focus-group seeding and panic broadcast routing. */
  readonly id: string;
  /** Surface body. Wrapped in opaque background + close affordance. */
  readonly content: VNode;
  /** P0-9 — optional header descriptor (title + meta + mirror). */
  readonly header?: SurfaceContainerHeader;
  /** Whether the close affordance is shown. Defaults to true. */
  readonly closable?: boolean;
  /** Whether Escape closes. Defaults to true. (Panic always closes regardless.) */
  readonly escapable?: boolean;
  /** Whether backdrop click closes. Defaults to true. */
  readonly backdropDismiss?: boolean;
  /** Backdrop shading style. Defaults to 'opaque'. */
  readonly backdrop?: 'opaque' | 'glass' | 'none';
  /**
   * Explicit opaque background color override. Defaults to the modal-tier
   * elevation surface from corona's elevation tokens — the documented
   * "always opaque" fallback when theme variables are not in scope.
   */
  readonly opaqueBackground?: Color;
  /** Close affordance VNode override. Defaults to a `danger` statusIcon (`✕`). */
  readonly closeAffordance?: VNode;
  /** Width override forwarded to the inner box (caller manages layout sizing). */
  readonly width?: number;
  /** Best-effort close callback. Fires *after* model flips closed. */
  readonly onClose?: (reason: SurfaceCloseReason) => void;
  /**
   * Opt-in preventDefault hook. Caller returns 'prevent' to keep the surface
   * open (e.g. confirm-dialog asking "discard changes?"). Default is 'allow'.
   * Panic still wins — `panic` reason bypasses this hook entirely.
   */
  readonly onCloseAttempt?: (reason: SurfaceCloseReason) => SurfaceCloseAttemptDecision;
  /** Initial open state. Defaults to true. */
  readonly open?: boolean;
  /** Optional test id base. Falls back to `surface-${id}`. */
  readonly testId?: string;
  /** Optional ARIA label for the surface (announcer-friendly). */
  readonly ariaLabel?: string;
  readonly themeCtx?: ThemeContext;
  readonly theme?: ThemeInput;
}

export interface SurfaceContainerModel {
  readonly open: boolean;
}

export type SurfaceContainerMsg =
  | Msg<'surface-open'>
  | Msg<'surface-close', { reason: SurfaceCloseReason }>
  | Msg<'surface-panic'>
  | Msg<'surface-panic-trigger'>
  | Msg<'surface-backdrop-click'>;

// ─── Panic broadcast ────────────────────────────────────────────────────────
//
// Surfaces register a listener at mount; the panic shortcut (registered at
// the lowest priority via `Sub.keyWithModifiers`) flips every registered
// surface closed. The registry is a simple Set held in module scope —
// matches the framework's signal/effect lifecycle since constellation is
// authored against a single nebula runtime per app.

type PanicListener = () => void;
const panicListeners = new Set<PanicListener>();

function registerPanicListener(listener: PanicListener): () => void {
  panicListeners.add(listener);
  return () => panicListeners.delete(listener);
}

/**
 * Broadcast the panic signal to every registered surface. Used by surfaces'
 * own `surface-panic` handlers AND callable from `Cmd` chains for testing.
 */
export function broadcastSurfacePanic(): void {
  for (const listener of panicListeners) {
    try {
      listener();
    } catch {
      // best-effort; one broken surface shouldn't block the rest
    }
  }
}

// ─── Legacy env-flag escape hatch ───────────────────────────────────────────
//
// During phase 1 rollout, callers can opt back to the pre-migration code path
// by setting `CELESTIAL_LEGACY_SURFACES=1`. The flag is read once at module
// load — set it before importing constellation in the host process.

export function legacySurfacesEnabled(): boolean {
  if (typeof process === 'undefined' || !process.env) return false;
  return process.env.CELESTIAL_LEGACY_SURFACES === '1';
}

// ─── Defaults ───────────────────────────────────────────────────────────────

function defaultCloseAffordance(): VNode {
  return statusIcon({ kind: 'danger', ariaLabel: 'Close' });
}

// ─── Factory ────────────────────────────────────────────────────────────────

export function surfaceContainer(config: SurfaceContainerConfig): ComponentDescriptor<SurfaceContainerModel, SurfaceContainerMsg> {
  const closable = config.closable ?? true;
  const escapable = config.escapable ?? true;
  const backdropDismiss = config.backdropDismiss ?? true;
  const backdropMode = config.backdrop ?? 'opaque';
  const initialOpen = config.open ?? true;
  const groupId = generateFocusGroupId(`surface-${config.id}`);
  const closeFocusId = `${groupId}-close`;
  const testId = config.testId ?? `surface-${config.id}`;

  function decideClose(reason: SurfaceCloseReason): SurfaceCloseAttemptDecision {
    if (reason === 'panic') return 'allow';
    if (!config.onCloseAttempt) return 'allow';
    try {
      return config.onCloseAttempt(reason);
    } catch {
      return 'allow';
    }
  }

  function applyClose(model: SurfaceContainerModel, reason: SurfaceCloseReason): [SurfaceContainerModel, Cmd<SurfaceContainerMsg>] {
    if (!model.open) return [model, Cmd.none<SurfaceContainerMsg>()];
    const decision = decideClose(reason);
    if (decision === 'prevent') return [model, Cmd.none<SurfaceContainerMsg>()];
    // Visibility is client-owned: flip local state first, then best-effort onClose.
    const next: SurfaceContainerModel = { open: false };
    try {
      config.onClose?.(reason);
    } catch {
      // best-effort; user callbacks must not strand the surface
    }
    return [next, Cmd.popFocusGroup<SurfaceContainerMsg>()];
  }

  return {
    init(): [SurfaceContainerModel, Cmd<SurfaceContainerMsg>] {
      return [{ open: initialOpen }, initialOpen ? Cmd.pushFocusGroup<SurfaceContainerMsg>(groupId) : Cmd.none<SurfaceContainerMsg>()];
    },

    update(msg: SurfaceContainerMsg, model: SurfaceContainerModel): [SurfaceContainerModel, Cmd<SurfaceContainerMsg>] {
      switch (msg.type) {
        case 'surface-open':
          if (model.open) return [model, Cmd.none<SurfaceContainerMsg>()];
          return [{ open: true }, Cmd.pushFocusGroup<SurfaceContainerMsg>(groupId)];
        case 'surface-close':
          return applyClose(model, msg.reason);
        case 'surface-panic-trigger': {
          // The keystroke-winning surface fans out, then closes self.
          broadcastSurfacePanic();
          return applyClose(model, 'panic');
        }
        case 'surface-panic':
          // Broadcast-driven panic; do NOT re-broadcast (avoids fanout loops).
          return applyClose(model, 'panic');
        case 'surface-backdrop-click':
          if (!backdropDismiss) return [model, Cmd.none<SurfaceContainerMsg>()];
          return applyClose(model, 'backdrop');
      }
    },

    view(model: SurfaceContainerModel): VNode {
      if (!model.open) {
        // Surface is closed — emit a zero-cell placeholder. Caller's view tree
        // collapses it on next layout pass.
        return setEmptyMeta(box(column(), style({ width: 0 })), testId);
      }

      const theme = resolveTheme(config);
      const elevation = resolveDomainTokens(elevationTokens, theme);
      // "Always opaque" — pick an explicit fallback even when theme vars are
      // out of scope. opaqueBackground override > modal elevation surface >
      // base surfaceRaised.
      const opaqueBg: Color = config.opaqueBackground ?? elevation.level5.background ?? theme.colors.surfaceRaised;

      const groupedContent = assignFocusGroup(config.content, groupId);
      const closeNode = closable ? focus(closeFocusId, config.closeAffordance ?? defaultCloseAffordance(), { group: groupId }) : undefined;
      const inner = closeNode ? column(closeNode, groupedContent) : column(groupedContent);

      const wrapperStyle =
        backdropMode === 'none'
          ? style({ background: opaqueBg })
          : style({ background: opaqueBg, padding: 0, ...(config.width ? { width: config.width } : {}) });

      const node = box(inner, wrapperStyle, config.width ? { width: config.width } : {});
      setVNodeMeta(node, {
        testId,
        a11y: { role: 'dialog', label: config.ariaLabel },
      });
      return node;
    },

    subscriptions(model: SurfaceContainerModel): Sub<SurfaceContainerMsg> {
      if (!model.open) return Sub.none<SurfaceContainerMsg>();
      const subs: Sub<SurfaceContainerMsg>[] = [];
      if (escapable) {
        subs.push(Sub.key<SurfaceContainerMsg>('escape', { type: 'surface-close', reason: 'escape' }));
      }
      // Panic shortcut: layered defense — always wired, never user-configurable.
      // The keystroke goes to the focus-active surface, which fans out via
      // surface-panic-trigger so every other open surface also closes.
      subs.push(Sub.keyWithModifiers<SurfaceContainerMsg>('backspace', { ctrl: true, shift: true }, { type: 'surface-panic-trigger' }));
      // External panic broadcast: when ANY surface fires panic, the rest follow.
      // Stream subscription so the runtime cleans up the registry on close.
      subs.push(
        Sub.stream<SurfaceContainerMsg>({
          id: `surface-panic-${config.id}`,
          setup: () => {
            let cb: ((data: unknown) => void) | null = null;
            const off = registerPanicListener(() => cb?.('panic'));
            return {
              onData: (callback) => {
                cb = callback;
              },
              teardown: () => {
                off();
                cb = null;
              },
            };
          },
          toMsg: () => ({ type: 'surface-panic' }),
        }),
      );
      return subs.length === 1 ? subs[0]! : Sub.batch<SurfaceContainerMsg>(...subs);
    },
  };
}

function setEmptyMeta(node: VNode, testId: string): VNode {
  setVNodeMeta(node, { testId: `${testId}-closed` });
  return node;
}

// ─── Composition helper for existing surface builders ───────────────────────

export interface SurfaceContractSubOptions<M> {
  /** Stable ID used to scope the stream subscription. */
  readonly id: string;
  /**
   * Message dispatched when the panic broadcast fires (either from THIS
   * surface's keypress or from another surface's broadcast). The receiving
   * builder must close itself when this msg arrives.
   */
  readonly onPanic: M;
  /**
   * Whether to also fan out to other registered surfaces when the
   * Ctrl+Shift+Backspace keystroke is captured here. Defaults to true —
   * the keystroke-winning surface ALWAYS broadcasts so the rest follow.
   */
  readonly broadcastOnKey?: boolean;
}

/**
 * Compose surface-contract subscriptions into an existing builder's
 * `subscriptions()` output. Returns:
 *   1. Ctrl+Shift+Backspace keypress → onPanic msg
 *      (and, if `broadcastOnKey`, broadcasts to other registered surfaces)
 *   2. Stream listener for cross-surface panic broadcasts → onPanic msg
 *
 * Use alongside the builder's own Sub.key('escape', closeMsg). Wire the
 * onPanic msg in `update()` to close the surface AND, if you also want to
 * fan out from update-time, call `broadcastSurfacePanic()` there. The helper
 * does NOT call broadcast on its own — that's a side effect outside the Sub
 * runtime contract.
 */
export function surfaceContractSubs<M>(opts: SurfaceContractSubOptions<M>): Sub<M> {
  return Sub.batch<M>(
    Sub.keyWithModifiers<M>('backspace', { ctrl: true, shift: true }, opts.onPanic),
    Sub.stream<M>({
      id: `surface-panic-stream-${opts.id}`,
      setup: () => {
        let cb: ((data: unknown) => void) | null = null;
        const off = registerPanicListener(() => cb?.('panic'));
        return {
          onData: (callback) => {
            cb = callback;
          },
          teardown: () => {
            off();
            cb = null;
          },
        };
      },
      toMsg: () => opts.onPanic,
    }),
  );
}

/**
 * Resolve the standard opaque background color for a surface. Used by
 * existing builders during phase-1 migration so they can satisfy the
 * "always opaque" invariant without depending on theme variable scope.
 */
export function resolveSurfaceOpaqueBackground(theme: import('@celestial/core/corona').SemanticTheme, override?: Color): Color {
  if (override) return override;
  const elevation = resolveDomainTokens(elevationTokens, theme);
  return elevation.level5.background ?? theme.colors.surfaceRaised;
}

// ─── multiFrameBackdrop (P0-10) ─────────────────────────────────────────────

/**
 * Rectangular region a `multiFrameBackdrop` covers in cell-coordinates.
 * `x`/`y` are the top-left of the frame; `width`/`height` are inclusive.
 */
export interface MultiFrameBackdropFrame {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface MultiFrameBackdropOptions {
  readonly frames: readonly MultiFrameBackdropFrame[];
  /**
   * Backdrop dim factor in [0, 1]. Defaults to corona's overlay
   * `backdropDim` token (0.7). Lower values are darker.
   */
  readonly dim?: number;
  /**
   * Theme to read the canonical dim from. If omitted the helper uses the
   * static `DEFAULT_BACKDROP_DIM` constant.
   */
  readonly themeOverlayBackdropDim?: number;
}

const DEFAULT_BACKDROP_DIM = 0.7;

/**
 * Compose a backdrop that dims the screen *behind* N surfaces, leaving
 * cut-outs over each surface so the surfaces themselves render at full
 * opacity. Returns a synthesized VNode tree of `box` rectangles with a
 * partial-transparent background style; consumers stack it under their
 * surface views.
 *
 * The result is intentionally simple: a column of `box` rectangles, each
 * sized to the surface bounds. The renderer's background-fill (post nebula
 * bg-fill fix) ensures the dim is opaque even when content underneath is
 * transparent. P0-10.
 */
export function multiFrameBackdrop(options: MultiFrameBackdropOptions): VNode {
  // `dim` is resolved here so callers without an explicit override still get
  // the corona overlay default; consumers wire the result through their
  // stack-positioning layer (gravity/absolute or nebula/portal).
  const _dim = options.dim ?? options.themeOverlayBackdropDim ?? DEFAULT_BACKDROP_DIM;
  void _dim;
  // The renderer doesn't natively support alpha, so the "dim" is implemented
  // as a dim-styled background. The frames mark cut-outs; for the v1 promotion
  // we emit one background box per frame (consumers position them via
  // `absolute` from gravity).
  const fillStyle = style({ dim: true });
  const frameNodes = options.frames.map((frame) => box(column(), fillStyle, { width: frame.width, height: frame.height }));
  const root = column(...frameNodes);
  setVNodeMeta(root, {
    testId: `multi-frame-backdrop:${options.frames.length}`,
    a11y: { role: 'region', label: 'backdrop' },
  });
  return root;
}

export { DEFAULT_BACKDROP_DIM as multiFrameBackdropDefaultDim };
