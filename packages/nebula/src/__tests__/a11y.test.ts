import { describe, expect, it, vi } from 'vitest';
import {
  announce,
  ariaDescribedBy,
  ariaLabel,
  ariaLive,
  createAccessibilityRuntime,
  createAria,
  createLiveRegion,
  describeElement,
  focusIndicator,
  isInteractive,
  isLiveRegion,
  mergeAria,
  role,
  withFocusIndicator,
} from '../a11y.js';

// ─── Existing tests ─────────────────────────────────────────────────────────

describe('createAria', () => {
  it('stores provided attrs', () => {
    const attrs = createAria({ role: 'navigation', label: 'Main Menu' });
    expect(attrs.role).toBe('navigation');
    expect(attrs.label).toBe('Main Menu');
  });

  it('handles empty input', () => {
    const attrs = createAria({});
    expect(attrs).toEqual({});
  });
});

describe('mergeAria', () => {
  it('override wins on conflict', () => {
    const base = { role: 'navigation' as const, label: 'Old' };
    const override = { role: 'banner' as const, label: 'New' };
    const merged = mergeAria(base, override);
    expect(merged.role).toBe('banner');
    expect(merged.label).toBe('New');
  });

  it('undefined base returns override', () => {
    const override = { role: 'alert' as const, label: 'Warning' };
    const merged = mergeAria(undefined, override);
    expect(merged).toEqual(override);
  });

  it('combines non-overlapping attrs', () => {
    const base = { role: 'navigation' as const };
    const override = { label: 'Sidebar' };
    const merged = mergeAria(base, override);
    expect(merged.role).toBe('navigation');
    expect(merged.label).toBe('Sidebar');
  });
});

describe('isInteractive', () => {
  it('true for menu, menuitem, tab, dialog', () => {
    expect(isInteractive({ role: 'menu' })).toBe(true);
    expect(isInteractive({ role: 'menuitem' })).toBe(true);
    expect(isInteractive({ role: 'tab' })).toBe(true);
    expect(isInteractive({ role: 'dialog' })).toBe(true);
  });

  it('true for form, tree, treeitem', () => {
    expect(isInteractive({ role: 'form' })).toBe(true);
    expect(isInteractive({ role: 'tree' })).toBe(true);
    expect(isInteractive({ role: 'treeitem' })).toBe(true);
  });

  it('true for button and textbox', () => {
    expect(isInteractive({ role: 'button' })).toBe(true);
    expect(isInteractive({ role: 'textbox' })).toBe(true);
  });

  it('true for listitem with checked or selected', () => {
    expect(isInteractive({ role: 'listitem', checked: true })).toBe(true);
    expect(isInteractive({ role: 'listitem', selected: true })).toBe(true);
    expect(isInteractive({ role: 'listitem', checked: 'mixed' })).toBe(true);
  });

  it('false for listitem without checked or selected', () => {
    expect(isInteractive({ role: 'listitem' })).toBe(false);
  });

  it('false for main, banner, status, log', () => {
    expect(isInteractive({ role: 'main' })).toBe(false);
    expect(isInteractive({ role: 'banner' })).toBe(false);
    expect(isInteractive({ role: 'status' })).toBe(false);
    expect(isInteractive({ role: 'log' })).toBe(false);
  });

  it('false when no role is set', () => {
    expect(isInteractive({})).toBe(false);
  });
});

describe('describeElement', () => {
  it('navigation with label', () => {
    const desc = describeElement({ role: 'navigation', label: 'Main Menu' });
    expect(desc).toBe('navigation: Main Menu');
  });

  it('checkbox with checked state', () => {
    const desc = describeElement({ role: 'menuitem', label: 'Accept terms', checked: true });
    expect(desc).toBe('checkbox (checked): Accept terms');
  });

  it('checkbox with unchecked state', () => {
    const desc = describeElement({ role: 'menuitem', label: 'Accept terms', checked: false });
    expect(desc).toBe('checkbox (unchecked): Accept terms');
  });

  it('checkbox with mixed state', () => {
    const desc = describeElement({ role: 'menuitem', label: 'Select all', checked: 'mixed' });
    expect(desc).toBe('checkbox (mixed): Select all');
  });

  it('role only (no label)', () => {
    const desc = describeElement({ role: 'banner' });
    expect(desc).toBe('banner');
  });

  it('empty attrs', () => {
    const desc = describeElement({});
    expect(desc).toBe('element');
  });
});

