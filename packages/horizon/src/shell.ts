import { Cmd } from '@celestial/core/nebula';

// --- Types ---

export interface ShellModel<S = unknown, H = unknown, C = unknown, B = unknown> {
  sidebar: S;
  header: H;
  content: C;
  statusBar: B;
}

export type ShellRegion = 'sidebar' | 'header' | 'content' | 'statusBar';

export type ShellMsg<SM = unknown, HM = unknown, CM = unknown, BM = unknown> =
  | { region: 'sidebar'; msg: SM }
  | { region: 'header'; msg: HM }
  | { region: 'content'; msg: CM }
  | { region: 'statusBar'; msg: BM };

export interface ShellUpdaters<S, H, C, B, SM, HM, CM, BM> {
  sidebar: (msg: SM, model: S) => [S, Cmd<SM>];
  header: (msg: HM, model: H) => [H, Cmd<HM>];
  content: (msg: CM, model: C) => [C, Cmd<CM>];
  statusBar: (msg: BM, model: B) => [B, Cmd<BM>];
}

// --- Functions ---

/**
 * Creates a ShellModel with the provided initial values for each region.
 */
export function createShellModel<S, H, C, B>(init: { sidebar: S; header: H; content: C; statusBar: B }): ShellModel<S, H, C, B> {
  return {
    sidebar: init.sidebar,
    header: init.header,
    content: init.content,
    statusBar: init.statusBar,
  };
}

/**
 * Routes a message to the correct region's updater. Only the targeted region
 * is updated; all other regions are preserved by reference.
 */
export function shellUpdate<S, H, C, B, SM, HM, CM, BM>(
  msg: ShellMsg<SM, HM, CM, BM>,
  model: ShellModel<S, H, C, B>,
  updaters: ShellUpdaters<S, H, C, B, SM, HM, CM, BM>,
): [ShellModel<S, H, C, B>, Cmd<ShellMsg<SM, HM, CM, BM>>] {
  switch (msg.region) {
    case 'sidebar': {
      const [nextSidebar, cmd] = updaters.sidebar(msg.msg, model.sidebar);
      return [{ ...model, sidebar: nextSidebar }, Cmd.map(cmd, (m) => ({ region: 'sidebar', msg: m }))];
    }
    case 'header': {
      const [nextHeader, cmd] = updaters.header(msg.msg, model.header);
      return [{ ...model, header: nextHeader }, Cmd.map(cmd, (m) => ({ region: 'header', msg: m }))];
    }
    case 'content': {
      const [nextContent, cmd] = updaters.content(msg.msg, model.content);
      return [{ ...model, content: nextContent }, Cmd.map(cmd, (m) => ({ region: 'content', msg: m }))];
    }
    case 'statusBar': {
      const [nextStatusBar, cmd] = updaters.statusBar(msg.msg, model.statusBar);
      return [{ ...model, statusBar: nextStatusBar }, Cmd.map(cmd, (m) => ({ region: 'statusBar', msg: m }))];
    }
  }
}

/**
 * Returns the state for the specified region.
 */
export function getRegion<S, H, C, B>(model: ShellModel<S, H, C, B>, region: ShellRegion): S | H | C | B {
  return model[region];
}
