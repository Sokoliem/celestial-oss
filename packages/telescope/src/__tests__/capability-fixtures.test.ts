import { describe, expect, it } from 'vitest';
import { CAPABILITY_PRESETS, type CapabilityPreset, createCapabilityFixture } from '../capability-fixtures.js';

describe('CAPABILITY_PRESETS', () => {
  it('has all expected presets', () => {
    const expected = ['kitty', 'wezterm', 'iterm2', 'xterm256', 'tmux', 'vscode', 'windowsTerminal', 'minimal'];
    for (const name of expected) {
      expect(CAPABILITY_PRESETS).toHaveProperty(name);
    }
  });

  it('each preset has a name and capabilities', () => {
    for (const [_key, preset] of Object.entries(CAPABILITY_PRESETS)) {
      expect(preset.name).toBeTruthy();
      expect(typeof preset.capabilities).toBe('object');
      expect(Object.keys(preset.capabilities).length).toBeGreaterThan(0);
    }
  });

  it('kitty supports kittyKeyboard and kittyGraphics', () => {
    expect(CAPABILITY_PRESETS.kitty.capabilities.kittyKeyboard).toBe(true);
    expect(CAPABILITY_PRESETS.kitty.capabilities.kittyGraphics).toBe(true);
  });

  it('minimal has most capabilities disabled', () => {
    const m = CAPABILITY_PRESETS.minimal.capabilities;
    expect(m.colorLevel).toBe('none');
    expect(m.kittyKeyboard).toBe(false);
    expect(m.mouseTracking).toBe(false);
    expect(m.hyperlinks).toBe(false);
    expect(m.performanceClass).toBe('low');
  });

  it('iterm2 supports iterm2Images but not kittyGraphics', () => {
    expect(CAPABILITY_PRESETS.iterm2.capabilities.iterm2Images).toBe(true);
    expect(CAPABILITY_PRESETS.iterm2.capabilities.kittyGraphics).toBe(false);
  });

  it('tmux has env with TMUX set', () => {
    expect(CAPABILITY_PRESETS.tmux.env?.TMUX).toBeTruthy();
  });

  it('windowsTerminal has env with WT_SESSION set', () => {
    expect(CAPABILITY_PRESETS.windowsTerminal.env?.WT_SESSION).toBeTruthy();
  });
});

describe('createCapabilityFixture', () => {
  it('creates mock capabilities from a preset', () => {
    const fixture = createCapabilityFixture(CAPABILITY_PRESETS.kitty);
    expect(fixture.mockCapabilities.kittyKeyboard).toBe(true);
    expect(fixture.mockCapabilities.terminalName).toBe('kitty');
  });

  it('includes env as _env in mock capabilities', () => {
    const fixture = createCapabilityFixture(CAPABILITY_PRESETS.tmux);
    const env = fixture.mockCapabilities._env as Record<string, string>;
    expect(env.TMUX).toBeTruthy();
  });

  it('withCapability passes mock caps to the callback', () => {
    const fixture = createCapabilityFixture(CAPABILITY_PRESETS.minimal);
    const result = fixture.withCapability((caps) => {
      return caps.colorLevel as string;
    });
    expect(result).toBe('none');
  });

  it('works with a custom preset', () => {
    const custom: CapabilityPreset = {
      name: 'Custom',
      capabilities: {
        colorLevel: 'truecolor',
        customFeature: true,
        version: 42,
      },
      env: { MY_VAR: 'test' },
    };

    const fixture = createCapabilityFixture(custom);
    expect(fixture.mockCapabilities.customFeature).toBe(true);
    expect(fixture.mockCapabilities.version).toBe(42);
    expect((fixture.mockCapabilities._env as Record<string, string>).MY_VAR).toBe('test');
  });

  it('does not include _env when preset has no env', () => {
    const custom: CapabilityPreset = {
      name: 'NoEnv',
      capabilities: { test: true },
    };
    const fixture = createCapabilityFixture(custom);
    expect(fixture.mockCapabilities._env).toBeUndefined();
  });
});
