/**
 * DatePicker — Calendar-based date selection component.
 *
 * Renders a navigable month calendar with keyboard controls.
 * Supports month/year navigation, today highlighting,
 * and customizable date formatting.
 */

import type { Color, SemanticTheme, ThemeInput, TokenContract, TypographyToken } from '@celestial/corona';
import { style } from '@celestial/corona';
import type { Msg, ThemeContext, VNode } from '@celestial/nebula';
import { Cmd, column, event, row, Sub, setVNodeMeta, text } from '@celestial/nebula';
import { type LocaleLike, measureTextWidth, resolveLocale, sliceTextByWidth } from '@celestial/rosetta';
import { generateFocusGroupId } from './focus-group.js';
import { boundedInteger } from './internal.js';
import { useTokens } from './theme.js';
import type { ComponentDescriptor } from './types.js';

// ─── Token contract ─────────────────────────────────────────────────────────

export interface DatePickerTokens {
  text: Color;
  selected: Color;
  muted: Color;
  border: Color;
  borderHover: Color;
  borderActive: Color;
  labelStyle: TypographyToken;
}

export const datePickerContract: TokenContract<DatePickerTokens> = {
  text: (t: SemanticTheme) => t.colors.text,
  selected: (t: SemanticTheme) => t.colors.highlight,
  muted: (t: SemanticTheme) => t.colors.muted,
  border: (t: SemanticTheme) => t.colors.border,
  borderHover: (t: SemanticTheme) => t.colors.borderHover,
  borderActive: (t: SemanticTheme) => t.colors.borderActive,
  labelStyle: (t: SemanticTheme) => t.typography.label,
};

/** Configuration for creating a date picker component. */
export interface DatePickerConfig {
  /** Initially selected date (defaults to today). */
  selected?: SimpleDate;
  /** Callback when a date is selected. */
  onSelect?: (date: SimpleDate) => void;
  /** First day of the week: 0 = Sunday, 1 = Monday (default: 0). */
  firstDayOfWeek?: 0 | 1;
  /** Locale used for month, weekday, and day-number formatting. */
  locale?: LocaleLike;
  themeCtx?: ThemeContext;
  theme?: ThemeInput;
}

/** A simple year/month/day representation to avoid Date object issues. */
export interface SimpleDate {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
}

/** Model state for the date picker component. */
export interface DatePickerModel {
  /** Currently displayed month/year. */
  viewYear: number;
  viewMonth: number; // 1-12
  /** Currently highlighted day in the grid. */
  cursorDay: number;
  /** The selected date, if any. */
  selected: SimpleDate | null;
  /** Whether the picker is focused. */
  focused: boolean;
  /** Semantic calendar target currently under the pointer. */
  hovered?: string | null;
}

/** Messages the date picker can handle. */
export type DatePickerMsg =
  | Msg<'prev-month'>
  | Msg<'next-month'>
  | Msg<'prev-year'>
  | Msg<'next-year'>
  | Msg<'cursor-left'>
  | Msg<'cursor-right'>
  | Msg<'cursor-up'>
  | Msg<'cursor-down'>
  | Msg<'select'>
  | Msg<'select-day', { day: number }>
  | Msg<'today'>
  | Msg<'hover', { target: string }>
  | Msg<'leave', { target: string }>
  | Msg<'focus'>
  | Msg<'blur'>
  | Msg<'noop'>;

const MIN_CALENDAR_YEAR = 1;
const MAX_CALENDAR_YEAR = 9999;

function normalizeYear(year: number | undefined, fallback: number): number {
  return boundedInteger(year, fallback, MIN_CALENDAR_YEAR, MAX_CALENDAR_YEAR);
}

function normalizeMonth(month: number | undefined, fallback: number): number {
  return boundedInteger(month, fallback, 1, 12);
}

function calendarDate(year: number, month: number, day: number): Date {
  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(year, month - 1, day);
  return date;
}

/** Get the number of days in a given month. */
export function daysInMonth(year: number, month: number): number {
  const safeYear = normalizeYear(year, 1970);
  const safeMonth = normalizeMonth(month, 1);
  return calendarDate(safeYear, safeMonth + 1, 0).getUTCDate();
}

/** Get the day of week (0=Sun, 6=Sat) for the first day of a month. */
export function firstDayOfMonth(year: number, month: number): number {
  return calendarDate(normalizeYear(year, 1970), normalizeMonth(month, 1), 1).getUTCDay();
}

