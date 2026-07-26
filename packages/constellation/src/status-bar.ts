/**
 * A single-line, three-zone application status surface.
 *
 * The center zone stays anchored to terminal-cell geometry while the left and
 * right zones are clipped independently. This prevents a long receipt or a
 * wide grapheme from shifting the title or overflowing the viewport.
 */

import type { Color, SemanticTheme, Style, ThemeInput, TokenContract } from '@celestial/core/corona';
import { style } from '@celestial/core/corona';
import type { ThemeContext, VNode } from '@celestial/core/nebula';
import { Cmd, row, setVNodeMeta, Sub, text } from '@celestial/core/nebula';
import { measureTextWidth, sliceTextByWidth } from '@celestial/rosetta';
import { positiveInteger } from './internal.js';
import { useTokens } from './theme.js';
import type { ComponentDescriptor } from './types.js';

const DEFAULT_STATUS_BAR_WIDTH = 80;
const TERMINAL_CONTROL = /[\u0000-\u001f\u007f-\u009f]/u;

export interface StatusBarTokens {
  text: Color;
  muted: Color;
  background: Color;
  modeText: Color;
  modeBackground: Color;
}

export const statusBarContract: TokenContract<StatusBarTokens> = {
  text: (theme: SemanticTheme) => theme.colors.text,
  muted: (theme: SemanticTheme) => theme.colors.textSoft,
  background: (theme: SemanticTheme) => theme.colors.surfaceAlt,
  modeText: (theme: SemanticTheme) => theme.states.selected.fg,
  modeBackground: (theme: SemanticTheme) => theme.states.selected.bg ?? theme.colors.surfaceRaised,
};

export interface StatusBarSection {
  readonly text: string;
  readonly bold?: boolean;
  /** Render the section as a high-emphasis application mode. */
  readonly mode?: boolean;
}

export interface StatusBarConfig {
  readonly width?: number;
  readonly left?: readonly StatusBarSection[];
  readonly center?: readonly StatusBarSection[];
  readonly right?: readonly StatusBarSection[];
  readonly themeCtx?: ThemeContext;
  readonly theme?: ThemeInput;
}

export interface StatusBarModel {
  readonly left: readonly StatusBarSection[];
  readonly center: readonly StatusBarSection[];
  readonly right: readonly StatusBarSection[];
  readonly width: number;
}

export type StatusBarMsg =
  | { readonly type: 'update-left'; readonly sections: readonly StatusBarSection[] }
  | { readonly type: 'update-center'; readonly sections: readonly StatusBarSection[] }
  | { readonly type: 'update-right'; readonly sections: readonly StatusBarSection[] }
  | { readonly type: 'resize'; readonly width: number };

interface StatusSegment {
  readonly content: string;
  readonly style: Style;
}

function snapshotSections(sections: readonly StatusBarSection[] | undefined, zone: string): readonly StatusBarSection[] {
  return (sections ?? []).map((section, index) => {
    if (typeof section.text !== 'string') {
      throw new TypeError(`Status bar ${zone} section ${index + 1} requires string text.`);
    }
    if (TERMINAL_CONTROL.test(section.text)) {
      throw new TypeError(`Status bar ${zone} section ${index + 1} must be single-line printable text.`);
    }
    return {
      text: section.text,
      ...(section.bold === undefined ? {} : { bold: section.bold }),
      ...(section.mode === undefined ? {} : { mode: section.mode }),
    };
  });
}

function segmentsWidth(segments: readonly StatusSegment[]): number {
  return segments.reduce((total, segment) => total + measureTextWidth(segment.content), 0);
}

function clipSegments(segments: readonly StatusSegment[], maxWidth: number, ellipsisStyle: Style): StatusSegment[] {
  if (maxWidth <= 0) return [];
  if (segmentsWidth(segments) <= maxWidth) return [...segments];

  const clipped: StatusSegment[] = [];
  let remaining = Math.max(0, maxWidth - 1);
  for (const segment of segments) {
    if (remaining <= 0) break;
    const content = sliceTextByWidth(segment.content, remaining);
    if (content.length > 0) {
      clipped.push({ content, style: segment.style });
      remaining -= measureTextWidth(content);
    }
    if (measureTextWidth(content) < measureTextWidth(segment.content)) break;
  }
  clipped.push({ content: '…', style: ellipsisStyle });
  return clipped;
}

function renderSections(
  sections: readonly StatusBarSection[],
  styles: { readonly normal: Style; readonly bold: Style; readonly mode: Style },
): StatusSegment[] {
  const segments: StatusSegment[] = [];
  sections.forEach((section, index) => {
    if (index > 0) segments.push({ content: ' ', style: styles.normal });
    if (section.mode) {
      segments.push({ content: ` ${section.text} `, style: styles.mode });
    } else {
      segments.push({ content: section.text, style: section.bold ? styles.bold : styles.normal });
    }
  });
  return segments;
}

