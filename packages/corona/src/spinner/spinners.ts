/**
 * 80+ built-in spinner definitions — the showcase collection.
 *
 * Organized by visual category. Every spinner is a plain SpinnerDefinition
 * that can be composed, transformed, and remixed via the composition operators.
 */

import type { SpinnerDefinition } from './types.js';

// ── Helper: quick definition ─────────────────────────────────────────────

function def(name: string, frames: readonly string[], interval = 80): SpinnerDefinition {
  return { name, frames, interval };
}

function proc(name: string, render: (tick: number) => string, interval = 80): SpinnerDefinition {
  return { name, render, interval };
}

// ══════════════════════════════════════════════════════════════════════════
//  CLASSIC
// ══════════════════════════════════════════════════════════════════════════

export const line = def('line', ['|', '/', '-', '\\'], 100);
export const simpleDots = def('simpleDots', ['.  ', '.. ', '...', '   '], 300);
export const star = def('star', ['✶', '✸', '✹', '✺', '✹', '✸'], 80);
export const triangle = def('triangle', ['◢', '◣', '◤', '◥'], 100);
export const pipe = def('pipe', ['┤', '┘', '┴', '└', '├', '┌', '┬', '┐'], 100);
export const toggle = def('toggle', ['⊶', '⊷'], 250);
export const toggle2 = def('toggle2', ['▫', '▪'], 250);
export const toggle3 = def('toggle3', ['□', '■'], 250);

// ══════════════════════════════════════════════════════════════════════════
//  DOTS & BRAILLE
// ══════════════════════════════════════════════════════════════════════════

