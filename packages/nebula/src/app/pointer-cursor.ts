import type { HitRegionInfo } from '../hit-regions.js';
import {
  encodePointerCursor,
  normalizePointerCursor,
  type PointerCursor,
  supportsPointerCursorOsc22,
} from '../pointer-cursor.js';
import type { MouseEventData } from '../types.js';
import type { RuntimeContext } from './runtime-context.js';

function findTopmostHit(regions: readonly HitRegionInfo[], x: number, y: number): HitRegionInfo | null {
  for (let index = regions.length - 1; index >= 0; index--) {
    const region = regions[index]!;
    if (
      x >= region.rect.x
      && x < region.rect.x + region.rect.width
      && y >= region.rect.y
      && y < region.rect.y + region.rect.height
    ) {
      return region;
    }
  }
  return null;
}

function isCapturedAffordance(region: HitRegionInfo | null): boolean {
  return region?.metadata?.affordances?.some((affordance) => affordance === 'drag' || affordance === 'resize') ?? false;
}

export function installPointerCursor<Model, M>(ctx: RuntimeContext<Model, M>): void {
  const osc22Option = ctx.options?.pointerCursor?.osc22 ?? 'auto';
  const emitOsc22 = osc22Option === true || (osc22Option === 'auto' && supportsPointerCursorOsc22());

  function commit(cursor: PointerCursor): void {
    if (cursor === ctx.pointerCursor) return;
    ctx.pointerCursor = cursor;
    if (emitOsc22 && ctx.terminalSessionActive) {
      ctx.terminal.write(encodePointerCursor(cursor));
    }
    try {
      ctx.options?.pointerCursor?.onChange?.(cursor);
    } catch (error: unknown) {
      ctx.notifyRenderError(error);
    }
  }

  ctx.updatePointerCursor = (event: MouseEventData): void => {
    const hit = findTopmostHit(ctx.currentHitRegions, event.x, event.y);
    const hitCursor = normalizePointerCursor(hit?.metadata?.cursor);

    if (event.type === 'press' && event.button === 0 && isCapturedAffordance(hit) && hitCursor !== 'default') {
      ctx.capturedPointerCursor = hitCursor;
    }

    const next = ctx.capturedPointerCursor ?? hitCursor;
    commit(next);

    if (event.type === 'release') {
      ctx.capturedPointerCursor = null;
      commit(hitCursor);
    }
  };

  ctx.resetPointerCursor = (): void => {
    ctx.capturedPointerCursor = null;
    commit('default');
  };
}