function pushGap(nodes: VNode[], width: number, gapStyle: Style): void {
  if (width > 0) nodes.push(text(' '.repeat(width), gapStyle));
}

function accessibleLabel(model: StatusBarModel): string {
  const content = [...model.left, ...model.center, ...model.right]
    .map((section) => section.text.trim())
    .filter((section) => section.length > 0)
    .join(', ');
  return content.length > 0 ? `Status: ${content}` : 'Status bar';
}

export function statusBar(config: StatusBarConfig): ComponentDescriptor<StatusBarModel, StatusBarMsg> {
  const initialWidth = positiveInteger(config.width, DEFAULT_STATUS_BAR_WIDTH);
  const initialLeft = snapshotSections(config.left, 'left');
  const initialCenter = snapshotSections(config.center, 'center');
  const initialRight = snapshotSections(config.right, 'right');

  return {
    init(): [StatusBarModel, Cmd<StatusBarMsg>] {
      return [
        {
          left: initialLeft,
          center: initialCenter,
          right: initialRight,
          width: initialWidth,
        },
        Cmd.none(),
      ];
    },

    update(msg: StatusBarMsg, model: StatusBarModel): [StatusBarModel, Cmd<StatusBarMsg>] {
      switch (msg.type) {
        case 'update-left':
          return [{ ...model, left: snapshotSections(msg.sections, 'left') }, Cmd.none()];
        case 'update-center':
          return [{ ...model, center: snapshotSections(msg.sections, 'center') }, Cmd.none()];
        case 'update-right':
          return [{ ...model, right: snapshotSections(msg.sections, 'right') }, Cmd.none()];
        case 'resize':
          return [{ ...model, width: positiveInteger(msg.width, positiveInteger(model.width, initialWidth)) }, Cmd.none()];
      }
    },

    view(model: StatusBarModel): VNode {
      const tokens = useTokens(statusBarContract, config, 'StatusBar');
      const width = positiveInteger(model.width, initialWidth);
      const normal = style({ color: tokens.text, background: tokens.background });
      const bold = style({ color: tokens.text, background: tokens.background, bold: true });
      const mode = style({ color: tokens.modeText, background: tokens.modeBackground, bold: true });
      const muted = style({ color: tokens.muted, background: tokens.background });
      const zoneStyles = { normal, bold, mode };

      const leftSource = renderSections(snapshotSections(model.left, 'left'), zoneStyles);
      const centerSource = renderSections(snapshotSections(model.center, 'center'), zoneStyles);
      const rightSource = renderSections(snapshotSections(model.right, 'right'), zoneStyles);

      const center = clipSegments(centerSource, width, muted);
      const centerWidth = segmentsWidth(center);
      const centerStart = centerWidth > 0 ? Math.floor((width - centerWidth) / 2) : 0;
      const centerEnd = centerStart + centerWidth;

      let leftBudget: number;
      let rightBudget: number;
      if (centerWidth > 0) {
        leftBudget = centerStart;
        rightBudget = Math.max(0, width - centerEnd);
      } else {
        const hasLeft = leftSource.length > 0;
        const hasRight = rightSource.length > 0;
        rightBudget = hasLeft && hasRight ? Math.floor(width / 2) : width;
        leftBudget = width;
      }

      const right = clipSegments(rightSource, rightBudget, muted);
      const rightWidth = segmentsWidth(right);
      const rightStart = width - rightWidth;
      if (centerWidth === 0) leftBudget = Math.max(0, rightStart);
      const left = clipSegments(leftSource, leftBudget, muted);
      const leftWidth = segmentsWidth(left);

      const nodes: VNode[] = left.map((segment) => text(segment.content, segment.style));
      if (centerWidth > 0) {
        pushGap(nodes, centerStart - leftWidth, normal);
        nodes.push(...center.map((segment) => text(segment.content, segment.style)));
        pushGap(nodes, rightStart - centerEnd, normal);
      } else {
        pushGap(nodes, rightStart - leftWidth, normal);
      }
      nodes.push(...right.map((segment) => text(segment.content, segment.style)));

      const occupied = leftWidth + (centerWidth > 0 ? centerWidth : 0) + rightWidth;
      const expectedGaps = width - occupied;
      if (nodes.length === 0 && expectedGaps > 0) pushGap(nodes, expectedGaps, normal);

      const view = row(...nodes);
      setVNodeMeta(view, {
        testId: 'status-bar',
        a11y: { role: 'status', label: accessibleLabel(model) },
      });
      return view;
    },

    subscriptions(): Sub<StatusBarMsg> {
      return Sub.resize((width) => ({ type: 'resize', width }));
    },
  };
}
