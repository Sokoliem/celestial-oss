import { describe, expect, it } from 'vitest';
import { alert, alertGroup } from '../alert.js';

describe('alert', () => {
  it('initializes with visible true', () => {
    const comp = alert({ message: 'Error occurred' });
    const [model] = comp.init();
    expect(model.visible).toBe(true);
  });

  it('dismisses alert on dismiss message', () => {
    const comp = alert({ message: 'Error occurred' });
    const [model] = comp.init();
    const [dismissed] = comp.update({ type: 'dismiss' }, model);
    expect(dismissed.visible).toBe(false);
  });

  it('shows alert on show message', () => {
    const comp = alert({ message: 'Error occurred' });
    const [model] = comp.init();
    const [hidden] = comp.update({ type: 'dismiss' }, model);
    const [shown] = comp.update({ type: 'show' }, hidden);
    expect(shown.visible).toBe(true);
  });

  it('calls onDismiss callback when dismissed', () => {
    let dismissed = false;
    const comp = alert({
      message: 'Error occurred',
      onDismiss: () => {
        dismissed = true;
      },
    });
    const [model] = comp.init();
    comp.update({ type: 'dismiss' }, model);
    expect(dismissed).toBe(true);
  });

  it('provides hover and direct pointer dismissal for the visible close control', () => {
    const comp = alert({ id: 'network-alert', message: 'Error occurred', dismissible: true });
    const [model] = comp.init();
    const [hovered] = comp.update({ type: 'hover-dismiss' }, model);
    expect(hovered.hoveredDismiss).toBe(true);
    expect(JSON.stringify(comp.view(hovered))).toContain('onMouseEnter');
    expect(JSON.stringify(comp.subscriptions?.(hovered))).toContain('elementMouse');

    const [resting] = comp.update({ type: 'leave-dismiss' }, hovered);
    expect(resting.hoveredDismiss).toBe(false);
  });

  it('renders view without crashing', () => {
    const comp = alert({ message: 'Error occurred' });
    const [model] = comp.init();
    const view = comp.view(model);
    expect(view).toBeDefined();
  });

  it('renders with custom theme without crashing', () => {
    const comp = alert({ message: 'Error occurred', theme: {} });
    const [model] = comp.init();
    expect(comp.view(model)).toBeDefined();
  });

  it('renders all variants with theme', () => {
    for (const variant of ['info', 'success', 'warning', 'danger'] as const) {
      const comp = alert({ message: 'Message', variant, theme: {} });
      const [model] = comp.init();
      expect(comp.view(model)).toBeDefined();
    }
  });

  it('renders different variants', () => {
    const variants = ['info', 'success', 'warning', 'danger'] as const;
    for (const v of variants) {
      const comp = alert({ message: 'Message', variant: v });
      const [model] = comp.init();
      const view = comp.view(model);
      expect(view).toBeDefined();
    }
  });
});

describe('alertGroup', () => {
  it('initializes with all alerts visible', () => {
    const comp = alertGroup({
      alerts: [{ message: 'Alert 1' }, { message: 'Alert 2' }],
    });
    const [model] = comp.init();
    expect(model.visible.length).toBe(2);
    expect(model.visible.every((v) => v === true)).toBe(true);
  });

  it('dismisses first visible alert', () => {
    const comp = alertGroup({
      alerts: [{ message: 'Alert 1' }, { message: 'Alert 2' }],
    });
    const [model] = comp.init();
    const [updated] = comp.update({ type: 'dismiss' }, model);
    expect(updated.visible[0]).toBe(false);
    expect(updated.visible[1]).toBe(true);
  });
});
