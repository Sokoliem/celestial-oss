import type { Color, ThemeInput } from '@celestial/corona';
import { style } from '@celestial/corona';
import type { Cmd, Msg, Sub, ThemeContext, VNode } from '@celestial/nebula';
import { Cmd as NebulaCmd, column, empty, row, Sub as NebulaSub, text } from '@celestial/nebula';
import { feedbackColor, formColor, resolveOrbitTheme } from './theme.js';

// ─── Types ──────────────────────────────────────────────────────────────────

/** Host layer the surface lives in. Used for visual hints only — escape
 *  behavior, opacity, and client-owned visibility are enforced for every
 *  host. */
export type SurfaceHost = 'modal' | 'drawer' | 'peek';

/** Reasons a surface can close. `submit` is fired when an inner control
 *  signals completion (forms or wizards on success). */
export type SurfaceCloseReason = 'escape' | 'backdrop' | 'panic' | 'close-button' | 'submit' | 'programmatic';

/** Component-descriptor shape a surface wraps. Re-declared locally so
 *  orbit's surface API doesn't depend on `ComponentDescriptor` from
 *  constellation (which would introduce a build-order edge). */
export interface SurfaceChild<Model, Msg> {
  init(): [Model, Cmd<Msg>];
  update(msg: Msg, model: Model): [Model, Cmd<Msg>];
  view(model: Model): VNode;
  subscriptions?(model: Model): Sub<Msg>;
}

/** Configuration shared by `formSurface()` and `wizardSurface()`. */
export interface SurfaceConfig<ChildModel, ChildMsg> {
  /** The wrapped form or wizard descriptor. */
  readonly child: SurfaceChild<ChildModel, ChildMsg>;
  /** Visual host hint. Defaults to `'modal'`. */
  readonly host?: SurfaceHost;
  /** Title rendered in the surface header. */
  readonly title?: string;
  /** Whether the surface is open on init. Defaults to `true`. */
  readonly initiallyOpen?: boolean;
  /**
   * Optional callback fired *after* the surface has been removed from view.
   * The surface always dismisses optimistically — the callback is for
   * downstream side-effects (server notify, logging, etc.) and must not be
   * relied on as the gate for visibility.
   */
  readonly onClose?: (reason: SurfaceCloseReason) => void;
  /**
   * Hardcoded background color used when no theme-context background is
   * available. Defaults to corona's `surfaceRaised` from the resolved theme.
   * Required by CLAUDE.md surface contract — theme tokens are an override,
   * not a requirement.
   */
  readonly opaqueBackground?: Color;
  /** Theme override for surface chrome. */
  readonly theme?: ThemeInput;
  readonly themeCtx?: ThemeContext;
}

export interface SurfaceModel<ChildModel> {
  readonly open: boolean;
  readonly child: ChildModel;
  readonly closeReason: SurfaceCloseReason | null;
}

export type SurfaceMsg<ChildMsg> =
  | Msg<'surface:open'>
  | Msg<'surface:close', { readonly reason: SurfaceCloseReason }>
  | Msg<'surface:child', { readonly msg: ChildMsg }>;

export interface SurfaceDescriptor<ChildModel, ChildMsg> extends SurfaceChild<SurfaceModel<ChildModel>, SurfaceMsg<ChildMsg>> {
  /** Read the open flag. */
  isOpen(model: SurfaceModel<ChildModel>): boolean;
  /** Read the inner descriptor's model (whether the surface is open or not). */
  getChildModel(model: SurfaceModel<ChildModel>): ChildModel;
  /** Programmatically close the surface. Always succeeds; the dismissal is
   *  client-owned per CLAUDE.md and does not require an ack. */
  close(model: SurfaceModel<ChildModel>, reason?: SurfaceCloseReason): [SurfaceModel<ChildModel>, Cmd<SurfaceMsg<ChildMsg>>];
}

// ─── Factory ────────────────────────────────────────────────────────────────

