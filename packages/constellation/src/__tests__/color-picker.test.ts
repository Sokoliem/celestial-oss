import { layout as renderLayout } from '@celestial/nebula';
import { describe, expect, it, vi } from 'vitest';
import type { ColorPickerModel } from '../color-picker.js';
import { colorPicker, getColorPickerHelpWithLabels, getColorPickerHit, getColorPickerLayout, hexToRgb, hslToRgb, rgbToHex, rgbToHsl } from '../color-picker.js';

describe('hslToRgb', () => {
  it('converts red (0, 100, 50) to RGB', () => {
    const rgb = hslToRgb(0, 100, 50);
    expect(rgb.r).toBe(255);
    expect(rgb.g).toBe(0);
    expect(rgb.b).toBe(0);
  });

  it('converts green (120, 100, 50) to RGB', () => {
    const rgb = hslToRgb(120, 100, 50);
    expect(rgb.r).toBe(0);
    expect(rgb.g).toBe(255);
    expect(rgb.b).toBe(0);
  });

  it('converts blue (240, 100, 50) to RGB', () => {
    const rgb = hslToRgb(240, 100, 50);
    expect(rgb.r).toBe(0);
    expect(rgb.g).toBe(0);
    expect(rgb.b).toBe(255);
  });

  it('converts white (0, 0, 100) to RGB', () => {
    const rgb = hslToRgb(0, 0, 100);
    expect(rgb.r).toBe(255);
    expect(rgb.g).toBe(255);
    expect(rgb.b).toBe(255);
  });

  it('converts black (0, 0, 0) to RGB', () => {
    const rgb = hslToRgb(0, 0, 0);
    expect(rgb.r).toBe(0);
    expect(rgb.g).toBe(0);
    expect(rgb.b).toBe(0);
  });

  it('converts gray (0, 0, 50) to RGB', () => {
    const rgb = hslToRgb(0, 0, 50);
    expect(rgb.r).toBe(128);
    expect(rgb.g).toBe(128);
    expect(rgb.b).toBe(128);
  });
});

describe('rgbToHsl', () => {
  it('converts pure red to HSL', () => {
    const hsl = rgbToHsl(255, 0, 0);
    expect(hsl.h).toBe(0);
    expect(hsl.s).toBe(100);
    expect(hsl.l).toBe(50);
  });

  it('converts pure green to HSL', () => {
    const hsl = rgbToHsl(0, 255, 0);
    expect(hsl.h).toBe(120);
    expect(hsl.s).toBe(100);
    expect(hsl.l).toBe(50);
  });

  it('converts pure blue to HSL', () => {
    const hsl = rgbToHsl(0, 0, 255);
    expect(hsl.h).toBe(240);
    expect(hsl.s).toBe(100);
    expect(hsl.l).toBe(50);
  });

  it('converts white to HSL', () => {
    const hsl = rgbToHsl(255, 255, 255);
    expect(hsl.h).toBe(0);
    expect(hsl.s).toBe(0);
    expect(hsl.l).toBe(100);
  });

  it('converts black to HSL', () => {
    const hsl = rgbToHsl(0, 0, 0);
    expect(hsl.h).toBe(0);
    expect(hsl.s).toBe(0);
    expect(hsl.l).toBe(0);
  });
});

describe('rgbToHex', () => {
  it('converts red to hex', () => {
    expect(rgbToHex(255, 0, 0)).toBe('#FF0000');
  });

  it('converts green to hex', () => {
    expect(rgbToHex(0, 255, 0)).toBe('#00FF00');
  });

  it('converts blue to hex', () => {
    expect(rgbToHex(0, 0, 255)).toBe('#0000FF');
  });

  it('converts white to hex', () => {
    expect(rgbToHex(255, 255, 255)).toBe('#FFFFFF');
  });

  it('converts black to hex', () => {
    expect(rgbToHex(0, 0, 0)).toBe('#000000');
  });

  it('pads single digit hex values', () => {
    expect(rgbToHex(1, 2, 3)).toBe('#010203');
  });
});

