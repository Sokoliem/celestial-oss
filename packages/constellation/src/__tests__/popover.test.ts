import { app, Cmd, cmdKind, collectFocusNodes, column, extractNodeText, focus, Sub, text } from '@celestial/nebula';
import { describe, expect, it, vi } from 'vitest';
import { popover, popoverGroup } from '../popover.js';
import * as SurfaceContainer from '../surface-container.js';

describe('popover', () => {
  class TestTerminal {
    readonly writes: string[] = [];
    private cols = 60;
    private rows = 20;
    private inputHandlers: Array<(data: Buffer) => void> = [];
    private resizeHandlers: Array<() => void> = [];

    enterRawMode(): void {}
    exitRawMode(): void {}
    write(data: string): void {
      this.writes.push(data);
    }
    onInput(handler: (data: Buffer) => void): void {
      this.inputHandlers.push(handler);
    }
    offInput(handler: (data: Buffer) => void): void {
      this.inputHandlers = this.inputHandlers.filter((current) => current !== handler);
    }
    onResize(handler: () => void): void {
      this.resizeHandlers.push(handler);
    }
    offResize(handler: () => void): void {
      this.resizeHandlers = this.resizeHandlers.filter((current) => current !== handler);
    }
    getSize(): { cols: number; rows: number } {
      return { cols: this.cols, rows: this.rows };
    }
    simulateInput(data: Buffer): void {
      for (const handler of this.inputHandlers) {
        handler(data);
      }
    }
  }

  it('initializes with visible false', () => {
    const comp = popover({ trigger: { kind: 'text', text: 'Hover me' } as any, content: text('Content') });
    const [model, cmd] = comp.init();
    expect(model.visible).toBe(false);
    expect(cmdKind(cmd).kind).toBe('none');
  });

  it('shows popover on show message', () => {
    const comp = popover({ trigger: { kind: 'text', text: 'Hover me' } as any, content: focus('field', text('Content')) });
    const [model] = comp.init();
    const [shown, cmd] = comp.update({ type: 'show' }, model);
    expect(shown.visible).toBe(true);
    expect(cmdKind(cmd).kind).toBe('pushFocusGroup');
  });

  it('hides popover on hide message', () => {
    const comp = popover({ trigger: { kind: 'text', text: 'Hover me' } as any, content: focus('field', text('Content')) });
    const [model] = comp.init();
    const [shown] = comp.update({ type: 'show' }, model);
    const [hidden, cmd] = comp.update({ type: 'hide' }, shown);
    expect(hidden.visible).toBe(false);
    expect(cmdKind(cmd).kind).toBe('popFocusGroup');
  });

  it('toggles popover visibility', () => {
    const comp = popover({ trigger: { kind: 'text', text: 'Hover me' } as any, content: focus('field', text('Content')) });
    const [model] = comp.init();
    const [toggled1, cmd1] = comp.update({ type: 'toggle' }, model);
    expect(toggled1.visible).toBe(true);
    expect(cmdKind(cmd1).kind).toBe('pushFocusGroup');
    const [toggled2, cmd2] = comp.update({ type: 'toggle' }, toggled1);
    expect(toggled2.visible).toBe(false);
    expect(cmdKind(cmd2).kind).toBe('popFocusGroup');
  });

  it('assigns a shared focus group to visible nested focus nodes', () => {
    const comp = popover({
      trigger: text('Trigger'),
      content: column(focus('popover-field-a', text('Alpha')), focus('popover-field-b', text('Beta'))),
    });

    const vnode = comp.view({ visible: true, focusTrapActive: true } as import('../popover.js').PopoverModel);
    const focusNodes = collectFocusNodes(vnode);
    const first = focusNodes.find((node) => node.id === 'popover-field-a');
    const second = focusNodes.find((node) => node.id === 'popover-field-b');

    expect(first?.group).toBeDefined();
    expect(first?.group).toBe(second?.group);
  });

  it('persistent popovers do not trap focus but remain dismissible', () => {
    const comp = popover({ trigger: text('Trigger'), content: text('Content'), persistent: true });
    const [model, initCmd] = comp.init();
    expect((model as import('../popover.js').PopoverModel & { focusTrapActive: boolean }).focusTrapActive).toBe(false);
    expect(cmdKind(initCmd).kind).toBe('none');

    const [shown, showCmd] = comp.update({ type: 'show' }, model);
    expect((shown as import('../popover.js').PopoverModel & { focusTrapActive: boolean }).focusTrapActive).toBe(false);
    expect(cmdKind(showCmd).kind).toBe('none');
    const sub = comp.subscriptions!(shown) as any;
    expect(sub._kind.kind).toBe('batch');
    expect(sub._kind.subs.some((entry: any) => entry._kind.kind === 'key' && entry._kind.key === 'escape')).toBe(true);
  });

  it('provides pointer controls on both the trigger and visible close affordance', () => {
    const comp = popover({ trigger: text('Trigger'), content: text('Content'), title: 'Details' });
    const [hidden] = comp.init();
    expect(JSON.stringify(comp.view(hidden))).toContain('onClick');
    expect(comp.subscriptions!(hidden)._kind.kind).toBe('elementMouse');

    const [shown] = comp.update({ type: 'show' }, hidden);
    const serialized = JSON.stringify(comp.view(shown));
    expect(serialized).toContain('[x] close');
    expect(serialized).toContain('Close popover');
  });

  it('wraps content and clamps its width after a resize', () => {
    const comp = popover({ trigger: text('Trigger'), content: text('unbroken-content-tail'), width: 40 });
    const [initial] = comp.init();
    const [shown] = comp.update({ type: 'show' }, initial);
    const [narrow] = comp.update({ type: 'resize', cols: 14 }, shown);
    const serialized = JSON.stringify(comp.view(narrow));
    expect(serialized).toContain('"wrap":true');
    expect(serialized).toContain('"width":12');
    expect(serialized).toContain('unbroken-content-tail');
  });

  it('renders with custom theme without crashing', () => {
    const comp = popover({ trigger: text('Trigger'), content: text('Content'), theme: {} });
    const [model] = comp.init();
    expect(comp.view(model)).toBeDefined();
  });

  it('renders all variants with theme', () => {
    for (const variant of ['default', 'success', 'warning', 'danger', 'info'] as const) {
      const comp = popover({ trigger: text('Trigger'), content: text('Content'), variant, theme: {} });
      const [model] = comp.init();
      expect(comp.view(model)).toBeDefined();
    }
  });

  it('text-only popovers do not activate an empty focus trap', () => {
    const comp = popover({ trigger: text('Trigger'), content: text('Content only') });
    const [model] = comp.init();
    const [shown, cmd] = comp.update({ type: 'show' }, model);

    expect(shown.focusTrapActive).toBe(false);
    expect(cmdKind(cmd).kind).toBe('none');
  });

  it('show and hide are idempotent for focus-trap commands', () => {
    const comp = popover({ trigger: text('Trigger'), content: text('Content') });
    const [model] = comp.init();

    const [shown] = comp.update({ type: 'show' }, model);
    const [stillShown, duplicateShowCmd] = comp.update({ type: 'show' }, shown);
    expect(stillShown).toEqual(shown);
    expect(cmdKind(duplicateShowCmd).kind).toBe('none');

    const [hidden] = comp.update({ type: 'hide' }, shown);
    const [stillHidden, duplicateHideCmd] = comp.update({ type: 'hide' }, hidden);
    expect(stillHidden).toEqual(hidden);
    expect(cmdKind(duplicateHideCmd).kind).toBe('none');
  });

  it('traps tab navigation until hidden', async () => {
    const comp = popover({
      trigger: text('Trigger'),
      content: column(focus('popover-field-a', text('Alpha')), focus('popover-field-b', text('Beta'))),
    });
    const [initialPopover] = comp.init();
    const [shownPopover, shownCmd] = comp.update({ type: 'show' }, initialPopover);

    type RootMsg = { type: 'popover'; msg: import('../popover.js').PopoverMsg } | { type: 'focus'; id: string | null };

    const terminal = new TestTerminal();
    const focusEvents: Array<string | null> = [];
    const handle = app(
      {
        init: () => [{ popover: shownPopover }, Cmd.map(shownCmd, (msg) => ({ type: 'popover', msg }) as RootMsg)],
        update: (msg, model) => {
          if (msg.type === 'popover') {
            const [popoverModel, cmd] = comp.update(msg.msg, model.popover);
            return [{ ...model, popover: popoverModel }, Cmd.map(cmd, (inner) => ({ type: 'popover', msg: inner }) as RootMsg)];
          }
          return [model, Cmd.none<RootMsg>()];
        },
        view: (model) => column(focus('page', text('Page action')), comp.view(model.popover)),
        subscriptions: (model) =>
          Sub.batch<RootMsg>(
            Sub.focus((id) => ({ type: 'focus', id })),
            Sub.map(comp.subscriptions!(model.popover), (msg) => ({ type: 'popover', msg })),
          ),
      },
      {
        terminal,
        accessibility: {
          onAnnouncements() {},
          onFocusChange(_description, focusedId) {
            focusEvents.push(focusedId);
          },
        },
      },
    );

    const flush = async () => {
      await Promise.resolve();
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      await Promise.resolve();
    };
    await flush();

    terminal.simulateInput(Buffer.from('\t', 'utf8'));
    await flush();
    terminal.simulateInput(Buffer.from('\t', 'utf8'));
    await flush();

    expect(focusEvents[0]).toBe('popover-field-a');
    expect(focusEvents[1]).toBe('popover-field-b');
    expect(focusEvents).not.toContain('page');

    terminal.simulateInput(Buffer.from('\x1b', 'utf8'));
    await flush();
    terminal.simulateInput(Buffer.from('\t', 'utf8'));
    await flush();

    expect(focusEvents.at(-1)).toBe('page');
    handle.stop();
  });
});

