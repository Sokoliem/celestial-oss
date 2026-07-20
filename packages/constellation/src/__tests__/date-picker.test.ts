import { extractNodeText } from '@celestial/nebula';
import { describe, expect, it, vi } from 'vitest';
import { datePicker, daysInMonth, firstDayOfMonth, isSameDay, type SimpleDate } from '../date-picker.js';

describe('daysInMonth', () => {
  it('returns 31 for January', () => {
    expect(daysInMonth(2024, 1)).toBe(31);
  });

  it('returns 29 for February in leap year', () => {
    expect(daysInMonth(2024, 2)).toBe(29);
  });

  it('returns 28 for February in non-leap year', () => {
    expect(daysInMonth(2023, 2)).toBe(28);
  });

  it('returns 30 for April', () => {
    expect(daysInMonth(2024, 4)).toBe(30);
  });

  it('returns 31 for December', () => {
    expect(daysInMonth(2024, 12)).toBe(31);
  });
});

describe('firstDayOfMonth', () => {
  it('returns correct day of week', () => {
    // January 1, 2024 was a Monday (1)
    expect(firstDayOfMonth(2024, 1)).toBe(1);
  });

  it('returns 0 for Sunday start', () => {
    // September 1, 2024 was a Sunday (0)
    expect(firstDayOfMonth(2024, 9)).toBe(0);
  });
});

describe('isSameDay', () => {
  it('returns true for same dates', () => {
    const a: SimpleDate = { year: 2024, month: 3, day: 15 };
    const b: SimpleDate = { year: 2024, month: 3, day: 15 };
    expect(isSameDay(a, b)).toBe(true);
  });

  it('returns false for different days', () => {
    const a: SimpleDate = { year: 2024, month: 3, day: 15 };
    const b: SimpleDate = { year: 2024, month: 3, day: 16 };
    expect(isSameDay(a, b)).toBe(false);
  });

  it('returns false for different months', () => {
    const a: SimpleDate = { year: 2024, month: 3, day: 15 };
    const b: SimpleDate = { year: 2024, month: 4, day: 15 };
    expect(isSameDay(a, b)).toBe(false);
  });

  it('returns false for different years', () => {
    const a: SimpleDate = { year: 2024, month: 3, day: 15 };
    const b: SimpleDate = { year: 2025, month: 3, day: 15 };
    expect(isSameDay(a, b)).toBe(false);
  });
});

