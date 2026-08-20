import { color } from '@celestial/corona';
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
});