// CLAUDE.md says "Ctrl/Cmd+Shift+Backspace" — Ctrl for Windows/Linux, Cmd
// (mapped to the `meta` modifier in nexus) for macOS. We bind BOTH so the
// panic path works regardless of platform.
const PANIC_KEY = 'backspace';
const PANIC_MODIFIERS_CTRL = { ctrl: true, shift: true };
const PANIC_MODIFIERS_META = { meta: true, shift: true };

/**
 * Wrap a form or wizard descriptor in a layered surface that satisfies
 * CLAUDE.md's three invariants:
 *
 * 1. **Always escapable.** The view appends a visible `[× Close]` affordance,
 *    the subscription routes `Escape` plus `Ctrl+Shift+Backspace` AND
 *    `Cmd+Shift+Backspace` to a close message. The close-button is wired
 *    through the existing `'surface:close'` msg with reason `'close-button'`
 *    (hosts that hit-test the affordance dispatch that). For modals,
 *    backdrop dismissal is dispatched via `'surface:close'` with reason
 *    `'backdrop'` — the host's hit-map fires the msg when the user clicks
 *    outside the body.
 *
 * 2. **Always opaque.** The container carries a `background` style sourced
 *    from `opaqueBackground` (or the resolved theme's `surfaceRaised`).
 *    Theme tokens override the fallback, never replace it.
 *
 * 3. **Client-owned visibility.** Closing flips `open` synchronously inside
 *    the surface model. `onClose` is invoked AFTER the transition so server
 *    notification is a best-effort side-effect, never a gate.
 */