describe('popoverGroup', () => {
  it('initializes with no active popover', () => {
    const comp = popoverGroup({
      popovers: [
        { trigger: 'A', content: 'Content A' },
        { trigger: 'B', content: 'Content B' },
      ],
    });
    const [model] = comp.init();
    expect(model.activeIndex).toBe(-1);
  });

  it('renders view without crashing', () => {
    const comp = popoverGroup({
      popovers: [
        { trigger: 'A', content: 'Content A' },
        { trigger: 'B', content: 'Content B' },
      ],
    });
    const [model] = comp.init();
    const view = comp.view(model);
    expect(view).toBeDefined();
  });

  it('subscribes escape when a grouped popover is active', () => {
    const comp = popoverGroup({
      popovers: [
        { trigger: 'A', content: 'Content A' },
        { trigger: 'B', content: 'Content B' },
      ],
    });

    const sub = comp.subscriptions!({ activeIndex: 0, hoveredIndex: -1, hoveredClose: false });
    expect((sub as any)._kind.kind).toBe('batch');
    expect(JSON.stringify(sub)).toContain('escape');
  });

  it('keeps pointer triggers active and opens the clicked grouped popover', () => {
    const mutable = [
      { trigger: 'A', content: 'Content A' },
      { trigger: 'B', content: 'Content B' },
    ];
    const comp = popoverGroup({ popovers: mutable });
    mutable[1]!.content = 'Changed';
    const [initial] = comp.init();
    expect(comp.subscriptions!(initial)._kind.kind).toBe('elementMouse');
    const [opened] = comp.update({ type: 'toggle-at', index: 1 }, initial);
    expect(opened.activeIndex).toBe(1);
    const rendered = extractNodeText(comp.view(opened));
    expect(rendered).toContain('Content B');
    expect(rendered).toContain('[x] close');
    expect(rendered).not.toContain('Changed');
  });

  it('ignores invalid grouped pointer indices', () => {
    const comp = popoverGroup({ popovers: [{ trigger: 'A', content: 'Content A' }] });
    const [model] = comp.init();
    expect(comp.update({ type: 'toggle-at', index: Number.NaN }, model)[0]).toBe(model);
  });
});

