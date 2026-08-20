import { describe, expect, it } from 'vitest';
import { createDevTools } from '../devtools/inspector.js';
import { text } from '../elements.js';

describe('In-Terminal DevTools', () => {
  it('initializes with default options and records messages', () => {
    const devtools = createDevTools({ enabled: true });
    expect(devtools.state.mode).toBe('none');
    expect(devtools.state.messages.length).toBe(0);

    devtools.recordMessage({ type: 'INCREMENT', count: 1 });
    devtools.recordMessage({ type: 'SUBMIT_FORM' });

    expect(devtools.state.messages.length).toBe(2);
    expect(devtools.state.messages[0]?.type).toBe('INCREMENT');
    expect(devtools.state.messages[1]?.type).toBe('SUBMIT_FORM');
  });

  it('cycles through inspector modes', () => {
    const devtools = createDevTools({ enabled: true });
    expect(devtools.state.mode).toBe('none');

    devtools.toggleMode();
    expect(devtools.state.mode).toBe('messages');

    devtools.toggleMode();
    expect(devtools.state.mode).toBe('layout');

    devtools.toggleMode();
    expect(devtools.state.mode).toBe('hitboxes');

    devtools.toggleMode();
    expect(devtools.state.mode).toBe('none');
  });

  it('renders overlay on top of base VNode when active', () => {
    const devtools = createDevTools({ enabled: true, initialMode: 'messages' });
    devtools.recordMessage({ type: 'APP_START' });

    const base = text('Hello World');
    const overlaid = devtools.renderOverlay(base);

    // layerStack returns a row containing the base and the overlay
    expect(overlaid.kind).toBe('row');
  });

  it('returns base tree untouched when disabled or mode is none', () => {
    const devtools = createDevTools({ enabled: false });
    const base = text('Hello World');
    const result = devtools.renderOverlay(base);
    expect(result).toBe(base);
  });
});