describe('isLiveRegion', () => {
  it('true for polite', () => {
    expect(isLiveRegion({ live: 'polite' })).toBe(true);
  });

  it('true for assertive', () => {
    expect(isLiveRegion({ live: 'assertive' })).toBe(true);
  });

  it('false for off', () => {
    expect(isLiveRegion({ live: 'off' })).toBe(false);
  });

  it('false for undefined', () => {
    expect(isLiveRegion({})).toBe(false);
  });
});

// ─── New: role() helper ─────────────────────────────────────────────────────

describe('role', () => {
  it('creates attrs with button role', () => {
    const attrs = role('button');
    expect(attrs).toEqual({ role: 'button' });
  });

  it('creates attrs with textbox role', () => {
    const attrs = role('textbox');
    expect(attrs).toEqual({ role: 'textbox' });
  });

  it('creates attrs with heading role', () => {
    const attrs = role('heading');
    expect(attrs).toEqual({ role: 'heading' });
  });

  it('creates attrs with list role', () => {
    const attrs = role('list');
    expect(attrs).toEqual({ role: 'list' });
  });

  it('creates attrs with listitem role', () => {
    const attrs = role('listitem');
    expect(attrs).toEqual({ role: 'listitem' });
  });

  it('creates attrs with region role', () => {
    const attrs = role('region');
    expect(attrs).toEqual({ role: 'region' });
  });

  it('creates attrs with alert role', () => {
    const attrs = role('alert');
    expect(attrs).toEqual({ role: 'alert' });
  });

  it('creates attrs with status role', () => {
    const attrs = role('status');
    expect(attrs).toEqual({ role: 'status' });
  });

  it('creates attrs with dialog role', () => {
    const attrs = role('dialog');
    expect(attrs).toEqual({ role: 'dialog' });
  });
});

// ─── New: ariaLabel, ariaDescribedBy, ariaLive helpers ──────────────────────

describe('ariaLabel', () => {
  it('creates attrs with label', () => {
    expect(ariaLabel('Submit')).toEqual({ label: 'Submit' });
  });
});

describe('ariaDescribedBy', () => {
  it('creates attrs with describedBy', () => {
    expect(ariaDescribedBy('help-text')).toEqual({ describedBy: 'help-text' });
  });
});

describe('ariaLive', () => {
  it('creates attrs with polite live', () => {
    expect(ariaLive('polite')).toEqual({ live: 'polite' });
  });

  it('creates attrs with assertive live', () => {
    expect(ariaLive('assertive')).toEqual({ live: 'assertive' });
  });

  it('creates attrs with off live', () => {
    expect(ariaLive('off')).toEqual({ live: 'off' });
  });
});

// ─── New: mergeAria with describedBy ────────────────────────────────────────

describe('mergeAria with new attrs', () => {
  it('merges describedBy', () => {
    const base = { role: 'button' as const };
    const override = { describedBy: 'tooltip-1' };
    const merged = mergeAria(base, override);
    expect(merged.role).toBe('button');
    expect(merged.describedBy).toBe('tooltip-1');
  });
});

// ─── New: createLiveRegion ──────────────────────────────────────────────────