/** Get today's date as a SimpleDate. */
export function getToday(): SimpleDate {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() };
}

/** Check if two SimpleDates are the same day. */
export function isSameDay(a: SimpleDate, b: SimpleDate): boolean {
  return a.year === b.year && a.month === b.month && a.day === b.day;
}

const CALENDAR_CELL_WIDTH = 2;
const WEEKDAY_REFERENCE_SUNDAY = Date.UTC(2024, 0, 7);

/**
 * Create a date picker component for calendar-based date selection.
 *
 * @param config - Date picker configuration.
 * @returns A ComponentDescriptor for the date picker.
 */
export function datePicker(config: DatePickerConfig): ComponentDescriptor<DatePickerModel, DatePickerMsg> {
  const firstDow = config.firstDayOfWeek === 1 ? 1 : 0;
  const locale = resolveLocale(config.locale);
  const interactionId = generateFocusGroupId('date-picker');
  const previousTag = `${interactionId}:previous`;
  const nextTag = `${interactionId}:next`;
  const dayTag = `${interactionId}:day`;
  const todayTag = `${interactionId}:today`;
  const hoverTag = `${interactionId}:hover`;
  const leaveTag = `${interactionId}:leave`;
  const onSelect = config.onSelect;
  const todayAtCreation = getToday();
  const normalizeDate = (date: SimpleDate, fallback = todayAtCreation): SimpleDate => {
    const year = normalizeYear(date.year, fallback.year);
    const month = normalizeMonth(date.month, fallback.month);
    return { year, month, day: boundedInteger(date.day, fallback.day, 1, daysInMonth(year, month)) };
  };
  const initialSelected = config.selected ? normalizeDate({ ...config.selected }) : null;
  const normalizeModel = (model: DatePickerModel): DatePickerModel => {
    const viewYear = normalizeYear(model.viewYear, todayAtCreation.year);
    const viewMonth = normalizeMonth(model.viewMonth, todayAtCreation.month);
    const totalDays = daysInMonth(viewYear, viewMonth);
    const validHoverTargets = new Set(['previous', 'next', 'today', ...Array.from({ length: totalDays }, (_, index) => `day:${index + 1}`)]);
    return {
      viewYear,
      viewMonth,
      cursorDay: boundedInteger(model.cursorDay, 1, 1, totalDays),
      selected: model.selected ? normalizeDate(model.selected) : null,
      focused: Boolean(model.focused),
      hovered: model.hovered !== undefined && model.hovered !== null && validHoverTargets.has(model.hovered) ? model.hovered : null,
    };
  };

  const targetForElement = (elementId: string): string | null => {
    if (elementId === `${interactionId}:previous`) return 'previous';
    if (elementId === `${interactionId}:next`) return 'next';
    if (elementId === `${interactionId}:today`) return 'today';
    if (!elementId.startsWith(`${interactionId}:day:`)) return null;
    const day = Number(elementId.slice(`${interactionId}:day:`.length));
    return Number.isInteger(day) ? `day:${day}` : null;
  };

  return {
    init(): [DatePickerModel, Cmd<DatePickerMsg>] {
      const today = getToday();
      const sel = initialSelected;
      const viewYear = sel?.year ?? today.year;
      const viewMonth = sel?.month ?? today.month;
      const cursorDay = sel?.day ?? today.day;
      return [
        {
          viewYear,
          viewMonth,
          cursorDay: Math.min(cursorDay, daysInMonth(viewYear, viewMonth)),
          selected: sel,
          focused: false,
          hovered: null,
        },
        Cmd.none(),
      ];
    },

    update(msg: DatePickerMsg, unsafeModel: DatePickerModel): [DatePickerModel, Cmd<DatePickerMsg>] {
      const model = normalizeModel(unsafeModel);
      switch (msg.type) {
        case 'prev-month': {
          if (model.viewYear === MIN_CALENDAR_YEAR && model.viewMonth === 1) return [model, Cmd.none()];
          let m = model.viewMonth - 1;
          let y = model.viewYear;
          if (m < 1) {
            m = 12;
            y--;
          }
          const maxDay = daysInMonth(y, m);
          return [{ ...model, viewMonth: m, viewYear: y, cursorDay: Math.min(model.cursorDay, maxDay) }, Cmd.none()];
        }
        case 'next-month': {
          if (model.viewYear === MAX_CALENDAR_YEAR && model.viewMonth === 12) return [model, Cmd.none()];
          let m = model.viewMonth + 1;
          let y = model.viewYear;
          if (m > 12) {
            m = 1;
            y++;
          }
          const maxDay = daysInMonth(y, m);
          return [{ ...model, viewMonth: m, viewYear: y, cursorDay: Math.min(model.cursorDay, maxDay) }, Cmd.none()];
        }
        case 'prev-year': {
          const y = Math.max(MIN_CALENDAR_YEAR, model.viewYear - 1);
          const maxDay = daysInMonth(y, model.viewMonth);
          return [{ ...model, viewYear: y, cursorDay: Math.min(model.cursorDay, maxDay) }, Cmd.none()];
        }
        case 'next-year': {
          const y = Math.min(MAX_CALENDAR_YEAR, model.viewYear + 1);
          const maxDay = daysInMonth(y, model.viewMonth);
          return [{ ...model, viewYear: y, cursorDay: Math.min(model.cursorDay, maxDay) }, Cmd.none()];
        }
        case 'cursor-left': {
          if (model.cursorDay > 1) {
            return [{ ...model, cursorDay: model.cursorDay - 1 }, Cmd.none()];
          }
          if (model.viewYear === MIN_CALENDAR_YEAR && model.viewMonth === 1) return [model, Cmd.none()];
          // Wrap to previous month's last day
          let prevMonth = model.viewMonth - 1;
          let prevYear = model.viewYear;
          if (prevMonth < 1) {
            prevMonth = 12;
            prevYear--;
          }
          const prevMaxDay = daysInMonth(prevYear, prevMonth);
          return [{ ...model, viewMonth: prevMonth, viewYear: prevYear, cursorDay: prevMaxDay }, Cmd.none()];
        }
        case 'cursor-right': {
          const maxDay = daysInMonth(model.viewYear, model.viewMonth);
          if (model.cursorDay < maxDay) {
            return [{ ...model, cursorDay: model.cursorDay + 1 }, Cmd.none()];
          }
          if (model.viewYear === MAX_CALENDAR_YEAR && model.viewMonth === 12) return [model, Cmd.none()];
          // Wrap to next month's day 1
          let nextMonth = model.viewMonth + 1;
          let nextYear = model.viewYear;
          if (nextMonth > 12) {
            nextMonth = 1;
            nextYear++;
          }
          return [{ ...model, viewMonth: nextMonth, viewYear: nextYear, cursorDay: 1 }, Cmd.none()];
        }
        case 'cursor-up': {
          const nd = model.cursorDay - 7;
          if (nd >= 1) return [{ ...model, cursorDay: nd }, Cmd.none()];
          if (model.viewYear === MIN_CALENDAR_YEAR && model.viewMonth === 1) return [model, Cmd.none()];
          // Wrap to previous month
          let prevMonth = model.viewMonth - 1;
          let prevYear = model.viewYear;
          if (prevMonth < 1) {
            prevMonth = 12;
            prevYear--;
          }
          const prevMonthDays = daysInMonth(prevYear, prevMonth);
          const newDay = prevMonthDays + nd; // nd is negative or zero, so this gives the correct day
          return [{ ...model, viewMonth: prevMonth, viewYear: prevYear, cursorDay: newDay }, Cmd.none()];
        }
        case 'cursor-down': {
          const nd = model.cursorDay + 7;
          const maxDay = daysInMonth(model.viewYear, model.viewMonth);
          if (nd <= maxDay) return [{ ...model, cursorDay: nd }, Cmd.none()];
          if (model.viewYear === MAX_CALENDAR_YEAR && model.viewMonth === 12) return [model, Cmd.none()];
          // Wrap to next month
          let nextMonth = model.viewMonth + 1;
          let nextYear = model.viewYear;
          if (nextMonth > 12) {
            nextMonth = 1;
            nextYear++;
          }
          const newDay = nd - maxDay;
          return [{ ...model, viewMonth: nextMonth, viewYear: nextYear, cursorDay: newDay }, Cmd.none()];
        }
        case 'select': {
          const selected: SimpleDate = {
            year: model.viewYear,
            month: model.viewMonth,
            day: model.cursorDay,
          };
          onSelect?.(selected);
          return [{ ...model, selected }, Cmd.none()];
        }
        case 'select-day': {
          if (!Number.isInteger(msg.day) || msg.day < 1 || msg.day > daysInMonth(model.viewYear, model.viewMonth)) {
            return [unsafeModel, Cmd.none()];
          }
          const selected = { year: model.viewYear, month: model.viewMonth, day: msg.day };
          onSelect?.(selected);
          return [{ ...model, cursorDay: msg.day, selected, focused: true }, Cmd.none()];
        }
        case 'today': {
          const today = getToday();
          return [
            {
              ...model,
              viewYear: today.year,
              viewMonth: today.month,
              cursorDay: today.day,
            },
            Cmd.none(),
          ];
        }
        case 'hover':
          return normalizeModel({ ...model, hovered: msg.target }).hovered === msg.target
            ? [{ ...model, hovered: msg.target }, Cmd.none()]
            : [model, Cmd.none()];
        case 'leave':
          return model.hovered === msg.target ? [{ ...model, hovered: null }, Cmd.none()] : [model, Cmd.none()];
        case 'focus':
          return [{ ...model, focused: true }, Cmd.none()];
        case 'blur':
          return [{ ...model, focused: false }, Cmd.none()];
        case 'noop':
          return [unsafeModel, Cmd.none()];
      }
    },

    view(unsafeModel: DatePickerModel): VNode {
      const model = normalizeModel(unsafeModel);
      const tokens = useTokens(datePickerContract, config, 'DatePicker');

      const titleStyle = style({ bold: true, color: tokens.selected });
      const headerStyle = style({ dim: true, color: tokens.muted });
      const cursorStyle = style({ reverse: true, bold: true });
      const hoverStyle = style({ color: tokens.borderHover, reverse: true, bold: true });
      const selectedStyle = style({ color: tokens.selected, bold: true });
      const todayStyle = style({ color: tokens.selected });

      const title = formatMonthTitle(locale, model.viewYear, model.viewMonth);
      const dayHeader = formatWeekdayHeaders(locale, firstDow);

      const totalDays = daysInMonth(model.viewYear, model.viewMonth);
      let startDow = firstDayOfMonth(model.viewYear, model.viewMonth);
      if (firstDow === 1) {
        startDow = (startDow + 6) % 7;
      }

      const today = getToday();

      // Build simple calendar view: we render each week line as text,
      // but highlight cursor/selected/today by building per-day text nodes
      const calendarLines: VNode[] = [];
      let col = startDow;
      const dayNodes: VNode[][] = [];
      let currentWeek: VNode[] = [];

      // Add padding for the start of the first week
      if (startDow > 0) {
        currentWeek.push(text('   '.repeat(startDow)));
      }

      for (let d = 1; d <= totalDays; d++) {
        const dayStr = formatDayNumber(locale, d);
        const isToday = today.year === model.viewYear && today.month === model.viewMonth && today.day === d;
        const isSelected = model.selected !== null && isSameDay(model.selected, { year: model.viewYear, month: model.viewMonth, day: d });
        const isCursor = d === model.cursorDay && model.focused;
        const isHovered = model.hovered === `day:${d}`;

        const dayStyle = isCursor ? cursorStyle : isHovered ? hoverStyle : isSelected ? selectedStyle : isToday ? todayStyle : undefined;

        const dayNode = text(dayStr, dayStyle);
        setVNodeMeta(dayNode, {
          testId: `date-${model.viewYear}-${model.viewMonth}-${d}`,
          a11y: { role: 'button', label: `${title} ${d}`, checked: isSelected },
        });
        currentWeek.push(
          event(
            `${interactionId}:day:${d}`,
            dayNode,
            { onClick: dayTag, onMouseEnter: hoverTag, onMouseLeave: leaveTag },
            { label: `${title} ${d}`, intent: 'select', affordances: ['hover', 'click'], cursor: 'pointer', keyboardHint: 'Enter' },
          ),
        );
        col++;

        if (col === 7) {
          dayNodes.push(currentWeek);
          currentWeek = [];
          col = 0;
        } else if (d < totalDays) {
          currentWeek.push(text(' '));
        }
      }
      if (currentWeek.length > 0) {
        dayNodes.push(currentWeek);
      }

      for (const week of dayNodes) {
        calendarLines.push(row(...week));
      }

      const hintStyle = style({ dim: true, color: tokens.muted });
      const previousStyle = model.hovered === 'previous' ? hoverStyle : titleStyle;
      const nextStyle = model.hovered === 'next' ? hoverStyle : titleStyle;
      const titleNode = row(
        event(
          `${interactionId}:previous`,
          text('◀', previousStyle),
          { onClick: previousTag, onMouseEnter: hoverTag, onMouseLeave: leaveTag },
          { label: 'Previous month', intent: 'navigate', affordances: ['hover', 'click'], cursor: 'pointer' },
        ),
        text(` ${title} `, titleStyle),
        event(
          `${interactionId}:next`,
          text('▶', nextStyle),
          { onClick: nextTag, onMouseEnter: hoverTag, onMouseLeave: leaveTag },
          { label: 'Next month', intent: 'navigate', affordances: ['hover', 'click'], cursor: 'pointer' },
        ),
      );
      const todayNode = event(
        `${interactionId}:today`,
        text('[Today]', model.hovered === 'today' ? hoverStyle : hintStyle),
        { onClick: todayTag, onMouseEnter: hoverTag, onMouseLeave: leaveTag },
        { label: 'Today', intent: 'navigate', affordances: ['hover', 'click'], cursor: 'pointer', keyboardHint: 'T' },
      );
      return column(titleNode, text(dayHeader, headerStyle), ...calendarLines, text(''), row(text('[←→↑↓] navigate  [enter] select  ', hintStyle), todayNode));
    },

    subscriptions(unsafeModel: DatePickerModel): Sub<DatePickerMsg> {
      const model = normalizeModel(unsafeModel);
      const mouse = Sub.elementMouse<DatePickerMsg>((mouseEvent) => {
        if (!mouseEvent.elementId.startsWith(`${interactionId}:`)) return { type: 'noop' };
        const target = targetForElement(mouseEvent.elementId);
        if (mouseEvent.handlerTag === hoverTag && target !== null) return { type: 'hover', target };
        if (mouseEvent.handlerTag === leaveTag && target !== null) return { type: 'leave', target };
        if (mouseEvent.handlerTag === previousTag) return { type: 'prev-month' };
        if (mouseEvent.handlerTag === nextTag) return { type: 'next-month' };
        if (mouseEvent.handlerTag === todayTag) return { type: 'today' };
        if (mouseEvent.handlerTag === dayTag && mouseEvent.elementId.startsWith(`${interactionId}:day:`)) {
          return { type: 'select-day', day: Number(mouseEvent.elementId.slice(`${interactionId}:day:`.length)) };
        }
        return { type: 'noop' };
      });
      if (!model.focused) return mouse;
      return Sub.batch<DatePickerMsg>(
        mouse,
        Sub.key('left', { type: 'cursor-left' }),
        Sub.key('right', { type: 'cursor-right' }),
        Sub.key('up', { type: 'cursor-up' }),
        Sub.key('down', { type: 'cursor-down' }),
        Sub.key('enter', { type: 'select' }),
        Sub.key('t', { type: 'today' }),
        Sub.key('pageup', { type: 'prev-month' }),
        Sub.key('pagedown', { type: 'next-month' }),
        Sub.keyWithModifiers('pageup', { shift: true }, { type: 'prev-year' }),
        Sub.keyWithModifiers('pagedown', { shift: true }, { type: 'next-year' }),
      );
    },
  };
}

