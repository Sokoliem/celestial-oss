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
    // Fallback: default to Box
    return Box(normalizedProps);
  }

  return Fragment(normalizedProps);
}

/** React 17+ Automatic JSX Transform entry point */
export function jsx(type: any, props: any, key?: any): any {
  const merged = key !== undefined ? { ...props, key } : props;
  if (typeof type === 'function') {
    return type(merged);
  }
  return h(type, merged);
}

export const jsxs = jsx;
export const jsxDEV = jsx;
