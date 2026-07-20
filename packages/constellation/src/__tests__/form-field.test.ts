import { text } from '@celestial/nebula';
import { describe, expect, it } from 'vitest';
import { formField } from '../form-field.js';

function collectText(node: unknown): string[] {
  if (!node || typeof node !== 'object') {
    return [];
  }

  const candidate = node as {
    kind?: string;
    content?: unknown;
    children?: unknown[];
  };

  if (candidate.kind === 'text') {
    return [String(candidate.content ?? '')];
  }

  if (!Array.isArray(candidate.children)) {
    return [];
  }

  return candidate.children.flatMap((child) => collectText(child));
}

function collectStyles(node: unknown): Array<Record<string, unknown>> {
  if (!node || typeof node !== 'object') {
    return [];
  }

  const candidate = node as {
    kind?: string;
    style?: Record<string, unknown>;
    children?: unknown[];
  };

  if (candidate.kind === 'text' && candidate.style) {
    return [candidate.style];
  }

  if (!Array.isArray(candidate.children)) {
    return [];
  }

  return candidate.children.flatMap((child) => collectStyles(child));
}

describe('formField', () => {
  it('renders label text', () => {
    const result = formField({
      label: 'Username',
      child: text('input-placeholder'),
    });

    const texts = collectText(result);
    expect(texts.some((t) => t === 'Username')).toBe(true);
  });

  it('renders required indicator', () => {
    const result = formField({
      label: 'Email',
      required: true,
      child: text('input-placeholder'),
    });

    const texts = collectText(result);
    expect(texts.some((t) => t.includes('*'))).toBe(true);
    expect(texts.some((t) => t === 'Email')).toBe(true);
  });

  it('does not render required indicator when not required', () => {
    const result = formField({
      label: 'Bio',
      required: false,
      child: text('input-placeholder'),
    });

    const texts = collectText(result);
    expect(texts.some((t) => t.includes('*'))).toBe(false);
  });

  it('renders hint text', () => {
    const result = formField({
      label: 'Password',
      hint: 'Must be at least 8 characters',
      child: text('input-placeholder'),
    });

    const texts = collectText(result);
    expect(texts.some((t) => t === 'Must be at least 8 characters')).toBe(true);
  });

  it('renders error text and replaces hint', () => {
    const result = formField({
      label: 'Password',
      hint: 'Must be at least 8 characters',
      error: 'Password is too short',
      child: text('input-placeholder'),
    });

    const texts = collectText(result);
    expect(texts.some((t) => t === 'Password is too short')).toBe(true);
    // Hint should NOT appear when error is present
    expect(texts.some((t) => t === 'Must be at least 8 characters')).toBe(false);
  });

  it('renders child component', () => {
    const child = text('my-input-content');
    const result = formField({
      label: 'Field',
      child,
    });

    const texts = collectText(result);
    expect(texts.some((t) => t === 'my-input-content')).toBe(true);
  });

  it('applies focused styling on label', () => {
    const result = formField({
      label: 'Name',
      focused: true,
      child: text('input-placeholder'),
    });

    // The label should have a foreground color (cyan) and bold when focused
    const styles = collectStyles(result);
    const hasFocusedLabel = styles.some((s) => s.bold === true && (s.fg !== undefined || s.fgRgb !== undefined));
    expect(hasFocusedLabel).toBe(true);
  });

  it('does not apply color on label when not focused', () => {
    const result = formField({
      label: 'Name',
      focused: false,
      child: text('input-placeholder'),
    });

    // The label should be bold but without a foreground color
    const styles = collectStyles(result);
    // The first style should be the label - bold only, no fg color
    const labelStyle = styles[0];
    expect(labelStyle?.bold).toBe(true);
    expect(labelStyle?.fg).toBeUndefined();
    expect(labelStyle?.fgRgb).toBeUndefined();
  });

  it('renders error gutter indicator when error is present', () => {
    const result = formField({
      label: 'Email',
      error: 'Invalid email',
      child: text('input-placeholder'),
    });

    const texts = collectText(result);
    // Error gutter uses │ character
    expect(texts.some((t) => t.includes('│'))).toBe(true);
  });

  it('renders plain gutter when no error', () => {
    const result = formField({
      label: 'Email',
      child: text('input-placeholder'),
    });

    const texts = collectText(result);
    // No error gutter indicator
    expect(texts.some((t) => t.includes('│'))).toBe(false);
  });

  it('integrates with textInput-like view output', () => {
    // Simulate a textInput-style VNode child
    const inputView = text('hello world');
    const result = formField({
      label: 'Message',
      required: true,
      hint: 'Type your message',
      child: inputView,
    });

    const texts = collectText(result);
    expect(texts.some((t) => t === 'Message')).toBe(true);
    expect(texts.some((t) => t.includes('*'))).toBe(true);
    expect(texts.some((t) => t === 'hello world')).toBe(true);
    expect(texts.some((t) => t === 'Type your message')).toBe(true);
  });
});
