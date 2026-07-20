import type { EasingFn } from './types.js';
import { assertPositiveInteger } from './validation.js';

function sampleCurveX(x1: number, x2: number, t: number): number {
  return 3 * (1 - t) * (1 - t) * t * x1 + 3 * (1 - t) * t * t * x2 + t * t * t;
}

function sampleCurveY(y1: number, y2: number, t: number): number {
  return 3 * (1 - t) * (1 - t) * t * y1 + 3 * (1 - t) * t * t * y2 + t * t * t;
}

function solveCurveX(x1: number, x2: number, x: number): number {
  let lo = 0;
  let hi = 1;
  let t = x;

  for (let i = 0; i < 20; i++) {
    const xEst = sampleCurveX(x1, x2, t);
    const err = xEst - x;
    if (Math.abs(err) < 1e-7) {
      return t;
    }
    const dxdt = 3 * (1 - t) * (1 - t) * x1 + 6 * (1 - t) * t * (x2 - x1) + 3 * t * t * (1 - x2);
    if (Math.abs(dxdt) > 1e-7) {
      t = t - err / dxdt;
      t = Math.max(0, Math.min(1, t));
    } else {
      break;
    }
  }

  lo = 0;
  hi = 1;
  t = 0.5;
  for (let i = 0; i < 50; i++) {
    const xEst = sampleCurveX(x1, x2, t);
    if (Math.abs(xEst - x) < 1e-7) {
      return t;
    }
    if (xEst < x) {
      lo = t;
    } else {
      hi = t;
    }
    t = (lo + hi) / 2;
  }
  return t;
}

const clamp01 = (t: number): number => Math.max(0, Math.min(1, t));

const halfPi = Math.PI / 2;
const twoPi = Math.PI * 2;

/**
 * Overshoot coefficient for back-easing curves. Standard CSS Easing Functions
 * Level 1 value. Consolidated per design-system review (finding C2).
 */
const BACK_OVERSHOOT = 1.70158;

/**
 * Bounce coefficient and divisor for `bounce()` and `easeOutBounce`.
 * Consolidated per design-system review (finding C3).
 */
const BOUNCE_N1 = 7.5625;
const BOUNCE_D1 = 2.75;

function bounceImpl(t: number): number {
  if (t < 1 / BOUNCE_D1) {
    return BOUNCE_N1 * t * t;
  } else if (t < 2 / BOUNCE_D1) {
    const t2 = t - 1.5 / BOUNCE_D1;
    return BOUNCE_N1 * t2 * t2 + 0.75;
  } else if (t < 2.5 / BOUNCE_D1) {
    const t2 = t - 2.25 / BOUNCE_D1;
    return BOUNCE_N1 * t2 * t2 + 0.9375;
  } else {
    const t2 = t - 2.625 / BOUNCE_D1;
    return BOUNCE_N1 * t2 * t2 + 0.984375;
  }
}

function cached(fn: EasingFn, samples = 256): EasingFn {
  if (typeof fn !== 'function') {
    throw new TypeError('cached easing function must be a function');
  }
  const count = Math.max(2, assertPositiveInteger(samples, 'samples'));
  const table = Array.from({ length: count + 1 }, (_, index) => fn(index / count));

  return (t: number): number => {
    const clamped = clamp01(t);
    const position = clamped * count;
    const lower = Math.floor(position);
    const upper = Math.min(count, lower + 1);
    const fraction = position - lower;
    const from = table[lower] ?? clamped;
    const to = table[upper] ?? from;
    return from + (to - from) * fraction;
  };
}

