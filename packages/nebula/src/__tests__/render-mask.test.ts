import { describe, expect, it } from 'vitest';
import type { AppConfig } from '../app.js';
import { createPlugin, withPlugins } from '../plugin.js';
import { createOutputMaskPlugin, maskVNode } from '../render-mask.js';
import { Cmd, Sub } from '../types.js';
import type { CellGrid } from '../vdom.js';

describe('render masking plugin', () => {
  it('redacts matching text content in the view layer before render', () => {
    type Model = { output: string };
    type Msg = { type: 'noop' };

    const baseConfig: AppConfig<Model, Msg> = {
      init: () => [{ output: 'token=abc123 safe text' }, Cmd.none()],
      update: (_msg, model) => [model, Cmd.none()],
      view: (model) => ({ kind: 'text', content: model.output }),
      subscriptions: () => Sub.none(),
    };

    const plugin = createOutputMaskPlugin<Model, Msg>({
      patterns: [/token=[^\s]+/g],
    });

    const wrapped = withPlugins(baseConfig, [plugin]);
    const rendered = wrapped.view({ output: 'token=abc123 safe text' });

    expect(rendered.kind).toBe('text');
    if (rendered.kind === 'text') {
      expect(rendered.content).toContain('[secure]');
      expect(rendered.content).toContain('safe text');
      expect(rendered.content).not.toContain('abc123');
    }
  });

  it('preserves the source model while masking the rendered output', () => {
    const source = 'api_key=super-secret';
    const maskedNode = maskVNode({ kind: 'text', content: source }, { patterns: [/api_key=[^\s]+/g] });

    expect(source).toBe('api_key=super-secret');
    expect(maskedNode.kind).toBe('text');
    if (maskedNode.kind === 'text') {
      expect(maskedNode.content).toBe('[secure]');
    }
  });

  it('preserves component render context while masking rendered output', () => {
    const maskedNode = maskVNode(
      {
        kind: 'component',
        render: (context) => ({ kind: 'text', content: `token=abc123 ${context?.container.cols ?? 0}x${context?.container.rows ?? 0}` }),
      },
      { patterns: [/token=[^\s]+/g] },
    );

    expect(maskedNode.kind).toBe('component');
    if (maskedNode.kind === 'component') {
      const rendered = maskedNode.render({
        terminal: { cols: 120, rows: 40 },
        available: { cols: 42, rows: 7 },
        container: { cols: 42, rows: 7 },
      });
      expect(rendered.kind).toBe('text');
      if (rendered.kind === 'text') {
        expect(rendered.content).toBe('[secure] 42x7');
      }
    }
  });

  it('can mask arbitrary cell grids after render', () => {
    const grid: CellGrid = {
      width: 4,
      height: 1,
      cells: [
        [
          { char: 'a', style: {} },
          { char: 'b', style: {} },
          { char: 'c', style: {} },
          { char: 'd', style: {} },
        ],
      ],
    };

    const maskedChars = grid.cells[0]!.map((cell, index) => ({
      ...cell,
      char: index < 3 ? '*' : cell.char,
    }));

    expect(maskedChars.map((cell) => cell.char).join('')).toBe('***d');
  });

  it('preserves existing optional app config fields when composed with other plugins', () => {
    type Model = { output: string };
    type Msg = { type: 'noop' };

    const baseConfig: AppConfig<Model, Msg> = {
      init: () => [{ output: 'token=abc123' }, Cmd.none()],
      update: (_msg, model) => [model, Cmd.none()],
      view: (model) => ({ kind: 'text', content: model.output }),
      subscriptions: () => Sub.none(),
      shaders: [],
    };

    const wrapped = withPlugins(baseConfig, [createPlugin<Model, Msg>('identity', {}), createOutputMaskPlugin<Model, Msg>()]);

    expect(wrapped.shaders).toBe(baseConfig.shaders);
  });
});
