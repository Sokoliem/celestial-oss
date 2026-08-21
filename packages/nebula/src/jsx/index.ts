import {
  Badge,
  Box,
  Button,
  Card,
  Column,
  Divider,
  Focus,
  Fragment,
  ProgressBar,
  Row,
  Scroll,
  Spinner,
  Text,
  TextInput,
} from './components.js';
import type { ComponentFunction } from './types.js';

export * from './components.js';
export * from './types.js';

const INTRINSIC_MAP: Record<string, ComponentFunction> = {
  box: Box,
  text: Text,
  row: Row,
  column: Column,
  scroll: Scroll,
  focus: Focus,
  divider: Divider,
  badge: Badge,
  button: Button,
  textInput: TextInput,
  progressBar: ProgressBar,
  spinner: Spinner,
  card: Card,
};

/**
 * Main JSX createElement pragma for Celestial.
 * Allows `<Box>`, `<Text>`, `<Row>`, or custom functional components `(props) => VNode`.
 * Unknown string tags throw — a typo'd intrinsic is a bug, not a Box.
 */
export function h(type: string | ComponentFunction, props: any, ...children: any[]): any {
  const normalizedProps = { ...(props || {}) };

  if (children.length === 1) {
    normalizedProps.children = children[0];
  } else if (children.length > 1) {
    normalizedProps.children = children;
  }

  if (typeof type === 'function') {
    return type(normalizedProps);
  }

  if (typeof type === 'string') {
    const intrinsic = INTRINSIC_MAP[type.toLowerCase()] ?? INTRINSIC_MAP[type];
    if (intrinsic) {
      return intrinsic(normalizedProps);
    }
    throw new Error(
      `Unknown JSX intrinsic element <${type}>. Known intrinsics: ${Object.keys(INTRINSIC_MAP).join(', ')}. ` +
        'Use a function component for custom elements.',
    );
  }

  return Fragment(normalizedProps);
}

/** React 17+ Automatic JSX Transform entry point */
export function jsx(type: any, props: any, _key?: any): any {
  // `key` is accepted for React-style authoring but never forwarded to
  // components — Celestial reconciles rendered cells positionally.
  const { key: _ignored, ...rest } = props ?? {};
  if (typeof type === 'function') {
    return type(rest);
  }
  return h(type, rest);
}

export const jsxs = jsx;
export const jsxDEV = jsx;