export const easing = {
  linear: (t: number): number => t,
  cached,

  easeIn: (t: number): number => t * t * t,
  easeOut: (t: number): number => {
    const inv = 1 - t;
    return 1 - inv * inv * inv;
  },
  easeInOut: (t: number): number => {
    if (t < 0.5) {
      return 4 * t * t * t;
    }
    const inv = -2 * t + 2;
    return 1 - (inv * inv * inv) / 2;
  },

  easeInQuad: (t: number): number => t * t,
  easeOutQuad: (t: number): number => 1 - (1 - t) * (1 - t),
  easeInOutQuad: (t: number): number => {
    if (t < 0.5) {
      return 2 * t * t;
    }
    return 1 - ((-2 * t + 2) * (-2 * t + 2)) / 2;
  },

  easeInCubic: (t: number): number => t * t * t,
  easeOutCubic: (t: number): number => {
    const inv = 1 - t;
    return 1 - inv * inv * inv;
  },
  easeInOutCubic: (t: number): number => {
    if (t < 0.5) {
      return 4 * t * t * t;
    }
    const inv = -2 * t + 2;
    return 1 - (inv * inv * inv) / 2;
  },

  easeInQuart: (t: number): number => t * t * t * t,
  easeOutQuart: (t: number): number => {
    const inv = 1 - t;
    return 1 - inv * inv * inv * inv;
  },
  easeInOutQuart: (t: number): number => {
    if (t < 0.5) {
      return 8 * t * t * t * t;
    }
    const inv = -2 * t + 2;
    return 1 - (inv * inv * inv * inv) / 2;
  },

  easeInQuint: (t: number): number => t * t * t * t * t,
  easeOutQuint: (t: number): number => {
    const inv = 1 - t;
    return 1 - inv * inv * inv * inv * inv;
  },
  easeInOutQuint: (t: number): number => {
    if (t < 0.5) {
      return 16 * t * t * t * t * t;
    }
    const inv = -2 * t + 2;
    return 1 - (inv * inv * inv * inv * inv) / 2;
  },

  easeInSine: cached((t: number): number => 1 - Math.cos(t * halfPi)),
  easeOutSine: cached((t: number): number => Math.sin(t * halfPi)),
  easeInOutSine: cached((t: number): number => -(Math.cos(Math.PI * t) - 1) / 2),

  easeInExpo: cached((t: number): number => (t === 0 ? 0 : Math.pow(2, 10 * (t - 1)))),
  easeOutExpo: cached((t: number): number => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t))),
  easeInOutExpo: cached((t: number): number => {
    if (t === 0) return 0;
    if (t === 1) return 1;
    if (t < 0.5) {
      return Math.pow(2, 20 * t - 10) / 2;
    }
    return (2 - Math.pow(2, -20 * t + 10)) / 2;
  }),

  easeInCirc: cached((t: number): number => 1 - Math.sqrt(1 - t * t)),
  easeOutCirc: cached((t: number): number => Math.sqrt(1 - (t - 1) * (t - 1))),
  easeInOutCirc: cached((t: number): number => {
    if (t < 0.5) {
      return (1 - Math.sqrt(1 - 4 * t * t)) / 2;
    }
    return (Math.sqrt(1 - (-2 * t + 2) * (-2 * t + 2)) + 1) / 2;
  }),

  easeInElastic: cached((t: number): number => {
    if (t === 0 || t === 1) return t;
    const c4 = twoPi / 3;
    return -Math.pow(2, 10 * t - 10) * Math.sin((t * 10 - 10.75) * c4);
  }),
  easeOutElastic: cached((t: number): number => {
    if (t === 0 || t === 1) return t;
    const c4 = twoPi / 3;
    return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
  }),
  easeInOutElastic: cached((t: number): number => {
    if (t === 0 || t === 1) return t;
    const c5 = twoPi / 4.5;
    if (t < 0.5) {
      return -(Math.pow(2, 20 * t - 10) * Math.sin((20 * t - 11.125) * c5)) / 2;
    }
    return (Math.pow(2, -20 * t + 10) * Math.sin((20 * t - 11.125) * c5)) / 2 + 1;
  }),

  elastic: cached((t: number): number => {
    if (t === 0 || t === 1) return t;
    const c4 = twoPi / 3;
    return 2 ** (-10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
  }),

  easeInBack: (t: number): number => {
    const c1 = BACK_OVERSHOOT;
    return (c1 + 1) * t * t * t - c1 * t * t;
  },
  easeOutBack: (t: number): number => {
    const c1 = BACK_OVERSHOOT;
    const inv = t - 1;
    return 1 + (c1 + 1) * inv * inv * inv + c1 * inv * inv;
  },
  easeInOutBack: (t: number): number => {
    const c2 = BACK_OVERSHOOT * 1.525;
    if (t < 0.5) {
      return (2 * t * (2 * t) * ((c2 + 1) * 2 * t - c2)) / 2;
    }
    const v = 2 * t - 2;
    return (v * v * ((c2 + 1) * v + c2) + 2) / 2;
  },

  backIn: (t: number): number => {
    const c1 = BACK_OVERSHOOT;
    return (c1 + 1) * t * t * t - c1 * t * t;
  },
  backOut: (t: number): number => {
    const c1 = BACK_OVERSHOOT;
    const inv = t - 1;
    return 1 + (c1 + 1) * inv * inv * inv + c1 * inv * inv;
  },
  backInOut: (t: number): number => {
    const c2 = BACK_OVERSHOOT * 1.525;
    if (t < 0.5) {
      return (2 * t * (2 * t) * ((c2 + 1) * 2 * t - c2)) / 2;
    }
    const v = 2 * t - 2;
    return (v * v * ((c2 + 1) * v + c2) + 2) / 2;
  },

  easeInBounce: (t: number): number => 1 - bounceImpl(1 - t),
  easeOutBounce: (t: number): number => bounceImpl(t),
  easeInOutBounce: (t: number): number => {
    if (t < 0.5) {
      return (1 - bounceImpl(1 - 2 * t)) / 2;
    }
    return (1 + bounceImpl(2 * t - 1)) / 2;
  },

  bounce: (t: number): number => bounceImpl(t),

  cubicBezier: (x1: number, y1: number, x2: number, y2: number): EasingFn => {
    if (x1 < 0 || x1 > 1 || x2 < 0 || x2 > 1) {
      throw new RangeError(`cubicBezier x1 and x2 must be in [0, 1], got x1=${x1}, x2=${x2}`);
    }
    return (t: number): number => {
      t = clamp01(t);
      if (t === 0) return 0;
      if (t === 1) return 1;
      const solvedT = solveCurveX(x1, x2, t);
      return sampleCurveY(y1, y2, solvedT);
    };
  },

  steps: (steps: number, jumpStart = false): EasingFn => {
    const count = assertPositiveInteger(steps, 'steps');
    return (t: number): number => {
      const clamped = clamp01(t);
      const step = jumpStart ? Math.floor(clamped * count) : Math.ceil(clamped * count);
      return clamp01(step / count);
    };
  },
} as const;