export const dots = def('dots', ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'], 80);
export const dots2 = def('dots2', ['⣾', '⣽', '⣻', '⢿', '⡿', '⣟', '⣯', '⣷'], 80);
export const dots3 = def('dots3', ['⠋', '⠙', '⠚', '⠞', '⠖', '⠦', '⠴', '⠲', '⠳', '⠓'], 80);
export const dots4 = def('dots4', ['⠄', '⠆', '⠇', '⠋', '⠙', '⠸', '⠰', '⠠', '⠰', '⠸', '⠙', '⠋', '⠇', '⠆'], 80);
export const dots5 = def('dots5', ['⠁', '⠂', '⠄', '⡀', '⢀', '⠠', '⠐', '⠈'], 80);
export const dots6 = def('dots6', ['⠁', '⠉', '⠙', '⠚', '⠒', '⠂', '⠂', '⠒', '⠲', '⠴', '⠤', '⠄', '⠄', '⠤', '⠴', '⠲', '⠒', '⠂', '⠂', '⠒', '⠚', '⠙', '⠉', '⠁'], 80);
export const dots7 = def('dots7', ['⠈', '⠉', '⠋', '⠓', '⠒', '⠐', '⠐', '⠒', '⠖', '⠦', '⠤', '⠠', '⠠', '⠤', '⠦', '⠖', '⠒', '⠐', '⠐', '⠒', '⠓', '⠋', '⠉', '⠈'], 80);
export const dots8 = def(
  'dots8',
  ['⠁', '⠁', '⠉', '⠙', '⠚', '⠒', '⠂', '⠂', '⠒', '⠲', '⠴', '⠤', '⠄', '⠄', '⠤', '⠠', '⠠', '⠤', '⠦', '⠖', '⠒', '⠐', '⠐', '⠒', '⠓', '⠋', '⠉', '⠈', '⠈'],
  80,
);
export const dots9 = def('dots9', ['⢹', '⢺', '⢼', '⣸', '⣇', '⡧', '⡗', '⡏'], 80);
export const dots10 = def('dots10', ['⢄', '⢂', '⢁', '⡁', '⡈', '⡐', '⡠'], 80);
export const dots11 = def(
  'dots11',
  [
    '⠁',
    '⠂',
    '⠄',
    '⡀',
    '⡈',
    '⡐',
    '⡠',
    '⣀',
    '⣁',
    '⣂',
    '⣄',
    '⣌',
    '⣔',
    '⣤',
    '⣥',
    '⣦',
    '⣮',
    '⣶',
    '⣷',
    '⣿',
    '⡿',
    '⠿',
    '⢟',
    '⠟',
    '⡛',
    '⠛',
    '⠫',
    '⢋',
    '⠋',
    '⠍',
    '⡉',
    '⠉',
    '⠑',
    '⠡',
    '⢁',
  ],
  80,
);
export const dots12 = def(
  'dots12',
  [
    '⢀⠀',
    '⡀⠀',
    '⠄⠀',
    '⢂⠀',
    '⡂⠀',
    '⠅⠀',
    '⢃⠀',
    '⡃⠀',
    '⠍⠀',
    '⢋⠀',
    '⡋⠀',
    '⠍⠁',
    '⢋⠁',
    '⡋⠁',
    '⠍⠉',
    '⠋⠉',
    '⠋⠉',
    '⠉⠙',
    '⠉⠙',
    '⠉⠩',
    '⠈⢙',
    '⠈⡙',
    '⢈⠩',
    '⡂⠩',
    '⠅⠩',
    '⢃⠩',
    '⡃⠩',
    '⠍⠩',
    '⢋⠩',
    '⡋⠩',
    '⠍⠩',
    '⢋⠩',
    '⡋⠩',
    '⠍⠩',
    '⢋⠩',
    '⡋⠩',
  ],
  80,
);

export const brailleWave = proc(
  'brailleWave',
  (tick) => {
    const dots = [0x2801, 0x2802, 0x2804, 0x2840, 0x2880, 0x2820, 0x2810, 0x2808];
    let result = '';
    for (let i = 0; i < 5; i++) {
      result += String.fromCodePoint(dots[(tick + i) % dots.length]!);
    }
    return result;
  },
  100,
);

export const brailleSpiral = proc(
  'brailleSpiral',
  (tick) => {
    const spiral = [
      0x28ff, 0x287f, 0x283f, 0x281f, 0x280f, 0x2807, 0x2803, 0x2801, 0x2800, 0x2808, 0x2818, 0x2838, 0x2878, 0x28f8, 0x28f0, 0x28e0, 0x28c0, 0x2880,
    ];
    return String.fromCodePoint(spiral[tick % spiral.length]!);
  },
  60,
);

// ══════════════════════════════════════════════════════════════════════════
//  GEOMETRIC & SHAPES
// ══════════════════════════════════════════════════════════════════════════

export const circle = def('circle', ['◐', '◓', '◑', '◒'], 120);
export const circleHalf = def('circleHalf', ['◖', '◗'], 200);
export const squareCorners = def('squareCorners', ['◰', '◳', '◲', '◱'], 120);
export const diamond = def('diamond', ['◇', '◈', '◆', '◈'], 120);
export const hexagon = def('hexagon', ['⬡', '⬢'], 300);
export const circleQuarters = def('circleQuarters', ['○', '◔', '◑', '◕', '●', '◕', '◑', '◔'], 120);

export const boxBounce = def('boxBounce', ['▖', '▘', '▝', '▗'], 120);
export const boxBounce2 = def('boxBounce2', ['▌', '▀', '▐', '▄'], 100);
export const bouncingBall = def(
  'bouncingBall',
  ['( ●    )', '(  ●   )', '(   ●  )', '(    ● )', '(     ●)', '(    ● )', '(   ●  )', '(  ●   )', '( ●    )', '(●     )'],
  80,
);

export const bouncingBar = def('bouncingBar', ['[    =]', '[   = ]', '[  =  ]', '[ =   ]', '[=    ]', '[ =   ]', '[  =  ]', '[   = ]'], 80);

// ══════════════════════════════════════════════════════════════════════════
//  ARROWS & POINTERS
// ══════════════════════════════════════════════════════════════════════════

export const arrow = def('arrow', ['←', '↖', '↑', '↗', '→', '↘', '↓', '↙'], 100);
export const arrow2 = def('arrow2', ['⬆️ ', '↗️ ', '➡️ ', '↘️ ', '⬇️ ', '↙️ ', '⬅️ ', '↖️ '], 100);
export const arrow3 = def('arrow3', ['▹▹▹▹▹', '▸▹▹▹▹', '▹▸▹▹▹', '▹▹▸▹▹', '▹▹▹▸▹', '▹▹▹▹▸'], 120);
export const arrowPulse = def('arrowPulse', ['▸    ', '▸▸   ', '▸▸▸  ', '▸▸▸▸ ', '▸▸▸▸▸', ' ▸▸▸▸', '  ▸▸▸', '   ▸▸', '    ▸', '     '], 100);

export const pointer = def('pointer', ['▶', '▷'], 250);
export const fingerDance = def('fingerDance', ['🤘 ', '🤟 ', '🖖 ', '✋ ', '🤚 ', '👆 '], 160);

// ══════════════════════════════════════════════════════════════════════════
//  CLOCKS & TIME
// ══════════════════════════════════════════════════════════════════════════

export const clock = def('clock', ['🕛 ', '🕐 ', '🕑 ', '🕒 ', '🕓 ', '🕔 ', '🕕 ', '🕖 ', '🕗 ', '🕘 ', '🕙 ', '🕚 '], 100);

export const hourglass = def('hourglass', ['⏳ ', '⌛ '], 500);

// ══════════════════════════════════════════════════════════════════════════
//  PROGRESS & BARS
// ══════════════════════════════════════════════════════════════════════════

export const growHorizontal = def('growHorizontal', ['▏', '▎', '▍', '▌', '▋', '▊', '▉', '█', '▉', '▊', '▋', '▌', '▍', '▎', '▏'], 100);

export const growVertical = def('growVertical', ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█', '▇', '▆', '▅', '▄', '▃', '▂', '▁'], 100);

export const layer = def('layer', ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'], 120);

export const lineProgress = def(
  'lineProgress',
  ['━━━━━━━━━━', '▸━━━━━━━━━', '━▸━━━━━━━━', '━━▸━━━━━━━', '━━━▸━━━━━━', '━━━━▸━━━━━', '━━━━━▸━━━━', '━━━━━━▸━━━', '━━━━━━━▸━━', '━━━━━━━━▸━', '━━━━━━━━━▸'],
  80,
);

export const smiley = def('smiley', ['😄 ', '😝 '], 200);

// ══════════════════════════════════════════════════════════════════════════
//  WEATHER & NATURE
// ══════════════════════════════════════════════════════════════════════════

export const earth = def('earth', ['🌍 ', '🌎 ', '🌏 '], 180);
export const moon = def('moon', ['🌑 ', '🌒 ', '🌓 ', '🌔 ', '🌕 ', '🌖 ', '🌗 ', '🌘 '], 100);
export const weather = def('weather', ['☀️ ', '🌤 ', '⛅ ', '🌥 ', '☁️ ', '🌧 ', '⛈ ', '🌩 ', '🌨 '], 200);

// ══════════════════════════════════════════════════════════════════════════
//  AESTHETIC & ARTISTIC
// ══════════════════════════════════════════════════════════════════════════

export const aesthetic = def(
  'aesthetic',
  ['▰▱▱▱▱▱▱', '▰▰▱▱▱▱▱', '▰▰▰▱▱▱▱', '▰▰▰▰▱▱▱', '▰▰▰▰▰▱▱', '▰▰▰▰▰▰▱', '▰▰▰▰▰▰▰', '▱▰▰▰▰▰▰', '▱▱▰▰▰▰▰', '▱▱▱▰▰▰▰', '▱▱▱▱▰▰▰', '▱▱▱▱▱▰▰', '▱▱▱▱▱▱▰', '▱▱▱▱▱▱▱'],
  80,
);

export const aesthetic2 = def('aesthetic2', ['░░░░░', '▒░░░░', '▓▒░░░', '█▓▒░░', '░█▓▒░', '░░█▓▒', '░░░█▓', '░░░░█', '░░░░░'], 100);

export const matrix = proc(
  'matrix',
  (tick) => {
    const chars = 'ﾊﾐﾋｰｳｼﾅﾓﾆｻﾜﾂｵﾘｱﾎﾃﾏｹﾒｴｶｷﾑﾕﾗｾﾈｽﾀﾇﾍ012345789:・."=*+-<>¦|╌';
    let result = '';
    for (let i = 0; i < 6; i++) {
      result += chars[(tick * 3 + i * 7) % chars.length];
    }
    return result;
  },
  60,
);

export const binary = proc(
  'binary',
  (tick) => {
    let result = '';
    for (let i = 0; i < 8; i++) {
      result += (tick + i * 3) % 7 < 4 ? '1' : '0';
    }
    return result;
  },
  80,
);

export const noise = proc(
  'noise',
  (tick) => {
    const blocks = ' ░▒▓█';
    let result = '';
    // Deterministic xorshift32 PRNG seeded by tick
    let seed = ((tick + 1) * 2654435761) >>> 0;
    for (let i = 0; i < 6; i++) {
      seed = (seed ^ (seed << 13)) >>> 0;
      seed = (seed ^ (seed >>> 17)) >>> 0;
      seed = (seed ^ (seed << 5)) >>> 0;
      result += blocks[seed % blocks.length];
    }
    return result;
  },
  60,
);

export const dna = def('dna', ['╔═╗', '║╔╝', '╚║ ', ' ║╗', '╔╝║', '╚═╝'], 120);

export const pulse = def('pulse', ['█', '▓', '▒', '░', '▒', '▓'], 100);

// ══════════════════════════════════════════════════════════════════════════
//  UNICODE BLOCKS & SPECIAL
// ══════════════════════════════════════════════════════════════════════════

export const shade = def('shade', ['░', '▒', '▓', '█', '▓', '▒'], 120);
export const blockShuffle = def('blockShuffle', ['█▀▄', '▀▄█', '▄█▀'], 150);

export const runner = def('runner', ['🚶 ', '🏃 '], 200);
export const pong = def(
  'pong',
  [
    '▐⠂       ▌',
    '▐⠈       ▌',
    '▐ ⠂      ▌',
    '▐ ⠠      ▌',
    '▐  ⡀     ▌',
    '▐  ⠠     ▌',
    '▐   ⠂    ▌',
    '▐   ⠈    ▌',
    '▐    ⠂   ▌',
    '▐    ⠠   ▌',
    '▐     ⡀  ▌',
    '▐     ⠠  ▌',
    '▐      ⠂ ▌',
    '▐      ⠈ ▌',
    '▐       ⠂▌',
    '▐       ⠠▌',
    '▐       ⡀▌',
    '▐      ⠠ ▌',
    '▐      ⠂ ▌',
    '▐     ⠈  ▌',
    '▐     ⠂  ▌',
    '▐    ⠠   ▌',
    '▐    ⡀   ▌',
    '▐   ⠠    ▌',
    '▐   ⠂    ▌',
    '▐  ⠈     ▌',
    '▐  ⠂     ▌',
    '▐ ⠠      ▌',
    '▐ ⡀      ▌',
    '▐⠠       ▌',
  ],
  80,
);

export const shark = def(
  'shark',
  [
    '▐|\\____________▌',
    '▐_|\\___________▌',
    '▐__|\\__________▌',
    '▐___|\\_________ ▌',
    '▐____|\\________▌',
    '▐_____|\\_______ ▌',
    '▐______|\\______▌',
    '▐_______|\\_____ ▌',
    '▐________|\\____▌',
    '▐_________|\\___▌',
    '▐__________|\\__▌',
    '▐___________|\\_ ▌',
    '▐____________|\\▌',
    '▐____________/|▌',
    '▐___________|/ ▌',
    '▐__________|/  ▌',
    '▐_________|/   ▌',
    '▐________|/    ▌',
    '▐_______|/     ▌',
    '▐______|/      ▌',
    '▐_____|/       ▌',
    '▐____|/        ▌',
    '▐___|/         ▌',
    '▐__|/          ▌',
    '▐_|/           ▌',
    '▐|/            ▌',
  ],
  80,
);

// ══════════════════════════════════════════════════════════════════════════
//  WAVEFORMS & OSCILLATORS
// ══════════════════════════════════════════════════════════════════════════

export const sineWave = proc(
  'sineWave',
  (tick) => {
    const width = 12;
    let result = '';
    for (let i = 0; i < width; i++) {
      const y = Math.sin((tick + i) * 0.5);
      if (y > 0.5) result += '⠉';
      else if (y > 0) result += '⠒';
      else if (y > -0.5) result += '⠤';
      else result += '⣀';
    }
    return result;
  },
  60,
);

export const heartbeat = def('heartbeat', ['  ♥  ', ' ♥♥♥ ', '♥♥♥♥♥', ' ♥♥♥ ', '  ♥  ', '     ', '  ♥  ', '     '], 120);

export const breathe = proc(
  'breathe',
  (tick) => {
    const phases = ['░', '▒', '▓', '█', '▓', '▒', '░', ' '];
    const size = Math.floor((Math.sin(tick * 0.15) + 1) * 3) + 1;
    const phase = phases[tick % phases.length]!;
    return phase.repeat(size);
  },
  80,
);

// ══════════════════════════════════════════════════════════════════════════
//  ORBITAL & ROTATIONAL
// ══════════════════════════════════════════════════════════════════════════

export const orbit = proc(
  'orbit',
  (tick) => {
    const radius = 3;
    const angle = tick * 0.3;
    const x = Math.round(Math.cos(angle) * radius) + radius;
    const y = Math.round(Math.sin(angle) * (radius / 2)) + 1;
    const grid = [' ', ' ', ' ', ' ', ' ', ' ', ' '];
    grid[x] = y === 0 ? '˙' : y === 1 ? '•' : '·';
    return grid.join('');
  },
  60,
);

export const satellite = def('satellite', ['  🛰  ', ' 🛰   ', '🛰    ', ' 🛰   ', '  🛰  ', '   🛰 ', '    🛰', '   🛰 '], 100);

export const spinner4 = def('spinner4', ['◜ ', ' ◝', ' ◞', '◟ '], 100);

// ══════════════════════════════════════════════════════════════════════════
//  LOADING BARS & SCANLINES
// ══════════════════════════════════════════════════════════════════════════

export const betaWave = def('betaWave', ['ρββββββ', 'βρβββββ', 'ββρββββ', 'βββρβββ', 'ββββρββ', 'βββββρβ', 'ββββββρ'], 80);

export const fistBump = def(
  'fistBump',
  [
    '🤜\u3000\u3000\u3000\u3000🤛 ',
    '🤜\u3000\u3000\u3000\u3000🤛 ',
    '🤜\u3000\u3000\u3000\u3000🤛 ',
    '\u3000🤜\u3000\u3000🤛\u3000 ',
    '\u3000\u3000🤜🤛\u3000\u3000 ',
    '\u3000🤜✨🤛\u3000\u3000 ',
    '🤜\u3000✨\u3000🤛\u3000 ',
  ],
  140,
);

export const mindblown = def('mindblown', ['😐 ', '😐 ', '😮 ', '😮 ', '😦 ', '😦 ', '😧 ', '😧 ', '🤯 ', '💥 ', '✨ ', '\u3000 ', '😐 '], 140);

// ══════════════════════════════════════════════════════════════════════════
//  TECHNICAL & COMPUTING
// ══════════════════════════════════════════════════════════════════════════

export const squish = def('squish', ['╫', '╪'], 200);

export const toggle4 = def('toggle4', ['■', '□', '▪', '▫'], 150);

export const arc = def('arc', ['◜', '◠', '◝', '◞', '◡', '◟'], 100);

export const balloon = def('balloon', [' ', '.', 'o', 'O', '@', '*', ' '], 140);
export const balloon2 = def('balloon2', ['.', 'o', 'O', '°', 'O', 'o', '.'], 120);

export const flip = def('flip', ['_', '_', '_', '-', '`', '`', "'", '´', '-', '_', '_', '_'], 80);

export const hamburger = def('hamburger', ['☱', '☲', '☴'], 100);

export const point = def('point', ['∙∙∙', '●∙∙', '∙●∙', '∙∙●', '∙∙∙'], 125);

export const material = def(
  'material',
  [
    '█▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁',
    '██▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁',
    '███▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁',
    '████▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁',
    '██████▁▁▁▁▁▁▁▁▁▁▁▁▁▁',
    '██████▁▁▁▁▁▁▁▁▁▁▁▁▁▁',
    '███████▁▁▁▁▁▁▁▁▁▁▁▁▁',
    '████████▁▁▁▁▁▁▁▁▁▁▁▁',
    '█████████▁▁▁▁▁▁▁▁▁▁▁',
    '█████████▁▁▁▁▁▁▁▁▁▁▁',
    '██████████▁▁▁▁▁▁▁▁▁▁',
    '███████████▁▁▁▁▁▁▁▁▁',
    '█████████████▁▁▁▁▁▁▁',
    '██████████████▁▁▁▁▁▁',
    '██████████████▁▁▁▁▁▁',
    '▁██████████████▁▁▁▁▁',
    '▁▁▁██████████████▁▁▁',
    '▁▁▁▁▁████████████▁▁▁',
    '▁▁▁▁▁████████████▁▁▁',
    '▁▁▁▁▁▁████████████▁▁',
    '▁▁▁▁▁▁▁▁▁█████████▁▁',
    '▁▁▁▁▁▁▁▁▁█████████▁▁',
    '▁▁▁▁▁▁▁▁▁▁█████████▁',
    '▁▁▁▁▁▁▁▁▁▁▁████████▁',
    '▁▁▁▁▁▁▁▁▁▁▁████████▁',
    '▁▁▁▁▁▁▁▁▁▁▁▁████████',
    '▁▁▁▁▁▁▁▁▁▁▁▁▁███████',
    '▁▁▁▁▁▁▁▁▁▁▁▁▁▁██████',
    '▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁█████',
    '▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁█████',
    '█▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁████',
    '██▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁███',
    '██▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁███',
    '███▁▁▁▁▁▁▁▁▁▁▁▁▁▁███',
    '████▁▁▁▁▁▁▁▁▁▁▁▁▁▁██',
    '█████▁▁▁▁▁▁▁▁▁▁▁▁▁▁█',
    '█████▁▁▁▁▁▁▁▁▁▁▁▁▁▁█',
    '██████▁▁▁▁▁▁▁▁▁▁▁▁▁█',
    '████████▁▁▁▁▁▁▁▁▁▁▁▁',
    '█████████▁▁▁▁▁▁▁▁▁▁▁',
    '█████████▁▁▁▁▁▁▁▁▁▁▁',
    '█████████▁▁▁▁▁▁▁▁▁▁▁',
    '█████████▁▁▁▁▁▁▁▁▁▁▁',
    '███████████▁▁▁▁▁▁▁▁▁',
    '████████████▁▁▁▁▁▁▁▁',
    '████████████▁▁▁▁▁▁▁▁',
    '██████████████▁▁▁▁▁▁',
    '██████████████▁▁▁▁▁▁',
    '▁██████████████▁▁▁▁▁',
    '▁██████████████▁▁▁▁▁',
    '▁▁▁██████████████▁▁▁',
    '▁▁▁▁████████████████',
    '▁▁▁▁████████████████',
    '▁▁▁▁▁███████████████',
  ],
  17,
);

// ══════════════════════════════════════════════════════════════════════════
//  PROCEDURAL GENERATORS
// ══════════════════════════════════════════════════════════════════════════

export const clockTick = proc(
  'clockTick',
  (tick) => {
    const hour = tick % 12;
    const hands = ['🕛', '🕐', '🕑', '🕒', '🕓', '🕔', '🕕', '🕖', '🕗', '🕘', '🕙', '🕚'];
    return hands[hour]! + ' ';
  },
  100,
);

export const progressDots = proc(
  'progressDots',
  (tick) => {
    const width = 8;
    const pos = tick % (width * 2);
    const actual = pos < width ? pos : width * 2 - pos;
    return '·'.repeat(actual) + '•' + '·'.repeat(width - actual);
  },
  80,
);

export const scanner = proc(
  'scanner',
  (tick) => {
    const width = 10;
    const pos = tick % (width * 2);
    const actual = pos < width ? pos : width * 2 - pos;
    const line = '░'.repeat(width);
    return line.substring(0, actual) + '█' + line.substring(actual + 1);
  },
  60,
);

export const radar = proc(
  'radar',
  (tick) => {
    const angles = ['─', '╲', '│', '╱'];
    return `[${angles[tick % 4]}]`;
  },
  150,
);

export const typewriter = proc(
  'typewriter',
  (tick) => {
    const word = 'loading';
    const pos = tick % (word.length + 3);
    if (pos <= word.length) return word.substring(0, pos) + '▌';
    return word + ' ';
  },
  150,
);

export const glitch = proc(
  'glitch',
  (tick) => {
    const base = '████';
    const glitchChars = '░▒▓╬╫╪┼';
    let seed = tick * 1103515245 + 12345;
    let result = '';
    for (let i = 0; i < base.length; i++) {
      seed = (seed * 1103515245 + 12345) >>> 0;
      if (seed % 5 === 0) {
        result += glitchChars[seed % glitchChars.length];
      } else {
        result += base[i];
      }
    }
    return result;
  },
  50,
);

export const dvd = proc(
  'dvd',
  (tick) => {
    const width = 10;
    const x = tick % (width * 2);
    const actual = x < width ? x : width * 2 - x;
    return ' '.repeat(actual) + '■' + ' '.repeat(width - actual);
  },
  80,
);

// ══════════════════════════════════════════════════════════════════════════
//  MULTI-CHARACTER COMPOUND
// ══════════════════════════════════════════════════════════════════════════

export const train = def('train', ['🚂      ', ' 🚂     ', '  🚂    ', '   🚂   ', '    🚂  ', '     🚂 ', '      🚂'], 120);

export const christmas = def('christmas', ['🌲', '🎄'], 400);

export const grenade = def('grenade', ['،  ', '′  ', ' ´ ', ' ‾ ', '  ⸌', '  ⸊', '  |', '  ⁎', '  ⁕', ' ⚙ ', '   ', '   ', '   '], 80);

export const monkey = def('monkey', ['🙈 ', '🙈 ', '🙉 ', '🙊 '], 200);

export const nyan = def('nyan', ['╭━━━━╮  ', '│━━━━│  ', '│━━━━│  ', '╰━━━━╯  ', '╭━━━━╮ ✨', '│━━━━│ ✨', '│━━━━│ ✨', '╰━━━━╯ ✨'], 100);

// ══════════════════════════════════════════════════════════════════════════
//  REGISTRY — all built-in spinners keyed by name
// ══════════════════════════════════════════════════════════════════════════

export const all: Record<string, SpinnerDefinition> = {
  // Classic
  line,
  simpleDots,
  star,
  triangle,
  pipe,
  toggle,
  toggle2,
  toggle3,
  // Dots & Braille
  dots,
  dots2,
  dots3,
  dots4,
  dots5,
  dots6,
  dots7,
  dots8,
  dots9,
  dots10,
  dots11,
  dots12,
  brailleWave,
  brailleSpiral,
  // Geometric
  circle,
  circleHalf,
  squareCorners,
  diamond,
  hexagon,
  circleQuarters,
  boxBounce,
  boxBounce2,
  bouncingBall,
  bouncingBar,
  // Arrows
  arrow,
  arrow2,
  arrow3,
  arrowPulse,
  pointer,
  fingerDance,
  // Clocks
  clock,
  hourglass,
  // Progress
  growHorizontal,
  growVertical,
  layer,
  lineProgress,
  smiley,
  // Weather
  earth,
  moon,
  weather,
  // Aesthetic
  aesthetic,
  aesthetic2,
  matrix,
  binary,
  noise,
  dna,
  pulse,
  // Unicode blocks
  shade,
  blockShuffle,
  runner,
  pong,
  shark,
  // Waveforms
  sineWave,
  heartbeat,
  breathe,
  // Orbital
  orbit,
  satellite,
  spinner4,
  // Loading bars
  betaWave,
  fistBump,
  mindblown,
  // Technical
  squish,
  toggle4,
  arc,
  balloon,
  balloon2,
  flip,
  hamburger,
  point,
  material,
  // Procedural
  clockTick,
  progressDots,
  scanner,
  radar,
  typewriter,
  glitch,
  dvd,
  // Compound
  train,
  christmas,
  grenade,
  monkey,
  nyan,
};