describe('hexToRgb', () => {
  it('parses 6-digit hex with #', () => {
    const rgb = hexToRgb('#FF0000');
    expect(rgb).toEqual({ r: 255, g: 0, b: 0 });
  });

  it('parses 6-digit hex without #', () => {
    const rgb = hexToRgb('00FF00');
    expect(rgb).toEqual({ r: 0, g: 255, b: 0 });
  });

  it('parses 3-digit shorthand', () => {
    const rgb = hexToRgb('#F00');
    expect(rgb).toEqual({ r: 255, g: 0, b: 0 });
  });

  it('returns null for invalid hex', () => {
    expect(hexToRgb('invalid')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(hexToRgb('')).toBeNull();
  });

  it('returns null for partial hex', () => {
    expect(hexToRgb('#FF')).toBeNull();
  });

  it('handles lowercase hex', () => {
    const rgb = hexToRgb('#ff8800');
    expect(rgb).toEqual({ r: 255, g: 136, b: 0 });
  });
});

describe('colorPicker', () => {
  describe('layout and help', () => {
    it('aligns swatch hit targets with the rendered swatch row', () => {
      const component = colorPicker({
        swatches: ['#111111', '#222222', '#333333', '#444444', '#555555'],
        swatchLabels: ['Base', '1', '2', '3', 'Comp'],
      });
      const [model] = component.init();
      const layout = getColorPickerLayout(
        model,
        {
          swatches: ['#111111', '#222222', '#333333', '#444444', '#555555'],
          swatchLabels: ['Base', '1', '2', '3', 'Comp'],
        },
        { x: 10, y: 4, width: 42 },
      );

      expect(getColorPickerHit(layout, layout.swatches[0]!.x, layout.swatches[0]!.y)).toEqual({ kind: 'swatch', index: 0 });
      expect(getColorPickerHit(layout, layout.swatches[4]!.x + 1, layout.swatches[4]!.y)).toEqual({ kind: 'swatch', index: 4 });
    });

    it('keeps the computed slider and swatch coordinates aligned with the rendered grid', () => {
      const component = colorPicker({
        swatches: ['#111111', '#222222', '#333333', '#444444', '#555555'],
        swatchLabels: ['Base', '1', '2', '3', 'Comp'],
      });
      const [model] = component.init();
      const layout = getColorPickerLayout(
        model,
        {
          swatches: ['#111111', '#222222', '#333333', '#444444', '#555555'],
          swatchLabels: ['Base', '1', '2', '3', 'Comp'],
        },
        { width: 42 },
      );
      const grid = renderLayout(component.view(model), 42, 9);

      expect(grid.cells[layout.sliders.hue.y]?.[layout.sliders.hue.x]?.char).toMatch(/[|=-]/);
      expect(grid.cells[layout.swatches[0]!.y]?.[layout.swatches[0]!.x + 1]?.char).toBe('B');
      expect(grid.cells[layout.swatches[4]!.y]?.[layout.swatches[4]!.x + 1]?.char).toBe('C');
    });

    it('adapts swatch hit geometry to narrow widths', () => {
      const component = colorPicker({});
      const [model] = component.init();
      const narrowLayout = getColorPickerLayout(model, {}, { x: 3, y: 2, width: 24 });
      const wideLayout = getColorPickerLayout(model, {}, { x: 3, y: 2, width: 42 });

      expect(narrowLayout.swatches[0]!.x).toBe(8);
      expect(wideLayout.swatches[0]!.x).toBe(14);
    });

    it('explains labeled swatches clearly', () => {
      const labels = ['Base', '1', '2', '3', 'Comp'] as const;

      expect(getColorPickerHelpWithLabels({ kind: 'swatch', index: 0 }, labels)).toEqual(
        expect.objectContaining({
          title: 'Swatch: Base',
        }),
      );
      expect(getColorPickerHelpWithLabels({ kind: 'swatch', index: 4 }, labels)).toEqual(
        expect.objectContaining({
          title: 'Swatch: Complement',
        }),
      );
      expect(getColorPickerHelpWithLabels('swatches', labels).effect).toContain('Base restores the starting token');
    });
  });

  describe('init', () => {
    it('initializes with default red when no value provided', () => {
      const component = colorPicker({});
      const [model] = component.init();
      expect(model.hsl.h).toBe(0);
      expect(model.hsl.s).toBe(100);
      expect(model.hsl.l).toBe(50);
      expect(model.activeField).toBe('hue');
      expect(model.focused).toBe(false);
    });

    it('initializes with provided hex value', () => {
      const component = colorPicker({ value: '#00FF00' });
      const [model] = component.init();
      expect(model.hsl.h).toBe(120);
      expect(model.hsl.s).toBe(100);
      expect(model.hsl.l).toBe(50);
    });

    it('initializes hexInput from computed hex', () => {
      const component = colorPicker({ value: '#FF0000' });
      const [model] = component.init();
      expect(model.hexInput).toBe('#FF0000');
    });
  });

  describe('update', () => {
    const component = colorPicker({});
    const baseModel: ColorPickerModel = {
      hsl: { h: 180, s: 50, l: 50 },
      hexInput: '#40BFBF',
      activeField: 'hue' as const,
      swatchIndex: 0,
      focused: true,
      hoveredTarget: null,
      dragField: null,
    };

    it('increments hue by 1', () => {
      const [updated] = component.update({ type: 'increment' }, baseModel);
      expect(updated.hsl.h).toBe(181);
    });

    it('decrements hue by 1', () => {
      const [updated] = component.update({ type: 'decrement' }, baseModel);
      expect(updated.hsl.h).toBe(179);
    });

    it('wraps hue around 360', () => {
      const model = { ...baseModel, hsl: { ...baseModel.hsl, h: 359 } };
      const [updated] = component.update({ type: 'increment' }, model);
      expect(updated.hsl.h).toBe(0);
    });

    it('wraps hue around 0', () => {
      const model = { ...baseModel, hsl: { ...baseModel.hsl, h: 0 } };
      const [updated] = component.update({ type: 'decrement' }, model);
      expect(updated.hsl.h).toBe(359);
    });

    it('increments saturation when field is saturation', () => {
      const model = { ...baseModel, activeField: 'saturation' as const };
      const [updated] = component.update({ type: 'increment' }, model);
      expect(updated.hsl.s).toBe(51);
    });

    it('clamps saturation to 100', () => {
      const model = {
        ...baseModel,
        activeField: 'saturation' as const,
        hsl: { ...baseModel.hsl, s: 100 },
      };
      const [updated] = component.update({ type: 'increment' }, model);
      expect(updated.hsl.s).toBe(100);
    });

    it('clamps saturation to 0', () => {
      const model = {
        ...baseModel,
        activeField: 'saturation' as const,
        hsl: { ...baseModel.hsl, s: 0 },
      };
      const [updated] = component.update({ type: 'decrement' }, model);
      expect(updated.hsl.s).toBe(0);
    });

    it('increments lightness when field is lightness', () => {
      const model = { ...baseModel, activeField: 'lightness' as const };
      const [updated] = component.update({ type: 'increment' }, model);
      expect(updated.hsl.l).toBe(51);
    });

    it('increment-large jumps by 10', () => {
      const [updated] = component.update({ type: 'increment-large' }, baseModel);
      expect(updated.hsl.h).toBe(190);
    });

    it('decrement-large jumps by 10', () => {
      const [updated] = component.update({ type: 'decrement-large' }, baseModel);
      expect(updated.hsl.h).toBe(170);
    });

    it('next-field cycles through fields', () => {
      const [updated] = component.update({ type: 'next-field' }, baseModel);
      expect(updated.activeField).toBe('saturation');
    });

    it('prev-field cycles through fields backwards', () => {
      const [updated] = component.update({ type: 'prev-field' }, baseModel);
      expect(updated.activeField).toBe('swatches');
    });

    it('hex-char appends character when in hex field', () => {
      const model = { ...baseModel, activeField: 'hex' as const, hexInput: '#FF' };
      const [updated] = component.update({ type: 'hex-char', char: '0' }, model);
      expect(updated.hexInput).toBe('#FF0');
    });

    it('hex-char ignores invalid characters', () => {
      const model = { ...baseModel, activeField: 'hex' as const, hexInput: '#FF' };
      const [updated] = component.update({ type: 'hex-char', char: 'Z' }, model);
      expect(updated.hexInput).toBe('#FF');
    });

    it('hex-char is no-op when not in hex field', () => {
      const [updated] = component.update({ type: 'hex-char', char: 'A' }, baseModel);
      expect(updated.hexInput).toBe(baseModel.hexInput);
    });

    it('should not append # when hexInput already starts with #', () => {
      const model = { ...baseModel, activeField: 'hex' as const, hexInput: '#FF' };
      const [updated] = component.update({ type: 'hex-char', char: '#' }, model);
      // Bug: # gets appended, resulting in '#FF#'
      expect(updated.hexInput).toBe('#FF'); // Should not change
    });

    it('should allow # as first character in hex input', () => {
      const model = { ...baseModel, activeField: 'hex' as const, hexInput: '' };
      const [updated] = component.update({ type: 'hex-char', char: '#' }, model);
      expect(updated.hexInput).toBe('#'); // Should allow first #
    });

    it('should reject # mid-string when hexInput does not start with #', () => {
      // After backspacing to empty then typing FF, hexInput is 'FF' (no leading #).
      // Typing # here should be rejected — # is only valid as the first character.
      const model = { ...baseModel, activeField: 'hex' as const, hexInput: 'FF' };
      const [updated] = component.update({ type: 'hex-char', char: '#' }, model);
      expect(updated.hexInput).toBe('FF');
    });

    it('should reject # after a full sequence: empty -> F -> F -> #', () => {
      // Simulate typing F, F, then # starting from empty input
      const model = { ...baseModel, activeField: 'hex' as const, hexInput: '' };
      const [m1] = component.update({ type: 'hex-char', char: 'F' }, model);
      expect(m1.hexInput).toBe('F');
      const [m2] = component.update({ type: 'hex-char', char: 'F' }, m1);
      expect(m2.hexInput).toBe('FF');
      const [m3] = component.update({ type: 'hex-char', char: '#' }, m2);
      expect(m3.hexInput).toBe('FF'); // # must be rejected
    });

    it('hex-backspace removes last character', () => {
      const model = { ...baseModel, activeField: 'hex' as const, hexInput: '#FF0' };
      const [updated] = component.update({ type: 'hex-backspace' }, model);
      expect(updated.hexInput).toBe('#FF');
    });

    it('apply-hex updates HSL from valid hex', () => {
      const model = { ...baseModel, activeField: 'hex' as const, hexInput: '#00FF00' };
      const [updated] = component.update({ type: 'apply-hex' }, model);
      expect(updated.hsl.h).toBe(120);
    });

    it('apply-hex is no-op for invalid hex', () => {
      const model = { ...baseModel, activeField: 'hex' as const, hexInput: 'invalid' };
      const [updated] = component.update({ type: 'apply-hex' }, model);
      expect(updated.hsl).toEqual(baseModel.hsl);
    });

    it('calls onChange when adjusting sliders', () => {
      const onChange = vi.fn();
      const cp = colorPicker({ onChange });
      cp.update({ type: 'increment' }, baseModel);
      expect(onChange).toHaveBeenCalled();
    });

    it('select-swatch applies swatch color', () => {
      const model = { ...baseModel, activeField: 'swatches' as const, swatchIndex: 0 };
      const [updated] = component.update({ type: 'select-swatch' }, model);
      // Default swatch 0 is #FF0000 (red)
      expect(updated.hsl.h).toBe(0);
      expect(updated.hsl.s).toBe(100);
      expect(updated.hsl.l).toBe(50);
    });

    it('handles focus', () => {
      const [updated] = component.update({ type: 'focus' }, { ...baseModel, focused: false });
      expect(updated.focused).toBe(true);
    });

    it('handles blur', () => {
      const [updated] = component.update({ type: 'blur' }, baseModel);
      expect(updated.focused).toBe(false);
    });
  });

  describe('view', () => {
    it('renders a column with color picker content', () => {
      const component = colorPicker({});
      const [model] = component.init();
      const vnode = component.view(model);
      expect(vnode.kind).toBe('column');
    });

    it('includes title', () => {
      const component = colorPicker({});
      const [model] = component.init();
      const vnode = component.view(model);
      if (vnode.kind === 'column') {
        const title = vnode.children[0];
        if (title?.kind === 'text') {
          expect(title.content).toContain('Color Picker');
        }
      }
    });
  });

  describe('subscriptions', () => {
    it('returns none when not focused', () => {
      const component = colorPicker({});
      const model: ColorPickerModel = {
        hsl: { h: 0, s: 100, l: 50 },
        hexInput: '#FF0000',
        activeField: 'hue' as const,
        swatchIndex: 0,
        focused: false,
        hoveredTarget: null,
        dragField: null,
      };
      const sub = component.subscriptions?.(model);
      expect(sub).toBeDefined();
      if (sub) {
        expect(sub._kind.kind).toBe('none');
      }
    });

    it('returns batch when focused', () => {
      const component = colorPicker({});
      const model: ColorPickerModel = {
        hsl: { h: 0, s: 100, l: 50 },
        hexInput: '#FF0000',
        activeField: 'hue' as const,
        swatchIndex: 0,
        focused: true,
        hoveredTarget: null,
        dragField: null,
      };
      const sub = component.subscriptions?.(model);
      expect(sub).toBeDefined();
      if (sub) {
        expect(sub._kind.kind).toBe('batch');
      }
    });
  });
});
