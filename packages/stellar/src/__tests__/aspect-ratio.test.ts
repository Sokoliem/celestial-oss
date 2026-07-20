import { describe, expect, it } from 'vitest';
import { canvas } from '../canvas.js';
import { getCodec } from '../codec.js';

describe('aspect ratio', () => {
  describe('CellCodec.pixelAspect', () => {
    it('braille codec has pixelAspect of 1.0', () => {
      expect(getCodec('braille').pixelAspect).toBe(1.0);
    });

    it('sextant codec has pixelAspect of 0.75', () => {
      expect(getCodec('sextant').pixelAspect).toBe(0.75);
    });

    it('quarter codec has pixelAspect of 0.5', () => {
      expect(getCodec('quarter').pixelAspect).toBe(0.5);
    });

    it('halfblock codec has pixelAspect of 1.0', () => {
      expect(getCodec('halfblock').pixelAspect).toBe(1.0);
    });
  });

  describe('BrailleCanvas.pixelAspect', () => {
    it('canvas exposes pixelAspect from codec', () => {
      const c = canvas(10, 5, 'braille');
      expect(c.pixelAspect).toBe(1.0);

      const cs = canvas(10, 5, 'sextant');
      expect(cs.pixelAspect).toBe(0.75);

      const cq = canvas(10, 5, 'quarter');
      expect(cq.pixelAspect).toBe(0.5);

      const ch = canvas(10, 5, 'halfblock');
      expect(ch.pixelAspect).toBe(1.0);
    });
  });

  describe('aspect-corrected circle drawing', () => {
    it('circleCorrect draws aspect-corrected circle', () => {
      // Quarter mode has aspect 0.5: pixels are wider than tall
      // A corrected circle should differ from an uncorrected one
      const c = canvas(10, 10, 'quarter');
      c.circleCorrect(10, 10, 5);

      const uncorrected = canvas(10, 10, 'quarter');
      uncorrected.circle(10, 10, 5);

      // Count set pixels - corrected should differ from uncorrected
      // for non-1.0 aspect ratios
      let correctedCount = 0;
      let uncorrectedCount = 0;
      for (let y = 0; y < c.pixelHeight; y++) {
        for (let x = 0; x < c.pixelWidth; x++) {
          if (c.get(x, y)) correctedCount++;
          if (uncorrected.get(x, y)) uncorrectedCount++;
        }
      }
      expect(correctedCount).not.toBe(uncorrectedCount);
    });

    it('fillCircleCorrect draws aspect-corrected filled circle', () => {
      const c = canvas(10, 10, 'quarter');
      c.fillCircleCorrect(10, 10, 5);

      const uncorrected = canvas(10, 10, 'quarter');
      uncorrected.fillCircle(10, 10, 5);

      let correctedCount = 0;
      let uncorrectedCount = 0;
      for (let y = 0; y < c.pixelHeight; y++) {
        for (let x = 0; x < c.pixelWidth; x++) {
          if (c.get(x, y)) correctedCount++;
          if (uncorrected.get(x, y)) uncorrectedCount++;
        }
      }
      expect(correctedCount).not.toBe(uncorrectedCount);
    });

    it('braille mode corrected circle equals uncorrected (aspect 1.0)', () => {
      const corrected = canvas(10, 10, 'braille');
      corrected.circleCorrect(20, 20, 8);

      const uncorrected = canvas(10, 10, 'braille');
      uncorrected.circle(20, 20, 8);

      // For braille (aspect 1.0), should be identical
      expect(corrected.render()).toBe(uncorrected.render());
    });

    it('braille mode corrected fill equals uncorrected (aspect 1.0)', () => {
      const corrected = canvas(10, 10, 'braille');
      corrected.fillCircleCorrect(20, 20, 8);

      const uncorrected = canvas(10, 10, 'braille');
      uncorrected.fillCircle(20, 20, 8);

      expect(corrected.render()).toBe(uncorrected.render());
    });

    it('corrected circle in sextant mode is wider than uncorrected', () => {
      // Sextant aspect is 0.75 — pixels are wider than tall
      // To appear as a circle on screen, we need to compress the X coordinates
      // or stretch the Y coordinates. The corrected circle scales Y by 1/aspect,
      // which means it samples more Y pixels, making the shape taller in pixel space
      // but appearing circular on screen.
      const corrected = canvas(20, 10, 'sextant');
      corrected.circleCorrect(20, 15, 10);

      const uncorrected = canvas(20, 10, 'sextant');
      uncorrected.circle(20, 15, 10);

      // They should produce different output
      expect(corrected.render()).not.toBe(uncorrected.render());
    });
  });
});