// ─── A1 / F-001 — popover panic-broadcast wiring ────────────────────────────
//
// Per follow-up PRD `docs/specs/2026-05-12-design-system-review-followup-prd.md`
// Phase A1. Asserts the surface-contract panic wiring shipped in the original
// plan's Phase 4.1 actually closes the popover and fans out via the module-level
// broadcaster.

describe('popover panic-broadcast', () => {
  it('panic on a visible popover transitions visible → hidden and pops focus when trapping', () => {
    const comp = popover({
      trigger: text('Trigger'),
      content: column(focus('panic-field-a', text('Alpha')), focus('panic-field-b', text('Beta'))),
    });
    const [initial] = comp.init();
    const [shown] = comp.update({ type: 'show' }, initial);
    expect(shown.visible).toBe(true);
    expect(shown.focusTrapActive).toBe(true);

    const [hidden, cmd] = comp.update({ type: 'panic' }, shown);
    expect(hidden.visible).toBe(false);
    expect(hidden.focusTrapActive).toBe(false);
    expect(cmdKind(cmd).kind).toBe('popFocusGroup');
  });

  it('panic on a hidden popover is a no-op (no focus-group churn)', () => {
    const comp = popover({
      trigger: text('Trigger'),
      content: column(focus('panic-noop-field', text('Alpha'))),
    });
    const [initial] = comp.init();
    expect(initial.visible).toBe(false);

    const [next, cmd] = comp.update({ type: 'panic' }, initial);
    expect(next.visible).toBe(false);
    expect(cmdKind(cmd).kind).toBe('none');
  });

  it('panic invokes broadcastSurfacePanic so sibling surfaces fan out', () => {
    const spy = vi.spyOn(SurfaceContainer, 'broadcastSurfacePanic');
    try {
      const comp = popover({
        trigger: text('Trigger'),
        content: column(focus('panic-broadcast-field', text('Alpha'))),
      });
      const [initial] = comp.init();
      const [shown] = comp.update({ type: 'show' }, initial);
      spy.mockClear();

      comp.update({ type: 'panic' }, shown);
      expect(spy).toHaveBeenCalledTimes(1);
    } finally {
      spy.mockRestore();
    }
  });

  it('text-only popovers (no focus trap) close on panic without popping a focus group', () => {
    const comp = popover({ trigger: text('Trigger'), content: text('Text only') });
    const [initial] = comp.init();
    const [shown] = comp.update({ type: 'show' }, initial);
    expect(shown.focusTrapActive).toBe(false);

    const [hidden, cmd] = comp.update({ type: 'panic' }, shown);
    expect(hidden.visible).toBe(false);
    // No focus group was pushed at show — panic must not emit popFocusGroup.
    expect(cmdKind(cmd).kind).toBe('none');
  });

  it('subscriptions while visible include escape AND the surface-contract panic key', () => {
    const comp = popover({
      trigger: text('Trigger'),
      content: column(focus('panic-sub-field', text('Alpha'))),
    });
    const [initial] = comp.init();
    const [shown] = comp.update({ type: 'show' }, initial);
    const sub = comp.subscriptions!(shown);

    // Recursively flatten Sub.batch → individual Sub leaves so we can assert
    // both the 'escape' key sub and the panic keyWithModifiers sub are present.
    const flatten = (s: any): any[] => {
      const k = s?._kind;
      if (!k) return [];
      if (k.kind === 'batch') return (k.subs as any[]).flatMap(flatten);
      return [s];
    };
    const leaves = flatten(sub) as Array<{ _kind: { kind: string; key?: string } }>;
    const keys = leaves.map((l) => l._kind.key).filter(Boolean);
    expect(keys).toContain('escape');
    expect(leaves.some((l) => l._kind.kind === 'keyWithModifiers')).toBe(true);
  });
});
