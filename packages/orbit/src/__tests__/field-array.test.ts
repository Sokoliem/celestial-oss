import { Cmd } from '@celestial/nebula';
import { describe, expect, it } from 'vitest';
import * as fieldArrayModule from '../field-array.js';

const { fieldArray } = fieldArrayModule;

// A minimal item model for testing
interface TestItem {
  value: string;
}

function createTestItem(): [TestItem, Cmd<unknown>] {
  return [{ value: '' }, Cmd.none()];
}

describe('fieldArray', () => {
  // ─── init ───────────────────────────────────────────────────────────────

  describe('init', () => {
    it('initializes with empty items by default', () => {
      const fa = fieldArray({ createItem: createTestItem });
      const [model] = fa.init();
      expect(model.items).toEqual([]);
      expect(model.keys).toEqual([]);
      expect(model.nextKey).toBe(0);
    });

    it('initializes with minItems pre-populated', () => {
      const fa = fieldArray({ createItem: createTestItem, minItems: 2 });
      const [model] = fa.init();
      expect(model.items).toHaveLength(2);
      expect(model.keys).toHaveLength(2);
      expect(model.keys[0]).toBe(0);
      expect(model.keys[1]).toBe(1);
      expect(model.nextKey).toBe(2);
    });

    it('rejects malformed and contradictory collection limits', () => {
      expect(() => fieldArray({ createItem: createTestItem, minItems: Number.NaN })).toThrow(RangeError);
      expect(() => fieldArray({ createItem: createTestItem, maxItems: -1 })).toThrow(RangeError);
      expect(() => fieldArray({ createItem: createTestItem, minItems: 2, maxItems: 1 })).toThrow(RangeError);
    });
  });

  // ─── append ─────────────────────────────────────────────────────────────

  describe('append', () => {
    it('appends a new item', () => {
      const fa = fieldArray({ createItem: createTestItem });
      const [model] = fa.init();
      const [newModel] = fa.update({ type: 'field-array:append' }, model);
      expect(newModel.items).toHaveLength(1);
      expect(newModel.keys).toHaveLength(1);
      expect(newModel.keys[0]).toBe(0);
      expect(newModel.nextKey).toBe(1);
    });

    it('respects maxItems', () => {
      const fa = fieldArray({ createItem: createTestItem, maxItems: 1 });
      const [model] = fa.init();
      const [m1] = fa.update({ type: 'field-array:append' }, model);
      expect(m1.items).toHaveLength(1);
      // Trying to add beyond max should be a no-op
      const [m2] = fa.update({ type: 'field-array:append' }, m1);
      expect(m2.items).toHaveLength(1);
    });

    it('assigns incrementing keys', () => {
      const fa = fieldArray({ createItem: createTestItem });
      const [model] = fa.init();
      const [m1] = fa.update({ type: 'field-array:append' }, model);
      const [m2] = fa.update({ type: 'field-array:append' }, m1);
      expect(m2.keys).toEqual([0, 1]);
      expect(m2.nextKey).toBe(2);
    });
  });

  // ─── prepend ────────────────────────────────────────────────────────────

  describe('prepend', () => {
    it('prepends a new item', () => {
      const fa = fieldArray({ createItem: createTestItem });
      const [model] = fa.init();
      const [m1] = fa.update({ type: 'field-array:append' }, model);
      // Modify first item to distinguish it
      m1.items[0] = { value: 'first' };
      const [m2] = fa.update({ type: 'field-array:prepend' }, m1);
      expect(m2.items).toHaveLength(2);
      expect(m2.items[0]!.value).toBe(''); // New empty item prepended
      expect(m2.items[1]!.value).toBe('first'); // Old item moved to index 1
    });

    it('respects maxItems', () => {
      const fa = fieldArray({ createItem: createTestItem, maxItems: 1 });
      const [model] = fa.init();
      const [m1] = fa.update({ type: 'field-array:append' }, model);
      const [m2] = fa.update({ type: 'field-array:prepend' }, m1);
      expect(m2.items).toHaveLength(1);
    });
  });

  // ─── remove ─────────────────────────────────────────────────────────────

  describe('remove', () => {
    it('removes an item by index', () => {
      const fa = fieldArray({ createItem: createTestItem });
      const [model] = fa.init();
      const [m1] = fa.update({ type: 'field-array:append' }, model);
      const [m2] = fa.update({ type: 'field-array:append' }, m1);
      expect(m2.items).toHaveLength(2);

      const [m3] = fa.update({ type: 'field-array:remove', index: 0 }, m2);
      expect(m3.items).toHaveLength(1);
      expect(m3.keys).toHaveLength(1);
    });

    it('respects minItems', () => {
      const fa = fieldArray({ createItem: createTestItem, minItems: 1 });
      const [model] = fa.init();
      expect(model.items).toHaveLength(1);
      // Should not remove below minimum
      const [m1] = fa.update({ type: 'field-array:remove', index: 0 }, model);
      expect(m1.items).toHaveLength(1);
    });

    it('ignores out-of-bounds index', () => {
      const fa = fieldArray({ createItem: createTestItem });
      const [model] = fa.init();
      const [m1] = fa.update({ type: 'field-array:append' }, model);
      const [m2] = fa.update({ type: 'field-array:remove', index: 5 }, m1);
      expect(m2.items).toHaveLength(1); // Unchanged
    });
  });

  // ─── move ───────────────────────────────────────────────────────────────

  describe('move', () => {
    it('moves an item from one index to another', () => {
      const fa = fieldArray({ createItem: createTestItem });
      const [model] = fa.init();
      const [m1] = fa.update({ type: 'field-array:append' }, model);
      m1.items[0] = { value: 'A' };
      const [m2] = fa.update({ type: 'field-array:append' }, m1);
      m2.items[1] = { value: 'B' };
      const [m3] = fa.update({ type: 'field-array:append' }, m2);
      m3.items[2] = { value: 'C' };

      // Move index 0 to index 2
      const [m4] = fa.update({ type: 'field-array:move', from: 0, to: 2 }, m3);
      expect(m4.items.map((i: TestItem) => i.value)).toEqual(['B', 'C', 'A']);
    });

    it('maintains key stability after move', () => {
      const fa = fieldArray({ createItem: createTestItem });
      const [model] = fa.init();
      const [m1] = fa.update({ type: 'field-array:append' }, model);
      const [m2] = fa.update({ type: 'field-array:append' }, m1);
      const [m3] = fa.update({ type: 'field-array:append' }, m2);
      const originalKeys = [...m3.keys];

      const [m4] = fa.update({ type: 'field-array:move', from: 0, to: 2 }, m3);
      // Keys should follow their items
      expect(m4.keys).toEqual([originalKeys[1], originalKeys[2], originalKeys[0]]);
    });

    it('ignores invalid move indices', () => {
      const fa = fieldArray({ createItem: createTestItem });
      const [model] = fa.init();
      const [m1] = fa.update({ type: 'field-array:append' }, model);
      const [m2] = fa.update({ type: 'field-array:move', from: -1, to: 5 }, m1);
      expect(m2.items).toHaveLength(1); // Unchanged
    });
  });

  // ─── swap ───────────────────────────────────────────────────────────────

  describe('swap', () => {
    it('swaps two items', () => {
      const fa = fieldArray({ createItem: createTestItem });
      const [model] = fa.init();
      const [m1] = fa.update({ type: 'field-array:append' }, model);
      m1.items[0] = { value: 'A' };
      const [m2] = fa.update({ type: 'field-array:append' }, m1);
      m2.items[1] = { value: 'B' };

      const [m3] = fa.update({ type: 'field-array:swap', indexA: 0, indexB: 1 }, m2);
      expect(m3.items[0]!.value).toBe('B');
      expect(m3.items[1]!.value).toBe('A');
    });

    it('swaps keys along with items', () => {
      const fa = fieldArray({ createItem: createTestItem });
      const [model] = fa.init();
      const [m1] = fa.update({ type: 'field-array:append' }, model);
      const [m2] = fa.update({ type: 'field-array:append' }, m1);
      const keysBeforeSwap = [...m2.keys];

      const [m3] = fa.update({ type: 'field-array:swap', indexA: 0, indexB: 1 }, m2);
      expect(m3.keys[0]).toBe(keysBeforeSwap[1]);
      expect(m3.keys[1]).toBe(keysBeforeSwap[0]);
    });
  });

  // ─── update-item ────────────────────────────────────────────────────────

  describe('update-item', () => {
    it('updates a specific item model', () => {
      const fa = fieldArray({ createItem: createTestItem });
      const [model] = fa.init();
      const [m1] = fa.update({ type: 'field-array:append' }, model);
      const [m2] = fa.update({ type: 'field-array:update-item', index: 0, msg: { value: 'updated' } }, m1);
      expect(m2.items[0]!.value).toBe('updated');
    });

    it('ignores out-of-bounds index for update-item', () => {
      const fa = fieldArray({ createItem: createTestItem });
      const [model] = fa.init();
      const [m1] = fa.update({ type: 'field-array:append' }, model);
      const [m2] = fa.update({ type: 'field-array:update-item', index: 5, msg: { value: 'nope' } }, m1);
      expect(m2.items[0]!.value).toBe(''); // Unchanged
    });

    it('ignores non-integer indices', () => {
      const fa = fieldArray({ createItem: createTestItem });
      const [model] = fa.init();
      const [withItem] = fa.update({ type: 'field-array:append' }, model);
      expect(fa.update({ type: 'field-array:update-item', index: Number.NaN, msg: { value: 'nope' } }, withItem)[0]).toBe(withItem);
      expect(fa.update({ type: 'field-array:remove', index: 0.5 }, withItem)[0]).toBe(withItem);
    });
  });

  // ─── clear ──────────────────────────────────────────────────────────────

  describe('clear', () => {
    it('removes all items', () => {
      const fa = fieldArray({ createItem: createTestItem });
      const [model] = fa.init();
      const [m1] = fa.update({ type: 'field-array:append' }, model);
      const [m2] = fa.update({ type: 'field-array:append' }, m1);
      const [m3] = fa.update({ type: 'field-array:clear' }, m2);
      expect(m3.items).toHaveLength(0);
      expect(m3.keys).toHaveLength(0);
    });

    it('re-populates to minItems on clear', () => {
      const fa = fieldArray({ createItem: createTestItem, minItems: 2 });
      const [model] = fa.init();
      const [m1] = fa.update({ type: 'field-array:append' }, model);
      const [m2] = fa.update({ type: 'field-array:clear' }, m1);
      expect(m2.items).toHaveLength(2);
    });
  });

  // ─── helpers ────────────────────────────────────────────────────────────

  describe('helpers', () => {
    it('getItems returns the items array', () => {
      const fa = fieldArray({ createItem: createTestItem });
      const [model] = fa.init();
      const [m1] = fa.update({ type: 'field-array:append' }, model);
      expect(fa.getItems(m1)).toEqual(m1.items);
      expect(fa.getItems(m1)).not.toBe(m1.items);
    });

    it('getKeys returns the keys array', () => {
      const fa = fieldArray({ createItem: createTestItem });
      const [model] = fa.init();
      const [m1] = fa.update({ type: 'field-array:append' }, model);
      expect(fa.getKeys(m1)).toEqual(m1.keys);
      expect(fa.getKeys(m1)).not.toBe(m1.keys);
    });

    it('length returns current item count', () => {
      const fa = fieldArray({ createItem: createTestItem });
      const [model] = fa.init();
      expect(fa.length(model)).toBe(0);
      const [m1] = fa.update({ type: 'field-array:append' }, model);
      expect(fa.length(m1)).toBe(1);
    });

    it('canAppend returns true when under maxItems', () => {
      const fa = fieldArray({ createItem: createTestItem, maxItems: 2 });
      const [model] = fa.init();
      expect(fa.canAppend(model)).toBe(true);
      const [m1] = fa.update({ type: 'field-array:append' }, model);
      expect(fa.canAppend(m1)).toBe(true);
      const [m2] = fa.update({ type: 'field-array:append' }, m1);
      expect(fa.canAppend(m2)).toBe(false);
    });

    it('canRemove returns true when above minItems', () => {
      const fa = fieldArray({ createItem: createTestItem, minItems: 1 });
      const [model] = fa.init();
      // Model has minItems=1 so starts with 1 item
      expect(fa.canRemove(model)).toBe(false);
      const [m1] = fa.update({ type: 'field-array:append' }, model);
      expect(fa.canRemove(m1)).toBe(true);
    });

    it('parses bracket-and-dot notation paths for nested field arrays', () => {
      const parseFieldArrayPath = (fieldArrayModule as any).parseFieldArrayPath;
      expect(parseFieldArrayPath('sections[0].items[1].label')).toEqual(['sections', 0, 'items', 1, 'label']);
    });

    it('reads nested values from field array paths', () => {
      const getFieldArrayValue = (fieldArrayModule as any).getFieldArrayValue;
      const value = getFieldArrayValue(
        {
          sections: [{ items: [{ label: 'One' }, { label: 'Two' }] }],
        },
        'sections[0].items[1].label',
      );

      expect(value).toBe('Two');
    });

    it('writes nested values and creates missing containers when needed', () => {
      const setFieldArrayValue = (fieldArrayModule as any).setFieldArrayValue;
      const updated = setFieldArrayValue({}, 'sections[0].items[1].label', 'Created');

      expect(updated).toEqual({
        sections: [
          {
            items: [undefined, { label: 'Created' }],
          },
        ],
      });
    });

    it('returns undefined for malformed or out-of-range field array paths', () => {
      const getFieldArrayValue = (fieldArrayModule as any).getFieldArrayValue;

      expect(getFieldArrayValue({ sections: [] }, 'sections[3].items[0].label')).toBeUndefined();
      expect(getFieldArrayValue({ sections: [] }, 'sections[].items')).toBeUndefined();
      expect(getFieldArrayValue({ sections: [] }, 'sections..items')).toBeUndefined();
      expect(getFieldArrayValue({ sections: [] }, '.sections')).toBeUndefined();
      expect(getFieldArrayValue({ sections: [] }, 'sections[100000].items')).toBeUndefined();
    });

    it('rejects prototype-polluting paths without mutating global objects', () => {
      const setFieldArrayValue = (fieldArrayModule as any).setFieldArrayValue;
      const target = {};
      expect(setFieldArrayValue(target, '__proto__.polluted', true)).toBe(target);
      expect(setFieldArrayValue(target, 'safe.constructor.prototype.polluted', true)).toBe(target);
      expect(({} as any).polluted).toBeUndefined();
    });

    it('replaces non-array path values safely when appending', () => {
      const appendValueAtPath = (fieldArrayModule as any).appendValueAtPath;
      expect(appendValueAtPath({ items: 'not-an-array' }, 'items', 'first')).toEqual({ items: ['first'] });
    });
  });
});
