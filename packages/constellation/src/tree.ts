import type { Color, SemanticTheme, ThemeInput, TokenContract, TypographyToken } from '@celestial/core/corona';
import { style } from '@celestial/core/corona';
import type { Msg, ThemeContext, VNode } from '@celestial/core/nebula';
import { Cmd, column, event, row, Sub, setVNodeMeta, text } from '@celestial/core/nebula';
import { generateFocusGroupId } from './focus-group.js';
import { useTokens } from './theme.js';
import type { ComponentDescriptor } from './types.js';

// ─── Token contract ─────────────────────────────────────────────────────────

export interface TreeTokens {
  text: Color;
  textSoft: Color;
  expanded: Color;
  collapsed: Color;
  connector: Color;
  labelStyle: TypographyToken;
}

export const treeContract: TokenContract<TreeTokens> = {
  text: (t: SemanticTheme) => t.colors.text,
  textSoft: (t: SemanticTheme) => t.colors.textSoft,
  expanded: (t: SemanticTheme) => t.colors.tones.accent,
  collapsed: (t: SemanticTheme) => t.colors.textSoft,
  connector: (t: SemanticTheme) => t.colors.divider,
  labelStyle: (t: SemanticTheme) => t.typography.label,
};

export interface TreeNode {
  label: string;
  key: string;
  children?: TreeNode[];
}
export interface TreeConfig {
  nodes: TreeNode[];
  onSelect?: (key: string) => void;
  focused?: boolean;
  themeCtx?: ThemeContext;
  theme?: ThemeInput;
}
export interface TreeNodeInfo {
  node: TreeNode;
  depth: number;
  isLast: boolean;
}
export interface TreeModel {
  expanded: Set<string>;
  selected: string | null;
  flatKeys: string[];
  cursor: number;
  nodeMap: Map<string, TreeNodeInfo>;
  focused: boolean;
  hoveredIndex?: number | null;
}
export type TreeMsg =
  | Msg<'toggle'>
  | Msg<'toggle-at', { index: number }>
  | Msg<'up'>
  | Msg<'down'>
  | Msg<'select'>
  | Msg<'activate', { index: number }>
  | Msg<'hover-at', { index: number }>
  | Msg<'leave'>
  | Msg<'focus'>
  | Msg<'blur'>
  | Msg<'noop'>;

const MAX_TREE_NODES = 100_000;
const MAX_TREE_DEPTH = 64;

function snapshotTree(nodes: readonly TreeNode[]): TreeNode[] {
  const keys = new Set<string>();
  const path = new Set<TreeNode>();
  let count = 0;

  const visit = (list: readonly TreeNode[], depth: number): TreeNode[] => {
    if (depth > MAX_TREE_DEPTH) throw new Error(`Tree depth exceeds the supported limit of ${MAX_TREE_DEPTH}.`);
    const result: TreeNode[] = [];
    for (const node of list) {
      if (count >= MAX_TREE_NODES) throw new Error(`Tree contains more than ${MAX_TREE_NODES} nodes.`);
      if (path.has(node)) throw new Error('Tree nodes must not contain cycles.');
      if (keys.has(node.key)) throw new Error(`Tree node keys must be unique; received duplicate key "${node.key}".`);
      count++;
      keys.add(node.key);
      path.add(node);
      const children = node.children ? visit(node.children, depth + 1) : undefined;
      path.delete(node);
      result.push({ label: node.label, key: node.key, ...(children && children.length > 0 ? { children } : {}) });
    }
    return result;
  };

  return visit(nodes, 0);
}

function flattenVisible(nodes: TreeNode[], expanded: Set<string>): { keys: string[]; nodeMap: Map<string, TreeNodeInfo> } {
  const keys: string[] = [];
  const nodeMap = new Map<string, TreeNodeInfo>();
  const walk = (list: TreeNode[], depth: number) => {
    for (let i = 0; i < list.length; i++) {
      const n = list[i]!;
      const last = i === list.length - 1;
      keys.push(n.key);
      nodeMap.set(n.key, { node: n, depth, isLast: last });
      if (n.children && expanded.has(n.key)) walk(n.children, depth + 1);
    }
  };
  walk(nodes, 0);
  return { keys, nodeMap };
}

