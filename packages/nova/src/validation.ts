export function finiteNumber(value: number, name: string): number {
  if (!Number.isFinite(value)) throw new TypeError(`${name} must be a finite number`);
  return value;
}

export function nonNegativeNumber(value: number, name: string): number {
  const finite = finiteNumber(value, name);
  if (finite < 0) throw new RangeError(`${name} must be >= 0`);
  return finite;
}

export function clampUnit(value: number, name = 'progress'): number {
  return Math.max(0, Math.min(1, finiteNumber(value, name)));
}

export function easedProgress(easing: ((progress: number) => number) | undefined, progress: number): number {
  return clampUnit(easing ? easing(progress) : progress, 'easing result');
}