describe('datePicker', () => {
  describe('init', () => {
    it('initializes with selected date when provided', () => {
      const selected: SimpleDate = { year: 2024, month: 6, day: 15 };
      const component = datePicker({ selected });
      const [model] = component.init();
      expect(model.viewYear).toBe(2024);
      expect(model.viewMonth).toBe(6);
      expect(model.cursorDay).toBe(15);
      expect(model.selected).toEqual(selected);
    });

    it('initializes unfocused', () => {
      const component = datePicker({});
      const [model] = component.init();
      expect(model.focused).toBe(false);
    });

    it('clamps cursor day to valid range for month', () => {
      // February has at most 29 days
      const selected: SimpleDate = { year: 2023, month: 2, day: 31 };
      const component = datePicker({ selected });
      const [model] = component.init();
      expect(model.cursorDay).toBeLessThanOrEqual(28);
    });
  });

  describe('update', () => {
    const basePicker = datePicker({});
    const baseModel = {
      viewYear: 2024,
      viewMonth: 6,
      cursorDay: 15,
      selected: null,
      focused: true,
    };

    it('prev-month navigates to previous month', () => {
      const [updated] = basePicker.update({ type: 'prev-month' }, baseModel);
      expect(updated.viewMonth).toBe(5);
      expect(updated.viewYear).toBe(2024);
    });

    it('prev-month wraps to December of previous year', () => {
      const model = { ...baseModel, viewMonth: 1 };
      const [updated] = basePicker.update({ type: 'prev-month' }, model);
      expect(updated.viewMonth).toBe(12);
      expect(updated.viewYear).toBe(2023);
    });

    it('next-month navigates to next month', () => {
      const [updated] = basePicker.update({ type: 'next-month' }, baseModel);
      expect(updated.viewMonth).toBe(7);
      expect(updated.viewYear).toBe(2024);
    });

    it('next-month wraps to January of next year', () => {
      const model = { ...baseModel, viewMonth: 12 };
      const [updated] = basePicker.update({ type: 'next-month' }, model);
      expect(updated.viewMonth).toBe(1);
      expect(updated.viewYear).toBe(2025);
    });

    it('prev-year navigates to previous year', () => {
      const [updated] = basePicker.update({ type: 'prev-year' }, baseModel);
      expect(updated.viewYear).toBe(2023);
    });

    it('next-year navigates to next year', () => {
      const [updated] = basePicker.update({ type: 'next-year' }, baseModel);
      expect(updated.viewYear).toBe(2025);
    });

    it('cursor-left decrements cursor day', () => {
      const [updated] = basePicker.update({ type: 'cursor-left' }, baseModel);
      expect(updated.cursorDay).toBe(14);
    });

    it('cursor-left at day 1 should wrap to previous month last day', () => {
      // Bug: cursor-left at day 1 was a no-op. Should go to previous month's last day.
      const model = { ...baseModel, cursorDay: 1, viewMonth: 6, viewYear: 2024 };
      const [updated] = basePicker.update({ type: 'cursor-left' }, model);
      // May has 31 days
      expect(updated.cursorDay).toBe(31);
      expect(updated.viewMonth).toBe(5);
      expect(updated.viewYear).toBe(2024);
    });

    it('cursor-left at day 1 of January should wrap to December of previous year', () => {
      const model = { ...baseModel, cursorDay: 1, viewMonth: 1, viewYear: 2024 };
      const [updated] = basePicker.update({ type: 'cursor-left' }, model);
      expect(updated.cursorDay).toBe(31); // December has 31 days
      expect(updated.viewMonth).toBe(12);
      expect(updated.viewYear).toBe(2023);
    });

    it('cursor-right increments cursor day', () => {
      const [updated] = basePicker.update({ type: 'cursor-right' }, baseModel);
      expect(updated.cursorDay).toBe(16);
    });

    it('cursor-right at last day should wrap to next month day 1', () => {
      // Bug: cursor-right at last day was a no-op. Should go to next month day 1.
      const model = { ...baseModel, cursorDay: 30, viewMonth: 6, viewYear: 2024 }; // June has 30 days
      const [updated] = basePicker.update({ type: 'cursor-right' }, model);
      expect(updated.cursorDay).toBe(1);
      expect(updated.viewMonth).toBe(7);
      expect(updated.viewYear).toBe(2024);
    });

    it('cursor-right at last day of December should wrap to January of next year', () => {
      const model = { ...baseModel, cursorDay: 31, viewMonth: 12, viewYear: 2024 };
      const [updated] = basePicker.update({ type: 'cursor-right' }, model);
      expect(updated.cursorDay).toBe(1);
      expect(updated.viewMonth).toBe(1);
      expect(updated.viewYear).toBe(2025);
    });

    it('cursor-up moves back 7 days', () => {
      const [updated] = basePicker.update({ type: 'cursor-up' }, baseModel);
      expect(updated.cursorDay).toBe(8);
    });

    it('cursor-up wraps to previous month when result would be below 1', () => {
      // Fix (K7): cursor-up now wraps to previous month instead of being a dead key
      const model = { ...baseModel, cursorDay: 5 };
      const [updated] = basePicker.update({ type: 'cursor-up' }, model);
      // Day 5 - 7 = -2, wraps to previous month (May has 31 days): 31 + (5 - 7) = 29
      expect(updated.viewMonth).toBe(5);
      expect(updated.cursorDay).toBe(29);
    });

    it('cursor-down moves forward 7 days', () => {
      const [updated] = basePicker.update({ type: 'cursor-down' }, baseModel);
      expect(updated.cursorDay).toBe(22);
    });

    it('cursor-down wraps to next month when result exceeds days in month', () => {
      // Fix (K7): cursor-down now wraps to next month instead of being a dead key
      const model = { ...baseModel, cursorDay: 28 }; // June has 30 days, 28 + 7 = 35 > 30
      const [updated] = basePicker.update({ type: 'cursor-down' }, model);
      // Overflow: 28 + 7 - 30 = 5
      expect(updated.viewMonth).toBe(7); // July
      expect(updated.cursorDay).toBe(5);
    });

    it('select sets selected date and calls onSelect', () => {
      const onSelect = vi.fn();
      const picker = datePicker({ onSelect });
      const [updated] = picker.update({ type: 'select' }, baseModel);
      expect(updated.selected).toEqual({ year: 2024, month: 6, day: 15 });
      expect(onSelect).toHaveBeenCalledWith({ year: 2024, month: 6, day: 15 });
    });

    it('clamps cursor day when navigating to shorter month', () => {
      const model = { ...baseModel, viewMonth: 3, cursorDay: 31 }; // March 31
      const [updated] = basePicker.update({ type: 'next-month' }, model);
      expect(updated.viewMonth).toBe(4); // April
      expect(updated.cursorDay).toBe(30); // April has 30 days
    });

    it('handles focus', () => {
      const [updated] = basePicker.update({ type: 'focus' }, { ...baseModel, focused: false });
      expect(updated.focused).toBe(true);
    });

    it('handles blur', () => {
      const [updated] = basePicker.update({ type: 'blur' }, baseModel);
      expect(updated.focused).toBe(false);
    });
  });

  describe('view', () => {
    it('renders a column with calendar content', () => {
      const component = datePicker({ selected: { year: 2024, month: 1, day: 15 } });
      const [model] = component.init();
      const vnode = component.view(model);
      expect(vnode.kind).toBe('column');
    });

    it('includes month name in title', () => {
      const component = datePicker({ selected: { year: 2024, month: 3, day: 1 } });
      const [model] = component.init();
      const vnode = component.view(model);
      expect(extractNodeText(vnode)).toContain('March');
      expect(extractNodeText(vnode)).toContain('2024');
    });

    it('includes day headers', () => {
      const component = datePicker({});
      const [model] = component.init();
      const vnode = component.view(model);
      if (vnode.kind === 'column') {
        const header = vnode.children[1];
        if (header?.kind === 'text') {
          expect(header.content).toContain('Su');
          expect(header.content).toContain('Mo');
        }
      }
    });

    it('formats calendar chrome with the configured locale', () => {
      const component = datePicker({
        selected: { year: 2024, month: 3, day: 1 },
        locale: 'ar-EG',
      });
      const [model] = component.init();
      const vnode = component.view(model);

      expect(extractNodeText(vnode)).toContain('٢٠٢٤');
      expect(extractNodeText(vnode)).toContain('٠١');
    });

    it('normalizes malformed dates and snapshots the initial selection', () => {
      const selected = { year: Number.POSITIVE_INFINITY, month: -5, day: 99 };
      const component = datePicker({ selected });
      selected.year = 2024;
      const [model] = component.init();
      expect(model.viewYear).toBeGreaterThanOrEqual(1);
      expect(model.viewYear).toBeLessThanOrEqual(9999);
      expect(model.viewMonth).toBe(1);
      expect(model.cursorDay).toBe(31);
    });
  });

  describe('subscriptions', () => {
    it('keeps pointer navigation active when not focused', () => {
      const component = datePicker({});
      const model = {
        viewYear: 2024,
        viewMonth: 1,
        cursorDay: 1,
        selected: null,
        focused: false,
      };
      const sub = component.subscriptions?.(model);
      expect(sub).toBeDefined();
      if (sub) {
        expect(sub._kind.kind).toBe('elementMouse');
      }
    });

    it('returns batch of subscriptions when focused', () => {
      const component = datePicker({});
      const model = {
        viewYear: 2024,
        viewMonth: 1,
        cursorDay: 1,
        selected: null,
        focused: true,
      };
      const sub = component.subscriptions?.(model);
      expect(sub).toBeDefined();
      if (sub) {
        expect(sub._kind.kind).toBe('batch');
      }
    });

    it('selects a clicked day directly and focuses the calendar', () => {
      const onSelect = vi.fn();
      const component = datePicker({ onSelect });
      const model = {
        viewYear: 2024,
        viewMonth: 2,
        cursorDay: 1,
        selected: null,
        focused: false,
      };
      const [updated] = component.update({ type: 'select-day', day: 29 }, model);
      expect(updated.selected).toEqual({ year: 2024, month: 2, day: 29 });
      expect(updated.focused).toBe(true);
      expect(onSelect).toHaveBeenCalledWith({ year: 2024, month: 2, day: 29 });
      expect(component.update({ type: 'select-day', day: Number.NaN }, model)[0]).toBe(model);
    });
  });
});