export function surface<ChildModel, ChildMsg>(config: SurfaceConfig<ChildModel, ChildMsg>): SurfaceDescriptor<ChildModel, ChildMsg> {
  const host: SurfaceHost = config.host ?? 'modal';

  function closeNow(model: SurfaceModel<ChildModel>, reason: SurfaceCloseReason): [SurfaceModel<ChildModel>, Cmd<SurfaceMsg<ChildMsg>>] {
    if (!model.open) return [model, NebulaCmd.none()];
    // Visibility transitions optimistically. The `onClose` side-effect is
    // dispatched as a fire-and-forget Cmd so the model update is not
    // blocked by host acknowledgement.
    const sideEffect: Cmd<SurfaceMsg<ChildMsg>> = config.onClose
      ? NebulaCmd.perform(
          async () => {
            config.onClose!(reason);
            return reason;
          },
          () => ({ type: 'surface:close', reason }) as SurfaceMsg<ChildMsg>,
        )
      : NebulaCmd.none();
    return [{ ...model, open: false, closeReason: reason }, sideEffect];
  }

  return {
    init(): [SurfaceModel<ChildModel>, Cmd<SurfaceMsg<ChildMsg>>] {
      const [childModel, childCmd] = config.child.init();
      return [
        {
          open: config.initiallyOpen ?? true,
          child: childModel,
          closeReason: null,
        },
        NebulaCmd.map(childCmd, (childMsg) => ({ type: 'surface:child', msg: childMsg }) as SurfaceMsg<ChildMsg>),
      ];
    },

    update(msg: SurfaceMsg<ChildMsg>, model: SurfaceModel<ChildModel>): [SurfaceModel<ChildModel>, Cmd<SurfaceMsg<ChildMsg>>] {
      switch (msg.type) {
        case 'surface:open':
          return [{ ...model, open: true, closeReason: null }, NebulaCmd.none()];
        case 'surface:close':
          return closeNow(model, msg.reason);
        case 'surface:child': {
          if (!model.open) return [model, NebulaCmd.none()];
          const [nextChild, childCmd] = config.child.update(msg.msg, model.child);
          return [
            { ...model, child: nextChild },
            NebulaCmd.map(childCmd, (childMsg) => ({ type: 'surface:child', msg: childMsg }) as SurfaceMsg<ChildMsg>),
          ];
        }
      }
    },

    view(model: SurfaceModel<ChildModel>): VNode {
      if (!model.open) {
        // CLAUDE.md: client-owned visibility means a closed surface emits
        // empty geometry — no residual chrome. Other descriptors will pick
        // up the freed cell space immediately.
        return empty(0, 0);
      }

      const theme = resolveOrbitTheme(config);
      const opaqueBg = config.opaqueBackground ?? theme.colors.surfaceRaised;
      const titleStyle = style({ bold: true, color: formColor(config, 'text') });
      const closeStyle = style({ color: feedbackColor(config, 'danger'), bold: true });
      const hintStyle = style({ dim: true, color: formColor(config, 'muted') });

      const header = row(
        text(`${config.title ?? hostLabel(host)}`, titleStyle),
        text('  '),
        text('[× Close]', closeStyle),
      );

      const childView = config.child.view(model.child);
      const hint = text(' [Esc] close   [Ctrl/Cmd+Shift+Backspace] panic', hintStyle);

      // Use a real container with an explicit `background` attribute that
      // any renderer should honour. Renderers that ignore unknown attrs
      // still produce a readable surface because the title row + child view
      // sit at the top of the column.
      return column(
        header,
        empty(0, 0),
        childView,
        empty(0, 0),
        hint,
        text('', style({ background: opaqueBg })),
      );
    },

    subscriptions(model: SurfaceModel<ChildModel>): Sub<SurfaceMsg<ChildMsg>> {
      if (!model.open) return NebulaSub.none();
      const subs: Sub<SurfaceMsg<ChildMsg>>[] = [
        NebulaSub.key('escape', { type: 'surface:close', reason: 'escape' } as SurfaceMsg<ChildMsg>),
        NebulaSub.keyWithModifiers(PANIC_KEY, PANIC_MODIFIERS_CTRL, {
          type: 'surface:close',
          reason: 'panic',
        } as SurfaceMsg<ChildMsg>),
        NebulaSub.keyWithModifiers(PANIC_KEY, PANIC_MODIFIERS_META, {
          type: 'surface:close',
          reason: 'panic',
        } as SurfaceMsg<ChildMsg>),
      ];
      if (config.child.subscriptions) {
        const childSub = config.child.subscriptions(model.child);
        subs.push(
          NebulaSub.map(childSub, (childMsg) => ({ type: 'surface:child', msg: childMsg }) as SurfaceMsg<ChildMsg>),
        );
      }
      return NebulaSub.batch(...subs);
    },

    isOpen(model: SurfaceModel<ChildModel>): boolean {
      return model.open;
    },

    getChildModel(model: SurfaceModel<ChildModel>): ChildModel {
      return model.child;
    },

    close(model: SurfaceModel<ChildModel>, reason: SurfaceCloseReason = 'programmatic'): [SurfaceModel<ChildModel>, Cmd<SurfaceMsg<ChildMsg>>] {
      return closeNow(model, reason);
    },
  };
}

function hostLabel(host: SurfaceHost): string {
  switch (host) {
    case 'modal':
      return 'Dialog';
    case 'drawer':
      return 'Drawer';
    case 'peek':
      return 'Peek';
  }
}

// ─── Convenience wrappers ───────────────────────────────────────────────────

/**
 * Convenience: wrap a form descriptor in a surface. Identical to calling
 * `surface(config)` directly — the helper exists so the call site reads
 * `formSurface({ child: myForm })` and not `surface({ child: myForm })`.
 */
export function formSurface<ChildModel, ChildMsg>(config: SurfaceConfig<ChildModel, ChildMsg>): SurfaceDescriptor<ChildModel, ChildMsg> {
  return surface(config);
}

/**
 * Convenience: wrap a wizard descriptor in a surface. Wizard surfaces default
 * to the `'drawer'` host visual hint because multi-step wizards typically
 * sit alongside the main UI rather than over it.
 */
export function wizardSurface<ChildModel, ChildMsg>(config: SurfaceConfig<ChildModel, ChildMsg>): SurfaceDescriptor<ChildModel, ChildMsg> {
  return surface({ host: 'drawer', ...config });
}
