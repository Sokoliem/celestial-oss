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
import { Cmd, row, Sub, setVNodeMeta, text } from '@celestial/core/nebula';
import { measureTextWidth, sliceTextByWidth } from '@celestial/rosetta';
import { positiveInteger } from './internal.js';
import { useTokens } from './theme.js';
import type { ComponentDescriptor } from './types.js';

const DEFAULT_STATUS_BAR_WIDTH = 80;
const UNSAFE_SINGLE_LINE_TEXT = /[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u2028-\u202e\u2066-\u2069\uD800-\uDFFF]/u;
const MAX_DIAGNOSTIC_QUOTE_LENGTH = 1_024;

function boundedDiagnosticQuote(input: string): string {
  let output = '"';
  let truncated = false;
  for (let index = 0; index < input.length; index += 1) {
    const code = input.charCodeAt(index);
    const next = input.charCodeAt(index + 1);
    let chunk: string;
    if (code >= 0xd800 && code <= 0xdbff && next >= 0xdc00 && next <= 0xdfff) {
      chunk = input.slice(index, index + 2);
      index += 1;
    } else if (
      code <= 0x1f ||
      (code >= 0x7f && code <= 0x9f) ||
      code === 0x061c ||
      code === 0x200e ||
      code === 0x200f ||
      (code >= 0x2028 && code <= 0x202e) ||
      (code >= 0x2066 && code <= 0x2069) ||
      (code >= 0xd800 && code <= 0xdfff)
    ) {
      chunk = `\\u${code.toString(16).padStart(4, '0')}`;
    } else if (code === 0x22) {
      chunk = '\\"';
    } else if (code === 0x5c) {
      chunk = '\\\\';
    } else {
      chunk = input[index]!;
    }
    if (output.length + chunk.length > MAX_DIAGNOSTIC_QUOTE_LENGTH - 2) {
      truncated = true;
      break;
    }
    output += chunk;
  }
  return `${output}${truncated ? '…' : ''}"`;
}

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

function ownDataValue(value: object, field: string, label: string, required = false): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(value, field);
  if (descriptor === undefined) {
    if (required) throw new TypeError(`${label} requires own data property ${field}.`);
    return undefined;
  }
  if (!('value' in descriptor)) {
    throw new TypeError(`${label} ${field} must be an own data property.`);
  }
  return descriptor.value;
}

function snapshotSections(sections: readonly StatusBarSection[] | undefined, zone: string): readonly StatusBarSection[] {
  if (sections === undefined) return Object.freeze([]);
  if (!Array.isArray(sections)) {
    throw new TypeError(`Status bar ${zone} sections must be an array.`);
  }
  const lengthDescriptor = Object.getOwnPropertyDescriptor(sections, 'length');
  const length = lengthDescriptor !== undefined && 'value' in lengthDescriptor ? lengthDescriptor.value : undefined;
  if (typeof length !== 'number' || !Number.isSafeInteger(length) || length < 0 || length > 10_000) {
    throw new RangeError(`Status bar ${zone} sections must contain at most 10000 entries.`);
  }

  const snapshots: StatusBarSection[] = [];
  for (let index = 0; index < length; index += 1) {
    const entryDescriptor = Object.getOwnPropertyDescriptor(sections, String(index));
    if (entryDescriptor === undefined) {
      throw new TypeError(`Status bar ${zone} sections must be dense; index ${String(index)} is missing.`);
    }
    if (!('value' in entryDescriptor)) {
      throw new TypeError(`Status bar ${zone} section ${index + 1} must be an own data property.`);
    }
    const section = entryDescriptor.value as unknown;
    if (section === null || typeof section !== 'object' || Array.isArray(section)) {
      throw new TypeError(`Status bar ${zone} section ${index + 1} must be an object.`);
    }
    const label = `Status bar ${zone} section ${index + 1}`;
    const textValue = ownDataValue(section, 'text', label, true);
    const boldValue = ownDataValue(section, 'bold', label);
    const modeValue = ownDataValue(section, 'mode', label);
    if (typeof textValue !== 'string') {
      throw new TypeError(`Status bar ${zone} section ${index + 1} requires string text.`);
    }
    if (UNSAFE_SINGLE_LINE_TEXT.test(textValue)) {
      throw new TypeError(`Status bar ${zone} section ${index + 1} must be single-line printable text.`);
    }
    if (boldValue !== undefined && typeof boldValue !== 'boolean') {
      throw new TypeError(`Status bar ${zone} section ${index + 1} bold must be boolean when supplied.`);
    }
    if (modeValue !== undefined && typeof modeValue !== 'boolean') {
      throw new TypeError(`Status bar ${zone} section ${index + 1} mode must be boolean when supplied.`);
    }
    snapshots.push(
      Object.freeze({
        text: textValue,
        ...(boldValue === undefined ? {} : { bold: boldValue }),
        ...(modeValue === undefined ? {} : { mode: modeValue }),
      }),
    );
  }
  return Object.freeze(snapshots);
}

