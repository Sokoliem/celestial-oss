import type { KeybindingLayer } from '@celestial/nebula';
import { describe, expect, it } from 'vitest';
import { createBindingGroup, detectConflicts, fromNebulaKeybindingLayer, fromNebulaKeybindingState } from '../conflicts.js';

describe('conflicts', () => {
  it('adapts Nebula layers into module-tagged groups', () => {
    const layer: KeybindingLayer<string> = {
      id: 'core',
      bindings: [
        {
          id: 'save',
          keys: [{ key: 's', ctrl: true }],
          action: 'save',
        },
      ],
    };

    expect(fromNebulaKeybindingLayer('editor', layer)).toEqual({
      module: 'editor',
      id: 'core',
      bindings: [
        {
          id: 'save',
          keys: [{ key: 's', ctrl: true }],
          action: 'save',
        },
      ],
    });

    expect(fromNebulaKeybindingState('editor', { mode: 'normal', layers: [layer], pendingChord: [], chordTimeoutMs: 1000, chordStartTime: 0 })).toHaveLength(1);
  });

  it('detects duplicate and prefix conflicts across groups', () => {
    const report = detectConflicts([
      createBindingGroup('editor', 'core', [
        {
          id: 'save',
          keys: [{ key: 's', ctrl: true }],
          action: 'save',
          mode: 'normal',
        },
        {
          id: 'save-all',
          keys: [
            { key: 's', ctrl: true },
            { key: 'a', ctrl: true },
          ],
          action: 'save-all',
          mode: 'normal',
        },
      ]),
      createBindingGroup('search', 'layer', [
        {
          id: 'save-copy',
          keys: [{ key: 's', ctrl: true }],
          action: 'save-copy',
          mode: 'normal',
        },
      ]),
    ]);

    expect(report.groups).toBe(2);
    expect(report.bindings).toBe(3);
    expect(report.conflicts).toContainEqual({
      kind: 'duplicate',
      left: expect.objectContaining({ module: 'editor', bindingId: 'save' }),
      right: expect.objectContaining({ module: 'search', bindingId: 'save-copy' }),
    });
    expect(report.conflicts).toContainEqual({
      kind: 'prefix',
      left: expect.objectContaining({ bindingId: 'save' }),
      right: expect.objectContaining({ bindingId: 'save-all' }),
    });
  });

  it('ignores bindings in incompatible modes', () => {
    const report = detectConflicts([
      createBindingGroup('editor', 'core', [
        {
          id: 'save',
          keys: [{ key: 's', ctrl: true }],
          action: 'save',
          mode: 'normal',
        },
        {
          id: 'save-insert',
          keys: [{ key: 's', ctrl: true }],
          action: 'save-insert',
          mode: 'insert',
        },
      ]),
    ]);

    expect(report.conflicts).toEqual([]);
  });
});
