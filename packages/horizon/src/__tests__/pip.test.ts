import { describe, expect, it } from 'vitest';
import type { PipModel } from '../pip.js';
import { createPipModel, isPipMinimized, pipUpdate } from '../pip.js';

describe('createPipModel', () => {
  it('returns correct initial state with defaults x=0, y=0', () => {
    const model = createPipModel({ width: 40, height: 20 });
    expect(model).toEqual({
      minimized: false,
      x: 0,
      y: 0,
      width: 40,
      height: 20,
    });
  });

  it('accepts custom x and y', () => {
    const model = createPipModel({ width: 30, height: 15, x: 5, y: 10 });
    expect(model).toEqual({
      minimized: false,
      x: 5,
      y: 10,
      width: 30,
      height: 15,
    });
  });
});

describe('pipUpdate', () => {
  it('pip-toggle flips minimized from false to true', () => {
    const model = createPipModel({ width: 40, height: 20 });
    const result = pipUpdate({ type: 'pip-toggle' }, model);
    expect(result.minimized).toBe(true);
  });

  it('pip-toggle flips minimized from true to false', () => {
    const model: PipModel = { minimized: true, x: 0, y: 0, width: 40, height: 20 };
    const result = pipUpdate({ type: 'pip-toggle' }, model);
    expect(result.minimized).toBe(false);
  });

  it('pip-expand sets minimized to false', () => {
    const model: PipModel = { minimized: true, x: 0, y: 0, width: 40, height: 20 };
    const result = pipUpdate({ type: 'pip-expand' }, model);
    expect(result.minimized).toBe(false);
  });

  it('pip-minimize sets minimized to true', () => {
    const model = createPipModel({ width: 40, height: 20 });
    const result = pipUpdate({ type: 'pip-minimize' }, model);
    expect(result.minimized).toBe(true);
  });

  it('pip-move updates x and y position', () => {
    const model = createPipModel({ width: 40, height: 20 });
    const result = pipUpdate({ type: 'pip-move', x: 15, y: 25 }, model);
    expect(result.x).toBe(15);
    expect(result.y).toBe(25);
  });

  it('pip-resize updates width and height', () => {
    const model = createPipModel({ width: 40, height: 20 });
    const result = pipUpdate({ type: 'pip-resize', width: 60, height: 30 }, model);
    expect(result.width).toBe(60);
    expect(result.height).toBe(30);
  });
});

describe('isPipMinimized', () => {
  it('returns true when minimized', () => {
    const model: PipModel = { minimized: true, x: 0, y: 0, width: 40, height: 20 };
    expect(isPipMinimized(model)).toBe(true);
  });

  it('returns false when not minimized', () => {
    const model = createPipModel({ width: 40, height: 20 });
    expect(isPipMinimized(model)).toBe(false);
  });
});

describe('immutability', () => {
  it('pipUpdate does not mutate the original model', () => {
    const model = createPipModel({ width: 40, height: 20, x: 1, y: 2 });
    const original = { ...model };

    pipUpdate({ type: 'pip-toggle' }, model);
    pipUpdate({ type: 'pip-move', x: 99, y: 99 }, model);
    pipUpdate({ type: 'pip-resize', width: 100, height: 100 }, model);

    expect(model).toEqual(original);
  });
});
