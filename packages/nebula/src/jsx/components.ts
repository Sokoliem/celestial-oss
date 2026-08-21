import { type Border, border, color, style as createStyle, type Style, type StyleProps } from '@celestial/corona';
import { box, column, columnWithGap, empty, event, focus, row, rowWithGap, scroll, text } from '../elements.js';
import type { EventHandlers, MouseHandler, VNode } from '../vdom.js';
import type {
  BadgeProps,
  BoxProps,
  ButtonProps,
  CardProps,
  Child,
  ColumnProps,
  DividerProps,
  FocusProps,
  ProgressBarProps,
  RowProps,
  ScrollProps,
  SpinnerProps,
  TextInputProps,
  TextProps,
} from './types.js';

/**
 * Render a mouse handler descriptor to a stable string. Event region ids are
 * derived from these tags so the same props always produce the same id across
 * renders — no render-time counters.
 */
function handlerTag(handler: MouseHandler | string | undefined): string | undefined {
  if (typeof handler === 'string') return handler;
  if (handler && typeof handler === 'object') {
    const parts = ['default', 'shift', 'ctrl', 'alt', 'shiftCtrl', 'shiftAlt', 'ctrlAlt', 'shiftCtrlAlt']
      .map((key) => (handler as Record<string, string | undefined>)[key])
      .filter((v): v is string => typeof v === 'string');
    return parts.length > 0 ? parts.join('|') : undefined;
  }
  return undefined;
}

/** Derive a deterministic event region id from the handlers and region metadata. */
function deriveEventId(prefix: string, handlers: EventHandlers, regionId?: string): string {
  const tags = [
    handlerTag(handlers.onClick),
    handlerTag(handlers.onMouseEnter),
    handlerTag(handlers.onMouseLeave),
    handlerTag(handlers.onMouseDown),
    handlerTag(handlers.onMouseUp),
    regionId,
  ].filter((v): v is string => typeof v === 'string');
  return tags.length > 0 ? `${prefix}:${tags.join(':')}` : prefix;
}

/** Flatten arbitrary JSX children into an array of concrete VNodes */
export function normalizeChildren(children: Child): VNode[] {
  if (children === null || children === undefined || typeof children === 'boolean') {
    return [];
  }
  if (Array.isArray(children)) {
    return children.flatMap((c) => normalizeChildren(c));
  }
  if (typeof children === 'string' || typeof children === 'number') {
    return [text(String(children))];
  }
  if (typeof children === 'object' && 'kind' in children) {
    return [children as VNode];
  }
  return [];
}

/** Flatten children and wrap them in a single VNode container if needed */
export function normalizeSingleChild(children: Child): VNode {
  const list = normalizeChildren(children);
  if (list.length === 0) return empty();
  if (list.length === 1 && list[0]) return list[0];
  return column(...list);
}

/** Helper to build a Style object from individual style props */
function buildInlineStyle(props: {
  color?: any;
  bg?: any;
  bold?: boolean;
  dim?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  style?: Style;
  borderColor?: any;
  padding?: any;
  border?: any;
}): Style | undefined {
  const hasProps =
    props.color !== undefined ||
    props.bg !== undefined ||
    props.bold !== undefined ||
    props.dim !== undefined ||
    props.italic !== undefined ||
    props.underline !== undefined ||
    props.strikethrough !== undefined ||
    props.borderColor !== undefined ||
    props.padding !== undefined ||
    props.border !== undefined;

  if (!hasProps) return props.style;

  let b: Border | undefined;
  if (typeof props.border === 'object' && 'chars' in props.border) {
    b = props.border;
  } else if (props.border === true || props.border === 'rounded') {
    b = border.rounded;
  } else if (props.border === 'square') {
    b = border.square;
  } else if (props.border === 'double') {
    b = border.double;
  } else if (props.border === 'thick') {
    b = border.thick;
  }

  // Individual props act as overrides on top of the base `style` prop.
  const overrides: Partial<StyleProps> = {
    color: props.color,
    background: props.bg,
    bold: props.bold,
    dim: props.dim,
    italic: props.italic,
    underline: props.underline,
    strikethrough: props.strikethrough,
    borderColor: props.borderColor,
    padding: props.padding,
    border: b,
  };

  if (props.style) return props.style.merge(overrides);
  return createStyle(overrides);
}

/**
 * JSX Fragment container. A fragment with multiple children composes them in
 * a column — terminal layout is directional, so a fragment must pick one.
 */
export function Fragment(props: { children?: Child }): VNode {
  const children = normalizeChildren(props.children);
  if (children.length === 0) return empty();
  if (children.length === 1 && children[0]) return children[0];
  return column(...children);
}

/** Declarative Box container component */
export function Box(props: BoxProps): VNode {
  const children = normalizeChildren(props.children);
  const inlineStyle = buildInlineStyle(props);

  let inner: VNode;
  if (props.flexDirection === 'row') {
    inner = props.gap !== undefined && props.gap > 0 ? rowWithGap(props.gap, ...children) : row(...children);
  } else {
    inner = props.gap !== undefined && props.gap > 0 ? columnWithGap(props.gap, ...children) : column(...children);
  }

  let node: VNode = box(inner, inlineStyle, {
    width: props.width,
    height: props.height,
    fit: props.fit,
    overflow: props.overflow,
    scrollOffset: props.scrollOffset,
  });

  const hasEvent =
    props.onClick ||
    props.onMouseEnter ||
    props.onMouseLeave ||
    props.onMouseDown ||
    props.onMouseUp ||
    props.region;

  if (hasEvent) {
    const handlers: EventHandlers = {
      onClick: props.onClick,
      onMouseEnter: props.onMouseEnter,
      onMouseLeave: props.onMouseLeave,
      onMouseDown: props.onMouseDown,
      onMouseUp: props.onMouseUp,
    };
    const id = props.id ?? deriveEventId('box', handlers, regionId(props.region));
    node = event(id, node, handlers, props.region);
  }

  return node;
}

