import { border, color, style } from '@celestial/core/corona';
import { box, column, text } from '@celestial/core/nebula';
import { createWorkspaceManager, saveWorkspace, splitH } from '@celestial/horizon';

/**
 * Horizon splits are plain VNodes: splitH tiles panes left-to-right and flex
 * sizes share the available width. createWorkspaceManager() takes no
 * arguments; saveWorkspace returns a new manager with the layout persisted.
 */
const pane = (title: string, lines: string[]) =>
  box(column(text(title, style({ bold: true, color: color.brightCyan })), ...lines.map((line) => text(line))), style({ border: border.square, borderColor: color.gray, padding: 1 }), { fit: 'fill' });

export const dashboard = column(
  splitH({
    gap: 1,
    panes: [
      { id: 'logs', size: 'flex', content: pane('Logs', ['[14:02:11] node started', '[14:02:12] subscribed runtime']) },
      { id: 'metrics', size: 'flex', content: pane('Metrics', ['CPU  ■■■■░░░░░░  40%', 'MEM  ■■■■■■░░░░  60%']) },
    ],
  }),
  text(' [Workspace 1: Default]  [Workspace 2: Monitoring]', style({ dim: true, color: color.gray })),
);

export const workspaces = saveWorkspace(createWorkspaceManager(), { name: 'Monitoring', layout: dashboard });
