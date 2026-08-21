import { color, style } from '@celestial/corona';
import { describe, expect, it } from 'vitest';
import {
  Badge,
  Box,
  Button,
  Card,
  Divider,
  Fragment,
  h,
  jsx,
  normalizeChildren,
  ProgressBar,
  Row,
  Spinner,
  Text,
  TextInput,
} from '../jsx/index.js';

describe('JSX / TSX Layer', () => {
  it('normalizes various child types into VNodes', () => {
    const list = normalizeChildren(['Hello', 42, null, undefined, false, h('text', null, 'World')]);
    expect(list.length).toBe(3);
    expect(list[0]?.kind).toBe('text');
    expect(list[1]?.kind).toBe('text');
    expect(list[2]?.kind).toBe('text');
  });

  it('creates nested JSX element trees via h()', () => {
    const tree = h(
      Box,
      { width: 80, height: 24, border: true },
      h(Text, { bold: true, color: color.brightCyan }, 'Title'),
      h(Divider, {}),
      h(
        Row,
        { gap: 2 },
        h(Button, { label: 'Submit', focused: true }),
        h(Button, { label: 'Cancel' }),
      ),
    );

    expect(tree.kind).toBe('box');
    expect(tree.width).toBe(80);
    expect(tree.height).toBe(24);
    expect(tree.children.length).toBe(1);
    expect(tree.children[0]?.kind).toBe('column');
  });

  it('handles intrinsic elements like <box>, <text>, <row>', () => {
    const tree = h('box', { width: 40 }, h('text', null, 'Nested intrinsic'));
    expect(tree.kind).toBe('box');
    expect(tree.width).toBe(40);
  });

  it('supports Fragment', () => {
    const frag = h(Fragment, null, h('text', null, 'One'), h('text', null, 'Two'));
    expect(frag.kind).toBe('column');
    expect((frag as any).children.length).toBe(2);
  });

  it('renders UI helper components (ProgressBar, Badge, Spinner, TextInput, Card)', () => {
    const pbar = ProgressBar({ value: 50, max: 100, width: 10 });
    expect(pbar.kind).toBe('row');

    const badge = Badge({ label: 'Active', tone: 'success' });
    expect(badge.kind).toBe('text');
    if (badge.kind === 'text') {
      expect(badge.content).toBe('[ Active ]');
    }

    const spinner = Spinner({ frame: 2, label: 'Loading...' });
    expect(spinner.kind).toBe('row');

    const input = TextInput({ value: 'celestial', focused: true });
    expect(input.kind).toBe('box');

    const card = Card({ title: 'System Info', children: [Text({ children: 'All good' })] });
    expect(card.kind).toBe('box');
  });

  it('works with React 17+ jsx runtime transform', () => {
    const node = jsx(Box, { children: jsx(Text, { children: 'Auto runtime' }) });
    expect(node.kind).toBe('box');
  });

  it('throws on unknown intrinsic elements instead of silently rendering a Box', () => {
    expect(() => h('buttton', { label: 'typo' })).toThrow(/Unknown JSX intrinsic element <buttton>/);
  });

  it('derives deterministic Button event ids from the onClick tag', () => {
    const a = Button({ label: 'Add', onClick: 'increment' });
    const b = Button({ label: 'Add', onClick: 'increment' });
    expect(a.kind).toBe('event');
    expect(b.kind).toBe('event');
    if (a.kind === 'event' && b.kind === 'event') {
      expect(a.id).toBe('btn:increment');
      expect(b.id).toBe(a.id);
      expect(a.handlers.onClick).toBe('increment');
    }
  });

  it('derives deterministic Box event ids without render-time counters', () => {
    const a = Box({ onClick: 'open', children: 'x' });
    const b = Box({ onClick: 'open', children: 'x' });
    expect(a.kind).toBe('event');
    if (a.kind === 'event' && b.kind === 'event') {
      expect(a.id).toBe('box:open');
      expect(b.id).toBe(a.id);
    }
  });

  it('does not forward key to component props', () => {
    let received: any;
    const Probe = (props: any) => {
      received = props;
      return Text({ children: 'probe' });
    };
    jsx(Probe, { children: 'x' }, 'list-key');
    expect(received).not.toHaveProperty('key');
    expect(received.children).toBe('x');
  });

  it('merges the style prop as a base with individual props winning', () => {
    const base = style({ color: color.red, dim: true });
    const node = Text({ children: 'styled', style: base, bold: true });
    expect(node.kind).toBe('text');
    if (node.kind === 'text') {
      expect(node.style?.bold).toBe(true);
      expect(node.style?.dim).toBe(true);
      expect(node.style?.fg).toBeDefined();
    }
  });
});