function snapshotConfig(value: StatusBarConfig): StatusBarConfig {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('Status bar config must be an object.');
  }
  const width = ownDataValue(value, 'width', 'Status bar config');
  const left = ownDataValue(value, 'left', 'Status bar config');
  const center = ownDataValue(value, 'center', 'Status bar config');
  const right = ownDataValue(value, 'right', 'Status bar config');
  const themeCtx = ownDataValue(value, 'themeCtx', 'Status bar config');
  const theme = ownDataValue(value, 'theme', 'Status bar config');
  return Object.freeze({
    ...(width === undefined ? {} : { width: width as number }),
    ...(left === undefined ? {} : { left: left as readonly StatusBarSection[] }),
    ...(center === undefined ? {} : { center: center as readonly StatusBarSection[] }),
    ...(right === undefined ? {} : { right: right as readonly StatusBarSection[] }),
    ...(themeCtx === undefined ? {} : { themeCtx: themeCtx as ThemeContext }),
    ...(theme === undefined ? {} : { theme: theme as ThemeInput }),
  });
}

function snapshotModel(value: StatusBarModel, fallbackWidth: number): StatusBarModel {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('Status bar model must be an object.');
  }
  const left = ownDataValue(value, 'left', 'Status bar model', true);
  const center = ownDataValue(value, 'center', 'Status bar model', true);
  const right = ownDataValue(value, 'right', 'Status bar model', true);
  const width = ownDataValue(value, 'width', 'Status bar model', true);
  return Object.freeze({
    left: snapshotSections(left as readonly StatusBarSection[], 'left'),
    center: snapshotSections(center as readonly StatusBarSection[], 'center'),
    right: snapshotSections(right as readonly StatusBarSection[], 'right'),
    width: positiveInteger(width as number, fallbackWidth),
  });
}

function snapshotMessage(value: StatusBarMsg): StatusBarMsg {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('Status bar message must be an object.');
  }
  const type = ownDataValue(value, 'type', 'Status bar message', true);
  if (typeof type !== 'string') {
    throw new TypeError('Status bar message type must be a string.');
  }
  if (type === 'resize') {
    return Object.freeze({
      type,
      width: ownDataValue(value, 'width', 'Status bar message', true) as number,
    });
  }
  if (type === 'update-left' || type === 'update-center' || type === 'update-right') {
    return Object.freeze({
      type,
      sections: ownDataValue(value, 'sections', 'Status bar message', true) as readonly StatusBarSection[],
    });
  }
  throw new TypeError(`Unknown status bar message type ${boundedDiagnosticQuote(type)}.`);
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
  config = snapshotConfig(config);
  const initialWidth = positiveInteger(config.width, DEFAULT_STATUS_BAR_WIDTH);
  const initialLeft = snapshotSections(config.left, 'left');
  const initialCenter = snapshotSections(config.center, 'center');
  const initialRight = snapshotSections(config.right, 'right');

  return {
    init(): [StatusBarModel, Cmd<StatusBarMsg>] {
      return [
        Object.freeze({
          left: initialLeft,
          center: initialCenter,
          right: initialRight,
          width: initialWidth,
        }),
        Cmd.none(),
      ];
    },

    update(msg: StatusBarMsg, model: StatusBarModel): [StatusBarModel, Cmd<StatusBarMsg>] {
      msg = snapshotMessage(msg);
      model = snapshotModel(model, initialWidth);
      switch (msg.type) {
        case 'update-left':
          return [
            Object.freeze({
              left: snapshotSections(msg.sections, 'left'),
              center: model.center,
              right: model.right,
              width: model.width,
            }),
            Cmd.none(),
          ];
        case 'update-center':
          return [
            Object.freeze({
              left: model.left,
              center: snapshotSections(msg.sections, 'center'),
              right: model.right,
              width: model.width,
            }),
            Cmd.none(),
          ];
        case 'update-right':
          return [
            Object.freeze({
              left: model.left,
              center: model.center,
              right: snapshotSections(msg.sections, 'right'),
              width: model.width,
            }),
            Cmd.none(),
          ];
        case 'resize':
          return [
            Object.freeze({
              left: model.left,
              center: model.center,
              right: model.right,
              width: positiveInteger(msg.width, model.width),
            }),
            Cmd.none(),
          ];
      }
    },

    view(model: StatusBarModel): VNode {
      model = snapshotModel(model, initialWidth);
      const tokens = useTokens(statusBarContract, config, 'StatusBar');
      const width = model.width;
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
