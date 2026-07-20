import { color } from '@celestial/corona';
import { beforeEach, describe, expect, it } from 'vitest';
import { type BrailleCanvas, canvas } from '../canvas.js';
import { exportChartAsHtml, toAnsi, toHtml, toPixelData, toPlainText, toSvg } from '../export-pipeline.js';

describe('export-pipeline', () => {
  let c: BrailleCanvas;

  beforeEach(() => {
    c = canvas(4, 3, 'braille');
  });

  // ── Canvas accessor tests (prerequisite for all exports) ──────────────

  describe('CanvasImpl accessors', () => {
    it('getCellBitmask returns 0 for empty cells', () => {
      expect(c.getCellBitmask(0, 0)).toBe(0);
    });

    it('getCellBitmask returns correct bitmask after set()', () => {
      c.set(0, 0);
      expect(c.getCellBitmask(0, 0)).toBe(0x01);
    });

    it('getCellBitmask returns 0 for out-of-bounds', () => {
      expect(c.getCellBitmask(-1, 0)).toBe(0);
      expect(c.getCellBitmask(0, -1)).toBe(0);
      expect(c.getCellBitmask(100, 0)).toBe(0);
      expect(c.getCellBitmask(0, 100)).toBe(0);
    });

    it('getCellColor returns undefined for uncolored cells', () => {
      c.set(0, 0);
      expect(c.getCellColor(0, 0)).toBeUndefined();
    });

    it('getCellColor returns color after setColor + set', () => {
      const red = color.rgb(255, 0, 0);
      c.setColor(red);
      c.set(0, 0);
      const cc = c.getCellColor(0, 0);
      expect(cc).toBeDefined();
      expect(cc!.fg!.rgb).toEqual([255, 0, 0]);
    });

    it('getCellColor returns undefined for out-of-bounds', () => {
      expect(c.getCellColor(-1, 0)).toBeUndefined();
      expect(c.getCellColor(0, 100)).toBeUndefined();
    });

    it('getCodec returns a valid codec', () => {
      const codec = c.getCodec();
      expect(codec.subCols).toBe(2);
      expect(codec.subRows).toBe(4);
      expect(typeof codec.dotBit).toBe('function');
      expect(typeof codec.toChar).toBe('function');
    });

    it('getCodec reflects the canvas mode', () => {
      const qCanvas = canvas(4, 3, 'quarter');
      const codec = qCanvas.getCodec();
      expect(codec.subCols).toBe(2);
      expect(codec.subRows).toBe(2);
    });
  });

  // ── toAnsi ────────────────────────────────────────────────────────────

  describe('toAnsi', () => {
    it('returns the same as canvas.render()', () => {
      c.set(0, 0);
      c.set(1, 1);
      expect(toAnsi(c)).toBe(c.render());
    });

    it('returns empty braille for blank canvas', () => {
      const result = toAnsi(c);
      expect(result).toContain('\u2800');
    });
  });

  // ── toPlainText ───────────────────────────────────────────────────────

  describe('toPlainText', () => {
    it('strips ANSI from colored canvas', () => {
      const red = color.rgb(255, 0, 0);
      c.setColor(red);
      c.set(0, 0);
      const plain = toPlainText(c);
      expect(plain).not.toContain('\x1b');
      expect(plain).toContain('\u2801');
    });

    it('appends trailing newline by default', () => {
      const plain = toPlainText(c);
      expect(plain.endsWith('\n')).toBe(true);
    });

    it('omits trailing newline when opted out', () => {
      const plain = toPlainText(c, { trailingNewline: false });
      expect(plain.endsWith('\n')).toBe(false);
    });
  });

  // ── toHtml ────────────────────────────────────────────────────────────

  describe('toHtml', () => {
    it('wraps output in <pre> tags', () => {
      c.set(0, 0);
      const html = toHtml(c);
      expect(html).toMatch(/^<pre[^>]*>/);
      expect(html).toMatch(/<\/pre>$/);
    });

    it('uses default styles', () => {
      const html = toHtml(c);
      expect(html).toContain('font-family:monospace');
      expect(html).toContain('background:#1e1e2e');
    });

    it('applies custom styles', () => {
      const html = toHtml(c, {
        fontFamily: 'Courier',
        fontSize: '16px',
        background: '#000',
      });
      expect(html).toContain('font-family:Courier');
      expect(html).toContain('font-size:16px');
      expect(html).toContain('background:#000');
    });

    it('generates <span> for colored cells', () => {
      const red = color.rgb(255, 0, 0);
      c.setColor(red);
      c.set(0, 0);
      const html = toHtml(c);
      expect(html).toContain('<span');
      expect(html).toContain('color:rgb(255,0,0)');
    });

    it('generates full HTML document when requested', () => {
      const html = toHtml(c, { fullDocument: true });
      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('<html lang="en">');
      expect(html).toContain('</html>');
    });

    it('applies className to <pre>', () => {
      const html = toHtml(c, { className: 'chart-output' });
      expect(html).toContain('class="chart-output"');
    });

    it('does not contain ANSI escape sequences', () => {
      const red = color.rgb(255, 0, 0);
      c.setColor(red);
      c.set(0, 0);
      const html = toHtml(c);
      expect(html).not.toContain('\x1b');
    });

    it('escapes class names and inline style values', () => {
      const html = toHtml(c, {
        className: 'chart" onmouseover="alert(1)',
        fontFamily: 'mono" onfocus="alert(1)',
      });
      expect(html).not.toContain('class="chart" onmouseover=');
      expect(html).not.toContain('style="font-family:mono" onfocus=');
      expect(html).toContain('&quot;');
    });

    it('converts ANSI colors and escapes chart text', () => {
      const html = exportChartAsHtml({ toString: () => '\x1b[38;2;255;0;16m<tag>\x1b[0m' });
      expect(html).toContain('color:#ff0010');
      expect(html).toContain('&lt;tag&gt;');
      expect(html).not.toContain('<tag>');
    });
  });

  // ── toSvg ─────────────────────────────────────────────────────────────

  describe('toSvg', () => {
    it('returns valid SVG structure', () => {
      c.set(0, 0);
      const svg = toSvg(c);
      expect(svg).toContain('<svg xmlns="http://www.w3.org/2000/svg"');
      expect(svg).toContain('</svg>');
    });

    it('contains background rect', () => {
      const svg = toSvg(c);
      expect(svg).toContain('fill="#1e1e2e"');
    });

    it('generates rect elements for lit sub-pixels', () => {
      c.set(0, 0);
      const svg = toSvg(c);
      const rectCount = (svg.match(/<rect /g) || []).length;
      expect(rectCount).toBeGreaterThanOrEqual(2);
    });

    it('no pixel rects for blank canvas', () => {
      const svg = toSvg(c);
      const rectCount = (svg.match(/<rect /g) || []).length;
      expect(rectCount).toBe(1);
    });

    it('uses custom pixel size', () => {
      c.set(0, 0);
      const svg = toSvg(c, { pixelSize: 8 });
      expect(svg).toContain('width="8" height="8"');
    });

    it('uses custom background', () => {
      const svg = toSvg(c, { background: '#ffffff' });
      expect(svg).toContain('fill="#ffffff"');
    });

    it('colors pixels from canvas color map', () => {
      const green = color.rgb(0, 255, 0);
      c.setColor(green);
      c.set(0, 0);
      const svg = toSvg(c);
      expect(svg).toContain('fill="rgb(0,255,0)"');
    });

    it('uses default foreground when no color set', () => {
      c.set(0, 0);
      const svg = toSvg(c, { defaultForeground: '#ff00ff' });
      expect(svg).toContain('fill="rgb(255,0,255)"');
    });

    it('adds XML declaration when requested', () => {
      const svg = toSvg(c, { xmlDeclaration: true });
      expect(svg).toMatch(/^<\?xml/);
    });

    it('adds className to root svg', () => {
      const svg = toSvg(c, { className: 'my-chart' });
      expect(svg).toContain('class="my-chart"');
    });

    it('handles multiple codecs', () => {
      const qc = canvas(4, 3, 'quarter');
      qc.set(0, 0);
      const svg = toSvg(qc);
      expect(svg).toContain('<svg');
      expect(svg).toContain('<rect');
    });

    it('escapes SVG attribute values', () => {
      const svg = toSvg(c, { background: '"><script>alert(1)</script>' });
      expect(svg).not.toContain('"><script>');
      expect(svg).toContain('&quot;&gt;&lt;script&gt;');
    });
  });

  // ── toPixelData ───────────────────────────────────────────────────────

  describe('toPixelData', () => {
    it('returns correct dimensions', () => {
      const pd = toPixelData(c);
      expect(pd.width).toBe(c.pixelWidth);
      expect(pd.height).toBe(c.pixelHeight);
      expect(pd.data.length).toBe(pd.height);
      expect(pd.data[0]!.length).toBe(pd.width);
    });

    it('all false for blank canvas', () => {
      const pd = toPixelData(c);
      for (const row of pd.data) {
        for (const val of row) {
          expect(val).toBe(false);
        }
      }
    });

    it('reflects set pixels', () => {
      c.set(0, 0);
      c.set(3, 5);
      const pd = toPixelData(c);
      expect(pd.data[0]![0]).toBe(true);
      expect(pd.data[5]![3]).toBe(true);
      expect(pd.data[0]![1]).toBe(false);
    });

    it('does not include colors by default', () => {
      const pd = toPixelData(c);
      expect(pd.colors).toBeUndefined();
    });

    it('includes colors when requested', () => {
      const red = color.rgb(255, 0, 0);
      c.setColor(red);
      c.set(0, 0);
      const pd = toPixelData(c, { includeColors: true });
      expect(pd.colors).toBeDefined();
      expect(pd.colors![0]![0]).toEqual([255, 0, 0]);
      expect(pd.colors![0]![1]).toBeNull();
    });

    it('unlit pixel has null color even when includeColors=true', () => {
      const pd = toPixelData(c, { includeColors: true });
      expect(pd.colors![0]![0]).toBeNull();
    });

    it('works with different codec modes', () => {
      const qc = canvas(4, 3, 'quarter');
      qc.set(0, 0);
      const pd = toPixelData(qc);
      expect(pd.width).toBe(4 * 2);
      expect(pd.height).toBe(3 * 2);
      expect(pd.data[0]![0]).toBe(true);
    });
  });

  // ── Integration ───────────────────────────────────────────────────────

  describe('integration', () => {
    it('round-trips through all formats without error', () => {
      const red = color.rgb(255, 0, 0);
      const blue = color.rgb(0, 0, 255);
      c.setColor(red);
      c.line(0, 0, 7, 11);
      c.setColor(blue);
      c.fillRect(2, 2, 3, 3);

      const ansi = toAnsi(c);
      const plain = toPlainText(c);
      const html = toHtml(c);
      const svg = toSvg(c);
      const pixels = toPixelData(c, { includeColors: true });

      expect(ansi.length).toBeGreaterThan(0);
      expect(plain.length).toBeGreaterThan(0);
      expect(html).toContain('<pre');
      expect(svg).toContain('<svg');
      expect(pixels.data.some((row) => row.some((v) => v))).toBe(true);
      expect(pixels.colors!.some((row) => row.some((v) => v !== null))).toBe(true);
    });

    it('handles reset canvas gracefully', () => {
      c.set(0, 0);
      c.reset();

      const ansi = toAnsi(c);
      const plain = toPlainText(c);
      const svg = toSvg(c);
      const pixels = toPixelData(c);

      expect(pixels.data.every((row) => row.every((v) => !v))).toBe(true);
      expect(ansi.length).toBeGreaterThan(0);
      expect(plain.length).toBeGreaterThan(0);
      const rectCount = (svg.match(/<rect /g) || []).length;
      expect(rectCount).toBe(1);
    });
  });
});
