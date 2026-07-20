import { describe, expect, it } from 'vitest';
import { imageEl } from '../elements.js';
import { type CellGrid, type CellUpdate, type ColumnNode, diff, extractRawBlobs, layout, measure, type RowNode, renderUpdates } from '../vdom.js';

describe('ImageNode', () => {
  describe('imageEl() builder', () => {
    it('should create an ImageNode with correct type, content, width, height', () => {
      const content = 'AB\nCD';
      const node = imageEl(content, 2, 2);

      expect(node.kind).toBe('image');
      expect(node.content).toBe('AB\nCD');
      expect(node.width).toBe(2);
      expect(node.height).toBe(2);
    });

    it('should create an ImageNode with single-line content', () => {
      const node = imageEl('XYZ', 3, 1);

      expect(node.kind).toBe('image');
      expect(node.content).toBe('XYZ');
      expect(node.width).toBe(3);
      expect(node.height).toBe(1);
    });

    it('should handle content with ANSI escape sequences', () => {
      const content = '\x1b[38;2;255;0;0m\u2588\x1b[0m\x1b[38;2;0;255;0m\u2588\x1b[0m';
      const node = imageEl(content, 2, 1);

      expect(node.kind).toBe('image');
      expect(node.content).toBe(content);
      expect(node.width).toBe(2);
      expect(node.height).toBe(1);
    });

    it('should handle empty content', () => {
      const node = imageEl('', 0, 0);

      expect(node.kind).toBe('image');
      expect(node.content).toBe('');
      expect(node.width).toBe(0);
      expect(node.height).toBe(0);
    });
  });

  describe('measure', () => {
    it('should return the declared width and height', () => {
      const node = imageEl('AB\nCD\nEF', 2, 3);
      const size = measure(node);

      expect(size).toEqual({ width: 2, height: 3 });
    });

    it('should measure a single-line image', () => {
      const node = imageEl('ABCDE', 5, 1);
      const size = measure(node);

      expect(size).toEqual({ width: 5, height: 1 });
    });

    it('should use declared dimensions, not content dimensions', () => {
      // The width/height are explicit, not derived from content parsing
      const node = imageEl('X', 10, 5);
      const size = measure(node);

      expect(size).toEqual({ width: 10, height: 5 });
    });
  });

  describe('layout', () => {
    it('should lay out image content into a CellGrid', () => {
      const node = imageEl('AB\nCD', 2, 2);
      const grid = layout(node, 10, 5);

      expect(grid.cells[0]![0]!.char).toBe('A');
      expect(grid.cells[0]![1]!.char).toBe('B');
      expect(grid.cells[1]![0]!.char).toBe('C');
      expect(grid.cells[1]![1]!.char).toBe('D');
    });

    it('should preserve ANSI escape sequences in image content', () => {
      const content = '\x1b[31mR\x1b[32mG';
      const node = imageEl(content, 2, 1);
      const grid = layout(node, 10, 1);

      expect(grid.cells[0]![0]!.char).toBe('R');
      expect(grid.cells[0]![0]!.style.fg).toBe('\x1b[31m');
      expect(grid.cells[0]![1]!.char).toBe('G');
      expect(grid.cells[0]![1]!.style.fg).toBe('\x1b[32m');
    });

    it('should handle multi-line image with ANSI colors', () => {
      const content = '\x1b[31mA\x1b[0m\n\x1b[32mB\x1b[0m';
      const node = imageEl(content, 1, 2);
      const grid = layout(node, 5, 5);

      expect(grid.cells[0]![0]!.char).toBe('A');
      expect(grid.cells[0]![0]!.style.fg).toBe('\x1b[31m');
      expect(grid.cells[1]![0]!.char).toBe('B');
      expect(grid.cells[1]![0]!.style.fg).toBe('\x1b[32m');
    });

    it('should clip image content to available space', () => {
      const node = imageEl('ABCDE\nFGHIJ\nKLMNO', 5, 3);
      // Only 3 cols and 2 rows available
      const grid = layout(node, 3, 2);

      expect(grid.cells[0]![0]!.char).toBe('A');
      expect(grid.cells[0]![1]!.char).toBe('B');
      expect(grid.cells[0]![2]!.char).toBe('C');
      expect(grid.cells[1]![0]!.char).toBe('F');
      expect(grid.cells[1]![1]!.char).toBe('G');
      expect(grid.cells[1]![2]!.char).toBe('H');
    });
  });

  describe('composition', () => {
    it('should compose inside a column layout', () => {
      const col: ColumnNode = {
        kind: 'column',
        children: [{ kind: 'text', content: 'Label:' }, imageEl('AB\nCD', 2, 2)],
      };
      const grid = layout(col, 10, 5);

      // First row: 'Label:'
      expect(grid.cells[0]![0]!.char).toBe('L');
      expect(grid.cells[0]![5]!.char).toBe(':');
      // Image at rows 1-2
      expect(grid.cells[1]![0]!.char).toBe('A');
      expect(grid.cells[1]![1]!.char).toBe('B');
      expect(grid.cells[2]![0]!.char).toBe('C');
      expect(grid.cells[2]![1]!.char).toBe('D');
    });

    it('should compose inside a row layout', () => {
      const r: RowNode = {
        kind: 'row',
        children: [{ kind: 'text', content: 'Hi' }, imageEl('XY', 2, 1)],
      };
      const grid = layout(r, 10, 1);

      // 'Hi' at cols 0-1
      expect(grid.cells[0]![0]!.char).toBe('H');
      expect(grid.cells[0]![1]!.char).toBe('i');
      // Image at cols 2-3
      expect(grid.cells[0]![2]!.char).toBe('X');
      expect(grid.cells[0]![3]!.char).toBe('Y');
    });

    it('should measure correctly in a column', () => {
      const col: ColumnNode = {
        kind: 'column',
        children: [{ kind: 'text', content: 'Hi' }, imageEl('ABCD\nEFGH', 4, 2)],
      };
      const size = measure(col);

      expect(size).toEqual({ width: 4, height: 3 });
    });

    it('should measure correctly in a row', () => {
      const r: RowNode = {
        kind: 'row',
        children: [{ kind: 'text', content: 'Hi' }, imageEl('AB\nCD', 2, 2)],
      };
      const size = measure(r);

      expect(size).toEqual({ width: 4, height: 2 });
    });
  });

  describe('raw blob passthrough', () => {
    /** Helper: create an empty CellGrid */
    function emptyGrid(width: number, height: number): CellGrid {
      const cells = [];
      for (let r = 0; r < height; r++) {
        const row = [];
        for (let c = 0; c < width; c++) {
          row.push({ char: ' ', style: {} });
        }
        cells.push(row);
      }
      return { cells, width, height };
    }

    it('imageEl with raw:true creates a raw ImageNode', () => {
      const node = imageEl('BLOB_CONTENT', 10, 5, { raw: true });
      expect(node.raw).toBe(true);
      expect(node.kind).toBe('image');
      expect(node.content).toBe('BLOB_CONTENT');
      expect(node.width).toBe(10);
      expect(node.height).toBe(5);
    });

    it('imageEl without raw option leaves raw undefined', () => {
      const node = imageEl('content', 4, 2);
      expect(node.raw).toBeUndefined();
    });

    it('imageEl with raw:false leaves raw as false', () => {
      const node = imageEl('content', 4, 2, { raw: false });
      expect(node.raw).toBe(false);
    });

    it('raw ImageNode stores blob in grid.rawBlobs instead of painting cells', () => {
      const kittyEscape = '\x1b_Gf=100,t=d;AAAA\x1b\\';
      const node = imageEl(kittyEscape, 4, 2, { raw: true });
      const grid = layout(node, 10, 5);

      // Verify grid.rawBlobs has an entry with the content
      expect(grid.rawBlobs).toBeDefined();
      expect(grid.rawBlobs!.size).toBe(1);

      const blob = [...grid.rawBlobs!.values()][0]!;
      expect(blob.content).toBe(kittyEscape);
      expect(blob.row).toBe(0);
      expect(blob.col).toBe(0);
      expect(blob.width).toBe(4);
      expect(blob.height).toBe(2);

      // Verify cells in the region have opaqueId set
      for (let r = 0; r < 2; r++) {
        for (let c = 0; c < 4; c++) {
          expect(grid.cells[r]![c]!.opaqueId).toBeDefined();
          expect(grid.cells[r]![c]!.char).toBe(' ');
        }
      }

      // Cells outside the region should NOT have opaqueId
      expect(grid.cells[0]![5]!.opaqueId).toBeUndefined();
      expect(grid.cells[3]![0]!.opaqueId).toBeUndefined();
    });

    it('raw ImageNode clips to available space', () => {
      const node = imageEl('BIGBLOB', 10, 8, { raw: true });
      // Only 3 cols and 2 rows available
      const grid = layout(node, 3, 2);

      expect(grid.rawBlobs).toBeDefined();
      const blob = [...grid.rawBlobs!.values()][0]!;
      expect(blob.width).toBe(3);
      expect(blob.height).toBe(2);
    });

    it('diff emits raw-blob update for new raw images', () => {
      const oldGrid = emptyGrid(10, 5);
      const node = imageEl('\x1b_Gf=100;DATA\x1b\\', 4, 2, { raw: true });
      const newGrid = layout(node, 10, 5);

      const updates = diff(oldGrid, newGrid);

      // Should contain a raw-blob update
      const blobUpdates = updates.filter((u) => u.kind === 'raw-blob');
      expect(blobUpdates.length).toBe(1);
      expect(blobUpdates[0]!.kind).toBe('raw-blob');
      expect((blobUpdates[0] as { blob: string }).blob).toBe('\x1b_Gf=100;DATA\x1b\\');
    });

    it('diff skips raw-blob update when content unchanged', () => {
      const kittyEscape = '\x1b_Gf=100;DATA\x1b\\';
      const node = imageEl(kittyEscape, 4, 2, { raw: true });
      const grid1 = layout(node, 10, 5);
      const grid2 = layout(node, 10, 5);

      const updates = diff(grid1, grid2);

      // No raw-blob updates since content is identical
      const blobUpdates = updates.filter((u) => u.kind === 'raw-blob');
      expect(blobUpdates.length).toBe(0);
    });

    it('diff emits raw-blob update when content changes', () => {
      const node1 = imageEl('BLOB_V1', 4, 2, { raw: true });
      const node2 = imageEl('BLOB_V2', 4, 2, { raw: true });
      const grid1 = layout(node1, 10, 5);
      const grid2 = layout(node2, 10, 5);

      const updates = diff(grid1, grid2);

      const blobUpdates = updates.filter((u) => u.kind === 'raw-blob');
      expect(blobUpdates.length).toBe(1);
      expect((blobUpdates[0] as { blob: string }).blob).toBe('BLOB_V2');
    });

    it('diff does not emit cell updates for opaque placeholder cells', () => {
      const oldGrid = emptyGrid(10, 5);
      const node = imageEl('BLOB', 4, 2, { raw: true });
      const newGrid = layout(node, 10, 5);

      const updates = diff(oldGrid, newGrid);

      // Should NOT have cell updates in the opaque region
      // (even though they changed from empty to placeholder)
      const cellUpdates = updates.filter((u) => u.kind !== 'raw-blob');
      for (const u of cellUpdates) {
        // No cell update should be within the 4x2 opaque region
        const inOpaqueRegion = u.row < 2 && u.col < 4;
        expect(inOpaqueRegion).toBe(false);
      }
    });

    it('renderUpdates skips raw blobs (they are written separately)', () => {
      const blobContent = '\x1b_Gf=100,t=d;AAAA\x1b\\';
      const updates = [{ kind: 'raw-blob' as const, row: 3, col: 5, blob: blobContent }];

      const output = renderUpdates(updates);

      // Raw blobs are NOT included in renderUpdates output
      // They are extracted via extractRawBlobs() and written directly to stdout
      expect(output).toBe('');
    });

    it('extractRawBlobs returns raw blob updates for separate stdout writes', () => {
      const blobContent = '\x1b_Gf=100,t=d;AAAA\x1b\\';
      const updates: CellUpdate[] = [
        { kind: 'raw-blob' as const, row: 3, col: 5, blob: blobContent },
        { row: 2, col: 3, char: 'X', style: { bold: true } },
      ];

      const blobs = extractRawBlobs(updates);
      expect(blobs).toHaveLength(1);
      expect(blobs[0]!.blob).toBe(blobContent);
      expect(blobs[0]!.row).toBe(3);
      expect(blobs[0]!.col).toBe(5);

      // renderUpdates should only contain the cell update, not the blob
      const output = renderUpdates(updates);
      expect(output).toContain('X');
      expect(output).not.toContain('AAAA');
    });

    it('non-raw ImageNode still works through cell grid (backward compat)', () => {
      const node = imageEl('AB\nCD', 2, 2);
      const grid = layout(node, 10, 5);

      // Should NOT have rawBlobs
      expect(grid.rawBlobs).toBeUndefined();

      // Should have cells painted normally
      expect(grid.cells[0]![0]!.char).toBe('A');
      expect(grid.cells[0]![1]!.char).toBe('B');
      expect(grid.cells[1]![0]!.char).toBe('C');
      expect(grid.cells[1]![1]!.char).toBe('D');

      // Cells should NOT have opaqueId
      expect(grid.cells[0]![0]!.opaqueId).toBeUndefined();
    });

    it('raw ImageNode composes inside a column layout', () => {
      const col: ColumnNode = {
        kind: 'column',
        children: [{ kind: 'text', content: 'Label:' }, imageEl('KITTY_ESCAPE', 4, 2, { raw: true })],
      };
      const grid = layout(col, 10, 5);

      // First row: 'Label:'
      expect(grid.cells[0]![0]!.char).toBe('L');
      expect(grid.cells[0]![5]!.char).toBe(':');

      // Image at rows 1-2 should have opaque placeholders
      expect(grid.rawBlobs).toBeDefined();
      expect(grid.rawBlobs!.size).toBe(1);

      const blob = [...grid.rawBlobs!.values()][0]!;
      expect(blob.content).toBe('KITTY_ESCAPE');
      expect(blob.row).toBe(1); // below the label
      expect(blob.col).toBe(0);
    });
  });
});