function formatMonthTitle(locale: ReturnType<typeof resolveLocale>, year: number, month: number): string {
  return locale.formatDate(new Date(Date.UTC(year, month - 1, 1)), {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function formatWeekdayHeaders(locale: ReturnType<typeof resolveLocale>, firstDayOfWeek: 0 | 1): string {
  const labels: string[] = [];

  for (let offset = 0; offset < 7; offset++) {
    const dayIndex = (firstDayOfWeek + offset) % 7;
    const dayLabel = locale
      .formatDate(new Date(WEEKDAY_REFERENCE_SUNDAY + dayIndex * 24 * 60 * 60 * 1000), {
        weekday: 'short',
        timeZone: 'UTC',
      })
      .replace(/\.$/u, '');

    labels.push(fitCalendarCell(dayLabel));
  }

  return labels.join(' ');
}

function formatDayNumber(locale: ReturnType<typeof resolveLocale>, day: number): string {
  return fitCalendarCell(
    locale.formatNumber(day, {
      minimumIntegerDigits: 2,
      useGrouping: false,
    }),
  );
}

function fitCalendarCell(value: string): string {
  const clipped = sliceTextByWidth(value, CALENDAR_CELL_WIDTH);
  const padding = Math.max(0, CALENDAR_CELL_WIDTH - measureTextWidth(clipped));
  return `${clipped}${' '.repeat(padding)}`;
}
