import {
  app,
  Cmd,
  cmdKind,
  collectFocusNodes,
  collectHitRegions,
  column,
  focus,
  localState,
  memo,
  planLayout,
  portal,
  Sub,
  suspense,
  text,
} from '@celestial/core/nebula';
import { renderToLines } from '@celestial/test';
import { describe, expect, it, vi } from 'vitest';
import { modal } from '../modal.js';

describe('modal', () => {
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

  it('init creates open modal state by default', () => {
    const component = modal({ title: 'Test', content: text('Hello') });
    const [model, cmd] = component.init();
    expect(model.open).toBe(true);
    expect(cmdKind(cmd).kind).toBe('pushFocusGroup');
  });

  it('init should accept optional open parameter to start closed', () => {
    const component = modal({ title: 'Test', content: text('Hello'), open: false });
    const [model, cmd] = component.init();
    expect(model.open).toBe(false);
    expect(cmdKind(cmd).kind).toBe('none');
  });

  it('view renders title', () => {
    const component = modal({ title: 'My Modal', content: text('Content here') });
    const rendered = renderToLines(component.view({ open: true }), { width: 52, height: 20 }).join('\n');
    expect(rendered).toContain('My Modal');
  });

  it('view renders content', () => {
    const component = modal({ title: 'Test', content: text('Body text') });
    const rendered = renderToLines(component.view({ open: true }), { width: 52, height: 20 }).join('\n');
    expect(rendered).toContain('Body text');
  });

  it('view renders border around modal', () => {
    const component = modal({ title: 'Test', content: text('Body') });
    const model = { open: true };
    const vnode = component.view(model);
    expect(vnode.kind).toBe('box');
    if (vnode.kind === 'box') {
      expect(vnode.border).toBeDefined();
    }
  });

  it('renders a header close button plus an Escape hint', () => {
    const component = modal({ title: 'Test', content: text('Body') });
    const vnode = component.view({ open: true });
    const lines = renderToLines(vnode, { width: 52, height: 20 });
    const regions = collectHitRegions(planLayout(vnode, 52, 20));
    const closeRegion = regions.find((region) => region.id.includes(':close'));

    expect(lines.join('\n')).toContain('[x]');
    expect(lines.join('\n')).toContain('Esc closes');
    expect(lines.findIndex((line) => line.includes('[x]'))).toBeLessThan(lines.findIndex((line) => line.includes('Body')));
    expect(closeRegion?.handlers.onClick).toBeDefined();
    expect(closeRegion?.handlers.onMouseEnter).toBeDefined();
  });

  it('update handles close on escape', () => {
    const onClose = vi.fn();
    const component = modal({ title: 'Test', content: text('Body'), onClose });
    const model = { open: true };
    const [updated, cmd] = component.update({ type: 'close' }, model);
    expect(updated.open).toBe(false);
    expect(onClose).toHaveBeenCalled();
    expect(cmdKind(cmd).kind).toBe('popFocusGroup');
  });

  it('update handles open', () => {
    const component = modal({ title: 'Test', content: text('Body') });
    const model = { open: false };
    const [updated, cmd] = component.update({ type: 'open' }, model);
    expect(updated.open).toBe(true);
    expect(cmdKind(cmd).kind).toBe('pushFocusGroup');
  });

  it('tracks pointer hover on the visible close action', () => {
    const component = modal({ title: 'Test', content: text('Body') });
    const [model] = component.init();
    const [hovered] = component.update({ type: 'hover-close' }, model);
    expect(hovered.hoveredClose).toBe(true);
    const [left] = component.update({ type: 'leave-close' }, hovered);
    expect(left.hoveredClose).toBe(false);
  });

  it('view assigns the modal focus group to nested focus nodes', () => {
    const component = modal({
      title: 'Test',
      content: column(focus('field-a', text('Alpha')), focus('field-b', text('Beta'))),
    });

    const vnode = component.view({ open: true });
    const focusNodes = collectFocusNodes(vnode);
    const fieldA = focusNodes.find((node) => node.id === 'field-a');
    const fieldB = focusNodes.find((node) => node.id === 'field-b');
    expect(fieldA?.group).toBeDefined();
    expect(fieldA?.group).toBe(fieldB?.group);
    expect(focusNodes.find((node) => node.id.endsWith('-close'))?.group).toBe(fieldA?.group);
  });

  it('assigns modal focus groups through component children', () => {
    const component = modal({
      title: 'Component Content',
      content: {
        kind: 'component',
        render: () => focus('component-field', text('Nested field')),
      },
    });

    const vnode = component.view({ open: true });
    const focusNodes = collectFocusNodes(vnode);
    expect(focusNodes.find((node) => node.id === 'component-field')?.group).toBeDefined();
  });

  it('assigns focus groups through deferred and layered VNode boundaries', () => {
    const component = modal({
      title: 'Deferred content',
      content: portal(
        'modal-layer',
        suspense(
          memo(() => focus('memo-field', text('Memo field')), []),
          focus('fallback-field', text('Fallback field')),
          true,
        ),
      ),
    });

    const root = component.view({ open: true });
    const innerBox = root.kind === 'box' ? root.children[0] : undefined;
    const contentColumn = innerBox?.kind === 'box' ? innerBox.children[0] : undefined;
    const portalNode = contentColumn?.kind === 'column' ? contentColumn.children[3] : undefined;
    expect(portalNode?.kind).toBe('portal');
    if (portalNode?.kind !== 'portal' || portalNode.child.kind !== 'suspense') return;
    const renderedMemo = portalNode.child.child.kind === 'memo' ? portalNode.child.child.render() : undefined;
    expect(renderedMemo?.kind).toBe('focus');
    if (renderedMemo?.kind === 'focus') expect(renderedMemo.group).toBeDefined();
    expect(portalNode.child.fallback.kind).toBe('focus');
    if (portalNode.child.fallback.kind === 'focus')
      expect(portalNode.child.fallback.group).toBe(renderedMemo?.kind === 'focus' ? renderedMemo.group : undefined);
  });

  it('wraps text materialized by memo and local-state boundaries', () => {
    const component = modal({
      title: 'Deferred wrapping',
      width: 24,
      content: column(
        memo(() => text('Memo content keeps its final letter.'), []),
        localState(
          'modal-local',
          () => 0,
          (state: number) => state,
          () => text('Local content also remains complete.'),
        ),
      ),
    });
    const [model] = component.init();
    const lines = renderToLines(component.view(model), { width: 24, height: 30 });
    const rendered = lines.join('\n');

    expect(rendered).toContain('letter.');
    expect(rendered).toContain('complete.');
  });

  it('uses unique modal groups and close ids across instances', () => {
    const first = modal({ title: 'Shared Title', content: focus('first-field', text('First')) });
    const second = modal({ title: 'Shared Title', content: focus('second-field', text('Second')) });

    const firstNodes = collectFocusNodes(first.view({ open: true }));
    const secondNodes = collectFocusNodes(second.view({ open: true }));

    const firstGroup = firstNodes.find((node) => node.id === 'first-field')?.group;
    const secondGroup = secondNodes.find((node) => node.id === 'second-field')?.group;
    const firstCloseId = firstNodes.find((node) => node.id.includes('-close'))?.id;
    const secondCloseId = secondNodes.find((node) => node.id.includes('-close'))?.id;

    expect(firstGroup).toBeDefined();
    expect(secondGroup).toBeDefined();
    expect(firstGroup).not.toBe(secondGroup);
    expect(firstCloseId).not.toBe(secondCloseId);
  });

  it('traps tab navigation inside the modal group until closed', async () => {
    const component = modal({
      title: 'Dialog',
      content: column(focus('field-a', text('Alpha')), focus('field-b', text('Beta'))),
    });
    const [initialModal, initialCmd] = component.init();

    type RootMsg = { type: 'modal'; msg: import('../modal.js').ModalMsg } | { type: 'focus'; id: string | null };

    const terminal = new TestTerminal();
    const handle = app(
      {
        init: () => [{ modal: initialModal }, Cmd.map(initialCmd, (msg) => ({ type: 'modal', msg }) as RootMsg)],
        update: (msg, model) => {
          if (msg.type === 'modal') {
            const [modalModel, cmd] = component.update(msg.msg, model.modal);
            return [{ ...model, modal: modalModel }, Cmd.map(cmd, (inner) => ({ type: 'modal', msg: inner }) as RootMsg)];
          }
          return [model, Cmd.none<RootMsg>()];
        },
        view: (model) => column(focus('page', text('Page action')), component.view(model.modal)),
        subscriptions: (model) =>
          Sub.batch<RootMsg>(
            Sub.focus((id) => ({ type: 'focus', id })),
            Sub.map(component.subscriptions!(model.modal), (msg) => ({ type: 'modal', msg })),
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
    const focusEvents: Array<string | null> = [];
    const flush = async () => {
      await Promise.resolve();
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      await Promise.resolve();
    };

    terminal.simulateInput(Buffer.from('\t', 'utf8'));
    await flush();
    terminal.simulateInput(Buffer.from('\t', 'utf8'));
    await flush();
    terminal.simulateInput(Buffer.from('\t', 'utf8'));
    await flush();
    terminal.simulateInput(Buffer.from('\t', 'utf8'));
    await flush();

    const trappedIds = focusEvents;
    expect(trappedIds[0]).toContain('-close');
    expect(trappedIds[1]).toBe('field-a');
    expect(trappedIds[2]).toBe('field-b');
    expect(trappedIds[3]).toContain('-close');
    expect(trappedIds).not.toContain('page');

    terminal.simulateInput(Buffer.from('\x1b', 'utf8'));
    await flush();
    terminal.simulateInput(Buffer.from('\t', 'utf8'));
    await flush();

    expect(focusEvents.at(-1)).toBe('page');
    handle.stop();
  });

  it('view renders empty text when closed', () => {
    const component = modal({ title: 'Test', content: text('Body') });
    const model = { open: false };
    const vnode = component.view(model);
    expect(vnode.kind).toBe('text');
    if (vnode.kind === 'text') {
      expect(vnode.content).toBe('');
    }
  });

  it('subscriptions returns none when closed', () => {
    const component = modal({ title: 'Test', content: text('Body') });
    const model = { open: false };
    const sub = component.subscriptions!(model);
    // Sub.none() has _kind.kind === 'none'
    expect((sub as any)._kind.kind).toBe('none');
  });

  it('subscriptions returns escape key when open', () => {
    const component = modal({ title: 'Test', content: text('Body') });
    const model = { open: true };
    const sub = component.subscriptions!(model);
    expect(JSON.stringify(sub)).toContain('escape');
  });
});
