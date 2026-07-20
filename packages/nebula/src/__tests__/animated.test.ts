import { describe, expect, it } from 'vitest';
import { animated, row, text } from '../elements.js';

describe('animated', () => {
  it('should set layoutId on a text node', () => {
    const node = text('hello');
    const result = animated('my-id', node);

    expect(result.layoutId).toBe('my-id');
    expect(result.kind).toBe('text');
    expect((result as typeof node).content).toBe('hello');
  });

  it('should set layoutId on a row node', () => {
    const node = row(text('a'), text('b'));
    const result = animated('row-1', node);

    expect(result.layoutId).toBe('row-1');
    expect(result.kind).toBe('row');
  });

  it('should not mutate the original node', () => {
    const node = text('hello');
    const result = animated('my-id', node);

    expect(node.layoutId).toBeUndefined();
    expect(result.layoutId).toBe('my-id');
    expect(result).not.toBe(node);
  });

  it('should override existing layoutId', () => {
    const node: ReturnType<typeof text> = { kind: 'text', content: 'hi', layoutId: 'old-id' };
    const result = animated('new-id', node);

    expect(result.layoutId).toBe('new-id');
  });
});