export function tree(config: TreeConfig): ComponentDescriptor<TreeModel, TreeMsg> {
  const nodes = snapshotTree(config.nodes);
  const allTreeKeys = new Set<string>();
  const collectKeys = (list: readonly TreeNode[]) => {
    for (const node of list) {
      allTreeKeys.add(node.key);
      if (node.children) collectKeys(node.children);
    }
  };
  collectKeys(nodes);
  const interactionId = generateFocusGroupId('tree');
  const selectTag = `${interactionId}:select`;
  const toggleTag = `${interactionId}:toggle`;
  const hoverTag = `${interactionId}:hover`;
  const leaveTag = `${interactionId}:leave`;

  const normalizeState = (model: TreeModel): TreeModel => {
    const expanded =
      model.expanded instanceof Set
        ? new Set([...model.expanded].filter((key): key is string => typeof key === 'string' && allTreeKeys.has(key)))
        : new Set<string>();
    const { keys, nodeMap } = flattenVisible(nodes, expanded);
    const cursor = Number.isFinite(model.cursor) ? Math.max(0, Math.min(Math.max(0, keys.length - 1), Math.trunc(model.cursor))) : 0;
    const selected = typeof model.selected === 'string' && allTreeKeys.has(model.selected) ? model.selected : null;
    const hoveredIndex =
      model.hoveredIndex !== null && model.hoveredIndex !== undefined && Number.isFinite(model.hoveredIndex)
        ? Math.max(0, Math.min(Math.max(0, keys.length - 1), Math.trunc(model.hoveredIndex)))
        : null;
    return { ...model, expanded, selected, flatKeys: keys, cursor, nodeMap, hoveredIndex };
  };
  return {
    init(): [TreeModel, Cmd<TreeMsg>] {
      const { keys, nodeMap } = flattenVisible(nodes, new Set());
      return [{ expanded: new Set(), selected: null, flatKeys: keys, cursor: 0, nodeMap, focused: config.focused ?? false }, Cmd.none()];
    },
    update(msg: TreeMsg, model: TreeModel): [TreeModel, Cmd<TreeMsg>] {
      model = normalizeState(model);
      switch (msg.type) {
        case 'toggle': {
          const k = model.flatKeys[model.cursor];
          if (!k) return [model, Cmd.none()];
          const info = model.nodeMap.get(k);
          if (!info?.node.children?.length) return [model, Cmd.none()];
          const exp = new Set(model.expanded);
          exp.has(k) ? exp.delete(k) : exp.add(k);
          const { keys, nodeMap } = flattenVisible(nodes, exp);
          return [{ ...model, expanded: exp, flatKeys: keys, nodeMap, cursor: keys.indexOf(k) }, Cmd.none()];
        }
        case 'toggle-at': {
          if (!Number.isInteger(msg.index)) return [model, Cmd.none()];
          const k = model.flatKeys[msg.index];
          if (!k) return [model, Cmd.none()];
          const info = model.nodeMap.get(k);
          if (!info?.node.children?.length) return [{ ...model, cursor: msg.index, focused: true }, Cmd.none()];
          const exp = new Set(model.expanded);
          exp.has(k) ? exp.delete(k) : exp.add(k);
          const { keys, nodeMap } = flattenVisible(nodes, exp);
          return [{ ...model, expanded: exp, flatKeys: keys, nodeMap, cursor: keys.indexOf(k), focused: true }, Cmd.none()];
        }
        case 'up':
          return [{ ...model, cursor: Math.max(0, model.cursor - 1) }, Cmd.none()];
        case 'down':
          return [{ ...model, cursor: Math.max(0, Math.min(model.flatKeys.length - 1, model.cursor + 1)) }, Cmd.none()];
        case 'select': {
          const k = model.flatKeys[model.cursor];
          if (k) {
            config.onSelect?.(k);
            return [{ ...model, selected: k }, Cmd.none()];
          }
          return [model, Cmd.none()];
        }
        case 'activate': {
          if (!Number.isInteger(msg.index)) return [model, Cmd.none()];
          const k = model.flatKeys[msg.index];
          if (!k) return [model, Cmd.none()];
          config.onSelect?.(k);
          return [{ ...model, cursor: msg.index, selected: k, focused: true }, Cmd.none()];
        }
        case 'hover-at':
          return Number.isInteger(msg.index) && model.flatKeys[msg.index] ? [{ ...model, hoveredIndex: msg.index }, Cmd.none()] : [model, Cmd.none()];
        case 'leave':
          return [{ ...model, hoveredIndex: null }, Cmd.none()];
        case 'focus':
          return [{ ...model, focused: true }, Cmd.none()];
        case 'blur':
          return [{ ...model, focused: false }, Cmd.none()];
        case 'noop':
          return [model, Cmd.none()];
      }
    },
    view(model: TreeModel): VNode {
      model = normalizeState(model);
      const tokens = useTokens(treeContract, config, 'Tree');
      const hlStyle = style({ color: tokens.expanded, bold: true });
      const selStyle = style({ color: tokens.expanded });
      const connStyle = style({ color: tokens.connector });
      const lines = model.flatKeys.map((key, i) => {
        const info = model.nodeMap.get(key);
        const n = info?.node;
        const depth = info?.depth ?? 0;
        const last = info?.isLast ?? false;
        const hasCh = (n?.children?.length ?? 0) > 0;
        const indentStr = depth > 0 ? '  '.repeat(depth - 1) + (last ? '└── ' : '├── ') : '';
        const icon = hasCh ? (model.expanded.has(key) ? '▼ ' : '▶ ') : '  ';
        const isHovered = i === model.hoveredIndex;
        const s = isHovered
          ? style({ color: tokens.expanded, bold: true, reverse: true })
          : i === model.cursor
            ? hlStyle
            : key === model.selected
              ? selStyle
              : undefined;
        const cursor = i === model.cursor || isHovered ? '▸ ' : '  ';
        const parts: VNode[] = [text(cursor, s)];
        if (indentStr) parts.push(text(indentStr, connStyle));
        parts.push(
          hasCh
            ? event(
                `${interactionId}:toggle:${i}`,
                text(icon, s),
                { onClick: toggleTag, onMouseEnter: hoverTag, onMouseLeave: leaveTag },
                {
                  label: `${model.expanded.has(key) ? 'Collapse' : 'Expand'} ${n?.label ?? key}`,
                  intent: 'toggle',
                  affordances: ['hover', 'click'],
                  cursor: 'pointer',
                  keyboardHint: 'Space',
                },
              )
            : text(icon, s),
        );
        const labelNode = event(
          `${interactionId}:select:${i}`,
          text(n?.label ?? key, s),
          { onClick: selectTag, onMouseEnter: hoverTag, onMouseLeave: leaveTag },
          { label: n?.label ?? key, intent: 'select', affordances: ['hover', 'click'], cursor: 'pointer', keyboardHint: 'Enter' },
        );
        setVNodeMeta(labelNode, { a11y: { role: 'treeitem', label: n?.label ?? key, selected: key === model.selected } });
        parts.push(labelNode);
        return row(...parts);
      });
      return column(...lines);
    },
    subscriptions(model: TreeModel): Sub<TreeMsg> {
      const mouse = Sub.elementMouse<TreeMsg>((mouseEvent) => {
        if (mouseEvent.handlerTag === toggleTag && mouseEvent.elementId.startsWith(`${interactionId}:toggle:`)) {
          return { type: 'toggle-at', index: Number(mouseEvent.elementId.slice(`${interactionId}:toggle:`.length)) };
        }
        if (mouseEvent.handlerTag === selectTag && mouseEvent.elementId.startsWith(`${interactionId}:select:`)) {
          return { type: 'activate', index: Number(mouseEvent.elementId.slice(`${interactionId}:select:`.length)) };
        }
        if (mouseEvent.handlerTag === hoverTag) {
          const marker = mouseEvent.elementId.includes(':toggle:') ? `${interactionId}:toggle:` : `${interactionId}:select:`;
          if (mouseEvent.elementId.startsWith(marker)) return { type: 'hover-at', index: Number(mouseEvent.elementId.slice(marker.length)) };
        }
        if (mouseEvent.handlerTag === leaveTag) return { type: 'leave' };
        return { type: 'noop' };
      });
      if (!model.focused) return mouse;
      return Sub.batch<TreeMsg>(
        mouse,
        Sub.key('up', { type: 'up' }),
        Sub.key('down', { type: 'down' }),
        Sub.key('enter', { type: 'select' }),
        Sub.key('space', { type: 'toggle' }),
      );
    },
  };
}
