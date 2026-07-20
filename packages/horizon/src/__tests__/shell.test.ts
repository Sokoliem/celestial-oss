import { Cmd } from '@celestial/core/nebula';
import { describe, expect, it } from 'vitest';
import { createShellModel, getRegion, type ShellMsg, type ShellUpdaters, shellUpdate } from '../shell.js';

// --- Test helpers ---

interface SidebarState {
  items: string[];
  selected: number;
}

interface HeaderState {
  title: string;
}

interface ContentState {
  body: string;
}

interface StatusBarState {
  message: string;
  level: 'info' | 'error';
}

type SidebarMsg = { type: 'select'; index: number };
type HeaderMsg = { type: 'setTitle'; title: string };
type ContentMsg = { type: 'setBody'; body: string };
type StatusBarMsg = { type: 'setMessage'; message: string; level: 'info' | 'error' };

const initialSidebar: SidebarState = { items: ['Home', 'Settings'], selected: 0 };
const initialHeader: HeaderState = { title: 'App' };
const initialContent: ContentState = { body: 'Welcome' };
const initialStatusBar: StatusBarState = { message: 'Ready', level: 'info' };

const updaters: ShellUpdaters<SidebarState, HeaderState, ContentState, StatusBarState, SidebarMsg, HeaderMsg, ContentMsg, StatusBarMsg> = {
  sidebar: (msg, model) => [{ ...model, selected: msg.index }, Cmd.none()],
  header: (msg, model) => [{ ...model, title: msg.title }, Cmd.none()],
  content: (msg, model) => [{ ...model, body: msg.body }, Cmd.none()],
  statusBar: (msg, model) => [{ ...model, message: msg.message, level: msg.level }, Cmd.none()],
};

function makeModel() {
  return createShellModel({
    sidebar: { ...initialSidebar },
    header: { ...initialHeader },
    content: { ...initialContent },
    statusBar: { ...initialStatusBar },
  });
}

// --- Tests ---

describe('createShellModel', () => {
  it('initializes all 4 regions', () => {
    const model = makeModel();

    expect(model.sidebar).toEqual(initialSidebar);
    expect(model.header).toEqual(initialHeader);
    expect(model.content).toEqual(initialContent);
    expect(model.statusBar).toEqual(initialStatusBar);
  });
});

describe('shellUpdate', () => {
  it('updates sidebar, others unchanged', () => {
    const model = makeModel();
    const msg: ShellMsg<SidebarMsg, HeaderMsg, ContentMsg, StatusBarMsg> = {
      region: 'sidebar',
      msg: { type: 'select', index: 1 },
    };

    const [next] = shellUpdate(msg, model, updaters);

    expect(next.sidebar).toEqual({ items: ['Home', 'Settings'], selected: 1 });
    expect(next.header).toBe(model.header);
    expect(next.content).toBe(model.content);
    expect(next.statusBar).toBe(model.statusBar);
  });

  it('updates header, others unchanged', () => {
    const model = makeModel();
    const msg: ShellMsg<SidebarMsg, HeaderMsg, ContentMsg, StatusBarMsg> = {
      region: 'header',
      msg: { type: 'setTitle', title: 'Dashboard' },
    };

    const [next] = shellUpdate(msg, model, updaters);

    expect(next.header).toEqual({ title: 'Dashboard' });
    expect(next.sidebar).toBe(model.sidebar);
    expect(next.content).toBe(model.content);
    expect(next.statusBar).toBe(model.statusBar);
  });

  it('updates content, others unchanged', () => {
    const model = makeModel();
    const msg: ShellMsg<SidebarMsg, HeaderMsg, ContentMsg, StatusBarMsg> = {
      region: 'content',
      msg: { type: 'setBody', body: 'New content' },
    };

    const [next] = shellUpdate(msg, model, updaters);

    expect(next.content).toEqual({ body: 'New content' });
    expect(next.sidebar).toBe(model.sidebar);
    expect(next.header).toBe(model.header);
    expect(next.statusBar).toBe(model.statusBar);
  });

  it('updates statusBar, others unchanged', () => {
    const model = makeModel();
    const msg: ShellMsg<SidebarMsg, HeaderMsg, ContentMsg, StatusBarMsg> = {
      region: 'statusBar',
      msg: { type: 'setMessage', message: 'Error!', level: 'error' },
    };

    const [next] = shellUpdate(msg, model, updaters);

    expect(next.statusBar).toEqual({ message: 'Error!', level: 'error' });
    expect(next.sidebar).toBe(model.sidebar);
    expect(next.header).toBe(model.header);
    expect(next.content).toBe(model.content);
  });
});

describe('getRegion', () => {
  it('returns correct region state for each region', () => {
    const model = makeModel();

    expect(getRegion(model, 'sidebar')).toBe(model.sidebar);
    expect(getRegion(model, 'header')).toBe(model.header);
    expect(getRegion(model, 'content')).toBe(model.content);
    expect(getRegion(model, 'statusBar')).toBe(model.statusBar);
  });
});

describe('immutability', () => {
  it('does not modify the input model', () => {
    const model = makeModel();
    const originalSidebar = model.sidebar;
    const originalHeader = model.header;
    const originalContent = model.content;
    const originalStatusBar = model.statusBar;

    const msg: ShellMsg<SidebarMsg, HeaderMsg, ContentMsg, StatusBarMsg> = {
      region: 'sidebar',
      msg: { type: 'select', index: 1 },
    };

    const [next] = shellUpdate(msg, model, updaters);

    // Original model is unchanged
    expect(model.sidebar).toBe(originalSidebar);
    expect(model.header).toBe(originalHeader);
    expect(model.content).toBe(originalContent);
    expect(model.statusBar).toBe(originalStatusBar);

    // Next is a different object
    expect(next).not.toBe(model);
    expect(next.sidebar).not.toBe(model.sidebar);
  });
});

describe('multiple updates', () => {
  it('each targets correct region independently', () => {
    const model = makeModel();

    const msg1: ShellMsg<SidebarMsg, HeaderMsg, ContentMsg, StatusBarMsg> = {
      region: 'sidebar',
      msg: { type: 'select', index: 1 },
    };
    const [after1] = shellUpdate(msg1, model, updaters);

    const msg2: ShellMsg<SidebarMsg, HeaderMsg, ContentMsg, StatusBarMsg> = {
      region: 'header',
      msg: { type: 'setTitle', title: 'New Title' },
    };
    const [after2] = shellUpdate(msg2, after1, updaters);

    const msg3: ShellMsg<SidebarMsg, HeaderMsg, ContentMsg, StatusBarMsg> = {
      region: 'content',
      msg: { type: 'setBody', body: 'Updated body' },
    };
    const [after3] = shellUpdate(msg3, after2, updaters);

    const msg4: ShellMsg<SidebarMsg, HeaderMsg, ContentMsg, StatusBarMsg> = {
      region: 'statusBar',
      msg: { type: 'setMessage', message: 'Done', level: 'info' },
    };
    const [after4] = shellUpdate(msg4, after3, updaters);

    // All regions have been independently updated
    expect(after4.sidebar).toEqual({ items: ['Home', 'Settings'], selected: 1 });
    expect(after4.header).toEqual({ title: 'New Title' });
    expect(after4.content).toEqual({ body: 'Updated body' });
    expect(after4.statusBar).toEqual({ message: 'Done', level: 'info' });

    // Original model is untouched
    expect(model.sidebar).toEqual(initialSidebar);
    expect(model.header).toEqual(initialHeader);
    expect(model.content).toEqual(initialContent);
    expect(model.statusBar).toEqual(initialStatusBar);
  });
});