describe('createLiveRegion', () => {
  it('starts empty', () => {
    const lr = createLiveRegion();
    expect(lr.pending()).toEqual([]);
    expect(lr.drain()).toEqual([]);
  });

  it('queues announcements', () => {
    const lr = createLiveRegion();
    lr.announce('Hello');
    lr.announce('World', 'assertive');

    const pending = lr.pending();
    expect(pending).toHaveLength(2);
    expect(pending[0]!.message).toBe('Hello');
    expect(pending[0]!.priority).toBe('polite');
    expect(pending[1]!.message).toBe('World');
    expect(pending[1]!.priority).toBe('assertive');
  });

  it('drain removes items from queue', () => {
    const lr = createLiveRegion();
    lr.announce('First');
    lr.announce('Second');

    const drained = lr.drain();
    expect(drained).toHaveLength(2);
    expect(lr.pending()).toHaveLength(0);
  });

  it('clear empties the queue', () => {
    const lr = createLiveRegion();
    lr.announce('Will be cleared');
    lr.clear();
    expect(lr.pending()).toHaveLength(0);
  });

  it('announcements have timestamps', () => {
    const lr = createLiveRegion();
    const before = Date.now();
    lr.announce('Timed');
    const after = Date.now();

    const items = lr.pending();
    expect(items[0]!.timestamp).toBeGreaterThanOrEqual(before);
    expect(items[0]!.timestamp).toBeLessThanOrEqual(after);
  });

  it('pending returns a copy, not the internal array', () => {
    const lr = createLiveRegion();
    lr.announce('One');
    const first = lr.pending();
    lr.announce('Two');
    const second = lr.pending();
    // first snapshot should still have length 1
    expect(first).toHaveLength(1);
    expect(second).toHaveLength(2);
  });
});

// ─── New: announce() convenience function ───────────────────────────────────

describe('announce', () => {
  it('adds message to live region with default polite priority', () => {
    const lr = createLiveRegion();
    announce(lr, 'Item added');
    const items = lr.pending();
    expect(items).toHaveLength(1);
    expect(items[0]!.message).toBe('Item added');
    expect(items[0]!.priority).toBe('polite');
  });

  it('adds message with assertive priority', () => {
    const lr = createLiveRegion();
    announce(lr, 'Error occurred', 'assertive');
    const items = lr.pending();
    expect(items[0]!.priority).toBe('assertive');
  });
});

describe('createAccessibilityRuntime', () => {
  it('forwards focus changes to the sink', () => {
    const focusSpy = { onFocusChange: (_description: string, _id: string | null) => {} };
    const onFocusChange = vi.fn(focusSpy.onFocusChange);
    const runtime = createAccessibilityRuntime({ onFocusChange });

    runtime.focusChanged('input-1', 'focus: input-1');

    expect(onFocusChange).toHaveBeenCalledWith('focus: input-1', 'input-1');
  });

  it('queues and flushes announcements to the sink', () => {
    const onAnnouncements = vi.fn();
    const runtime = createAccessibilityRuntime({ onAnnouncements });

    runtime.announce('Agent finished', 'assertive');
    expect(runtime.pending()).toHaveLength(1);

    runtime.flush();

    expect(onAnnouncements).toHaveBeenCalledTimes(1);
    expect(onAnnouncements.mock.calls[0]?.[0][0]?.message).toBe('Agent finished');
    expect(runtime.pending()).toHaveLength(0);
  });
});

// ─── New: focusIndicator ────────────────────────────────────────────────────

describe('focusIndicator', () => {
  it('returns default style', () => {
    const indicator = focusIndicator();
    expect(indicator.prefix).toBe('▸ ');
    expect(indicator.suffix).toBe(' ◂');
  });

  it('returns bracket style', () => {
    const indicator = focusIndicator('bracket');
    expect(indicator.prefix).toBe('[ ');
    expect(indicator.suffix).toBe(' ]');
  });

  it('returns arrow style', () => {
    const indicator = focusIndicator('arrow');
    expect(indicator.prefix).toBe('→ ');
    expect(indicator.suffix).toBe(' ←');
  });
});

// ─── New: withFocusIndicator ────────────────────────────────────────────────

describe('withFocusIndicator', () => {
  it('adds indicator when focused', () => {
    const result = withFocusIndicator('Submit', true);
    expect(result).toBe('▸ Submit ◂');
  });

  it('returns plain text when not focused', () => {
    const result = withFocusIndicator('Submit', false);
    expect(result).toBe('Submit');
  });

  it('uses custom indicator', () => {
    const indicator = focusIndicator('bracket');
    const result = withFocusIndicator('Submit', true, indicator);
    expect(result).toBe('[ Submit ]');
  });

  it('uses arrow indicator', () => {
    const indicator = focusIndicator('arrow');
    const result = withFocusIndicator('Item', true, indicator);
    expect(result).toBe('→ Item ←');
  });
});
