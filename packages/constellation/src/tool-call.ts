import { border, color, style } from '@celestial/corona';
import { box, column, event, row, text, type VNode } from '@celestial/nebula';

export type ToolStatus = 'pending' | 'running' | 'success' | 'error';

export interface ToolCallConfig {
  name: string;
  status: ToolStatus;
  input?: string | Record<string, any>;
  output?: string;
  durationMs?: number;
  collapsed?: boolean;
  onToggle?: () => void;
  width?: number;
}

const statusGlyphs: Record<ToolStatus, string> = {
  pending: '⏳',
  running: '⠋',
  success: '✔',
  error: '✖',
};

const statusColors: Record<ToolStatus, any> = {
  pending: color.brightYellow,
  running: color.brightCyan,
  success: color.brightGreen,
  error: color.brightRed,
};

let toolCallId = 0;

/**
 * High-polish AI tool execution card component.
 * Renders tool calls (e.g., bash, search, file edit) with status indicators,
 * execution timing, and collapsible input/output previews.
 */
export function toolCall(config: ToolCallConfig): VNode {
  const isCollapsed = config.collapsed ?? false;
  const statusColor = statusColors[config.status];
  const glyph = statusGlyphs[config.status];
  const durationText = config.durationMs !== undefined ? ` (${(config.durationMs / 1000).toFixed(2)}s)` : '';

  const headerLeft = row(
    text(`${glyph} `, style({ color: statusColor, bold: true })),
    text(config.name, style({ bold: true, color: color.brightWhite })),
    text(durationText, style({ dim: true, color: color.gray })),
  );

  const toggleText = isCollapsed ? '▶ expand' : '▼ collapse';
  const headerRight = text(toggleText, style({ dim: true, color: color.gray }));

  const headerRow = row(headerLeft, text('  '), headerRight);

  const cardStyle = style({
    border: border.rounded,
    borderColor: statusColor,
    padding: 1,
    width: config.width,
  });

  if (isCollapsed) {
    const card = box(headerRow, cardStyle);
    return config.onToggle ? event(`tool-toggle-${++toolCallId}`, card, { onClick: 'toggle-tool' }) : card;
  }

  const items: VNode[] = [headerRow];

  // Input section
  if (config.input !== undefined) {
    const formattedInput =
      typeof config.input === 'string'
        ? config.input
        : JSON.stringify(config.input, null, 2);

    items.push(text(''));
    items.push(text('Input:', style({ bold: true, dim: true })));
    for (const line of formattedInput.split('\n').slice(0, 10)) {
      items.push(text(`  ${line}`, style({ color: color.gray })));
    }
  }

  // Output section
  if (config.output !== undefined) {
    items.push(text(''));
    items.push(text('Output:', style({ bold: true, dim: true })));
    const outLines = config.output.split('\n');
    for (const line of outLines.slice(0, 15)) {
      items.push(text(`  ${line}`, style({ color: config.status === 'error' ? color.brightRed : color.white })));
    }
    if (outLines.length > 15) {
      items.push(text(`  ... (${outLines.length - 15} more lines)`, style({ dim: true })));
    }
  }

  const card = box(column(...items), cardStyle);
  return config.onToggle ? event(`tool-toggle-${++toolCallId}`, card, { onClick: 'toggle-tool' }) : card;
}