function regionId(region: BoxProps['region']): string | undefined {
  if (!region || typeof region !== 'object') return undefined;
  const id = (region as { id?: unknown }).id;
  return typeof id === 'string' ? id : undefined;
}

/** Declarative Text component */
export function Text(props: TextProps): VNode {
  const children = normalizeChildren(props.children);
  const inlineStyle = buildInlineStyle(props);

  let content = '';
  if (typeof props.children === 'string' || typeof props.children === 'number') {
    content = String(props.children);
  } else {
    for (const c of children) {
      if (c.kind === 'text') content += c.content;
    }
  }

  return text(content, inlineStyle, { wrap: props.wrap, href: props.href });
}

/** Declarative Row layout */
export function Row(props: RowProps): VNode {
  const children = normalizeChildren(props.children);
  if (props.gap !== undefined && props.gap > 0) {
    return rowWithGap(props.gap, ...children);
  }
  return row(...children);
}

/** Declarative Column layout */
export function Column(props: ColumnProps): VNode {
  const children = normalizeChildren(props.children);
  if (props.gap !== undefined && props.gap > 0) {
    return columnWithGap(props.gap, ...children);
  }
  return column(...children);
}

/** Declarative Scroll component */
export function Scroll(props: ScrollProps): VNode {
  return scroll(normalizeSingleChild(props.children), {
    height: props.height,
    offset: props.offset ?? 0,
  });
}

/** Declarative Focus component */
export function Focus(props: FocusProps): VNode {
  return focus(props.id, normalizeSingleChild(props.children), {
    focused: props.focused,
    tabIndex: props.tabIndex,
    group: props.group,
  });
}

/** Declarative Button component */
export function Button(props: ButtonProps): VNode {
  const isFocused = props.focused ?? false;
  const label = props.label ?? (typeof props.children === 'string' ? props.children : 'Button');

  const btnStyle = createStyle({
    bold: isFocused,
    color: isFocused ? color.brightCyan : props.disabled ? color.gray : color.white,
    background: isFocused ? color.rgb(30, 40, 60) : undefined,
    border: isFocused ? border.rounded : border.square,
  });

  const node = box(text(`[ ${label} ]`), btnStyle);
  if (props.onClick !== undefined && !props.disabled) {
    const id = props.id ?? `btn:${handlerTag(props.onClick) ?? 'unlabeled'}`;
    return event(id, node, { onClick: props.onClick });
  }
  return node;
}

/** Declarative TextInput component (presentational — see TextInputProps) */
export function TextInput(props: TextInputProps): VNode {
  const isFocused = props.focused ?? false;
  const val = props.value || (props.placeholder ? props.placeholder : '');
  const isPlaceholder = !props.value && !!props.placeholder;

  const inputStyle = createStyle({
    color: isPlaceholder ? color.gray : isFocused ? color.brightCyan : color.white,
    border: isFocused ? border.rounded : border.square,
  });

  const display = props.mask ? (typeof props.mask === 'string' ? props.mask.repeat(val.length) : '*'.repeat(val.length)) : val;
  const cursorChar = isFocused ? '▏' : '';

  return box(text(` ${display}${cursorChar} `), inputStyle);
}

/** Declarative Badge component */
export function Badge(props: BadgeProps): VNode {
  const toneColor =
    props.tone === 'success'
      ? color.brightGreen
      : props.tone === 'danger'
        ? color.brightRed
        : props.tone === 'warning'
          ? color.brightYellow
          : props.tone === 'info'
            ? color.brightCyan
            : color.white;

  const badgeStyle = createStyle({
    color: toneColor,
    bold: true,
  });

  return text(`[ ${props.label} ]`, badgeStyle);
}

/** Declarative Divider component */
export function Divider(props: DividerProps): VNode {
  const label = props.label ? ` ${props.label} ` : '────────────────────────────────';
  return text(label, createStyle({ dim: true, color: color.gray }));
}

/** Declarative ProgressBar component */
export function ProgressBar(props: ProgressBarProps): VNode {
  const max = props.max ?? 100;
  const ratio = Math.max(0, Math.min(1, props.value / max));
  const width = props.width ?? 20;
  const filled = Math.round(ratio * width);
  const emptyCount = width - filled;

  const filledBar = '█'.repeat(filled);
  const emptyBar = '░'.repeat(emptyCount);

  return row(
    text(filledBar, createStyle({ color: color.brightCyan })),
    text(emptyBar, createStyle({ color: color.gray })),
    text(` ${Math.round(ratio * 100)}%`, createStyle({ dim: true })),
  );
}

/** Declarative Spinner component */
export function Spinner(props: SpinnerProps): VNode {
  const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  const frameIndex = (props.frame ?? 0) % frames.length;
  const glyph = frames[frameIndex] ?? '⠋';

  return row(
    text(glyph, createStyle({ color: color.brightCyan, bold: true })),
    props.label ? text(` ${props.label}`) : empty(),
  );
}

/** Declarative Card container */
export function Card(props: CardProps): VNode {
  const children = normalizeChildren(props.children);
  const cardStyle = createStyle({
    border: props.border === false ? undefined : border.rounded,
    borderColor: props.tone === 'danger' ? color.brightRed : props.tone === 'success' ? color.brightGreen : color.gray,
    padding: props.padding ?? 1,
  });

  const content: VNode[] = [];
  if (props.title) {
    content.push(text(props.title, createStyle({ bold: true, color: color.brightWhite })));
    content.push(Divider({}));
  }
  content.push(...children);

  return box(column(...content), cardStyle);
}
