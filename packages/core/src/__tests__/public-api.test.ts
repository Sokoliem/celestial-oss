import { describe, expect, it } from 'vitest';
import {
  animation,
  app,
  capabilities,
  color,
  createDragState,
  dragUpdate,
  interaction,
  layout,
  runtime,
  selectListRange,
  stripAnsi,
  styling,
  text,
} from '../index.js';

describe('@celestial/core public facade', () => {
  it('exposes descriptive namespaces and the golden-path runtime', () => {
    expect(capabilities.detectCapabilities).toBeTypeOf('function');
    expect(styling.color).toBe(color);
    expect(animation.spring).toBeTypeOf('function');
    expect(runtime.app).toBe(app);
    expect(layout.grid).toBeTypeOf('function');
    expect(interaction.HitMap).toBeTypeOf('function');
    expect(createDragState).toBe(interaction.createDragState);
    expect(dragUpdate).toBe(interaction.dragUpdate);
    expect(selectListRange).toBe(interaction.selectListRange);
    expect(text('ready').content).toBe('ready');
  });

  it('exposes canonical ANSI normalization', () => {
    expect(stripAnsi('\u001b[31mready\u001b[0m')).toBe('ready');
  });
});
