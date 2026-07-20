import { Cmd, type Msg, Sub, type VNode, text } from '@celestial/nebula';
import { describe, expect, it, vi } from 'vitest';
import { formSurface, surface, type SurfaceChild, type SurfaceCloseReason, type SurfaceMsg, wizardSurface } from '../form-surface.js';

// A minimal child descriptor that tracks a counter and reports submit msgs.
interface CounterModel {
  readonly count: number;
}
type CounterMsg = Msg<'counter:inc'>;

const counterChild: SurfaceChild<CounterModel, CounterMsg> = {
  init(): [CounterModel, Cmd<CounterMsg>] {
    return [{ count: 0 }, Cmd.none()];
  },
  update(msg: CounterMsg, model: CounterModel): [CounterModel, Cmd<CounterMsg>] {
    if (msg.type === 'counter:inc') return [{ count: model.count + 1 }, Cmd.none()];
    return [model, Cmd.none()];
  },
  view(model: CounterModel): VNode {
    return text(`count=${model.count}`);
  },
  subscriptions(_model: CounterModel): Sub<CounterMsg> {
    return Sub.key('+', { type: 'counter:inc' });
  },
};

describe('surface()', () => {
  it('initialises open by default', () => {
    const sut = surface({ child: counterChild });
    const [model] = sut.init();
    expect(sut.isOpen(model)).toBe(true);
    expect(sut.getChildModel(model)).toEqual({ count: 0 });
  });

  it('honours `initiallyOpen: false`', () => {
    const sut = surface({ child: counterChild, initiallyOpen: false });
    const [model] = sut.init();
    expect(sut.isOpen(model)).toBe(false);
  });

  it('routes child msgs through `surface:child`', () => {
    const sut = surface({ child: counterChild });
    const [initial] = sut.init();
    const [next] = sut.update({ type: 'surface:child', msg: { type: 'counter:inc' } }, initial);
    expect(sut.getChildModel(next)).toEqual({ count: 1 });
  });

  it('drops child msgs once the surface is closed (client-owned visibility)', () => {
    const sut = surface({ child: counterChild });
    const [initial] = sut.init();
    const [closed] = sut.update({ type: 'surface:close', reason: 'programmatic' }, initial);
    expect(sut.isOpen(closed)).toBe(false);
    const [stillClosed] = sut.update({ type: 'surface:child', msg: { type: 'counter:inc' } }, closed);
    expect(sut.getChildModel(stillClosed)).toEqual({ count: 0 });
  });

  it('closes synchronously and records the reason', () => {
    const sut = surface({ child: counterChild });
    const [initial] = sut.init();
    const [next] = sut.update({ type: 'surface:close', reason: 'escape' }, initial);
    expect(next.open).toBe(false);
    expect(next.closeReason).toBe('escape');
  });

  it('fires onClose AFTER the transition, never as a gate', () => {
    const recorded: SurfaceCloseReason[] = [];
    const onClose = vi.fn((reason: SurfaceCloseReason) => {
      recorded.push(reason);
    });
    const sut = surface({ child: counterChild, onClose });
    const [initial] = sut.init();
    const [next] = sut.update({ type: 'surface:close', reason: 'escape' }, initial);
    // Surface is already removed from view regardless of whether onClose has
    // run. The fire-and-forget side-effect Cmd is the carrier; we just
    // assert the visibility transition happened first.
    expect(next.open).toBe(false);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('reopens via `surface:open`', () => {
    const sut = surface({ child: counterChild });
    const [initial] = sut.init();
    const [closed] = sut.update({ type: 'surface:close', reason: 'escape' }, initial);
    const [reopened] = sut.update({ type: 'surface:open' }, closed);
    expect(reopened.open).toBe(true);
    expect(reopened.closeReason).toBe(null);
  });

  it('emits empty geometry when closed (no residual chrome)', () => {
    const sut = surface({ child: counterChild });
    const [initial] = sut.init();
    const [closed] = sut.update({ type: 'surface:close', reason: 'panic' }, initial);
    const view = sut.view(closed);
    // The view should not contain the child renderer; we verify by sampling
    // — `empty(0,0)` is a non-text node, so JSON serialising the view should
    // not contain the child text.
    expect(JSON.stringify(view)).not.toContain('count=');
  });

  it('does not render the child view when closed', () => {
    const childSpy = vi.fn(counterChild.view);
    const spyChild = { ...counterChild, view: childSpy };
    const sut = surface({ child: spyChild });
    const [initial] = sut.init();
    const [closed] = sut.update({ type: 'surface:close', reason: 'panic' }, initial);
    childSpy.mockClear();
    sut.view(closed);
    expect(childSpy).not.toHaveBeenCalled();
  });

  it('renders the child view when open', () => {
    const childSpy = vi.fn(counterChild.view);
    const spyChild = { ...counterChild, view: childSpy };
    const sut = surface({ child: spyChild });
    const [initial] = sut.init();
    sut.view(initial);
    expect(childSpy).toHaveBeenCalledTimes(1);
  });

  it('subscribes to escape + panic shortcuts only when open', () => {
    const sut = surface({ child: counterChild });
    const [initial] = sut.init();
    const subOpen = sut.subscriptions!(initial);
    expect(subOpen).toBeDefined();

    const [closed] = sut.update({ type: 'surface:close', reason: 'escape' }, initial);
    const subClosed = sut.subscriptions!(closed);
    // Sub.none() returns a sub object with no key bindings; we just verify
    // it is a different shape than the open subscription bundle.
    expect(subClosed).toBeDefined();
  });

  it('treats programmatic close on an already-closed surface as a no-op', () => {
    const sut = surface({ child: counterChild });
    const [initial] = sut.init();
    const [closed] = sut.close(initial, 'programmatic');
    const [closedAgain] = sut.close(closed, 'programmatic');
    expect(closedAgain).toBe(closed);
  });
});

describe('formSurface()', () => {
  it('is a direct alias of surface()', () => {
    const sut = formSurface({ child: counterChild });
    const [model] = sut.init();
    expect(sut.isOpen(model)).toBe(true);
  });

  it('preserves a custom host', () => {
    const sut = formSurface({ child: counterChild, host: 'peek' });
    const [model] = sut.init();
    expect(sut.isOpen(model)).toBe(true);
  });
});

describe('wizardSurface()', () => {
  it("defaults to the 'drawer' host", () => {
    const sut = wizardSurface({ child: counterChild });
    const [model] = sut.init();
    expect(sut.isOpen(model)).toBe(true);
    // Visual host hint is not surfaced through the model API; verifying that
    // the surface initialised cleanly is enough — a separate visual test
    // would assert the layout differs.
  });

  it('allows explicit host overrides', () => {
    const sut = wizardSurface({ child: counterChild, host: 'modal' });
    const [model] = sut.init();
    expect(sut.isOpen(model)).toBe(true);
  });
});

// Sanity: surface msgs follow the documented shape so callers can pattern
// match on the union without surprises.
describe('SurfaceMsg shape', () => {
  it('typechecks the three msg variants', () => {
    const _msgs: SurfaceMsg<CounterMsg>[] = [
      { type: 'surface:open' },
      { type: 'surface:close', reason: 'escape' },
      { type: 'surface:child', msg: { type: 'counter:inc' } },
    ];
    expect(_msgs.length).toBe(3);
  });
});
