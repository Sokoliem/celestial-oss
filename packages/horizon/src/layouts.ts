import { type Color, color } from '@celestial/core/corona';
import { column, flex, text, type VNode } from '@celestial/core/nebula';
import { type PanelStyle, panel } from './panel.js';
import { splitPane } from './split.js';

export interface IDELayoutConfig {
  sidebar: VNode;
  editor: VNode;
  terminal: VNode;
  sidebarRatio?: number;
  terminalRatio?: number;
  sidebarStyle?: PanelStyle;
  editorStyle?: PanelStyle;
  terminalStyle?: PanelStyle;
}

export function ideLayout(config: IDELayoutConfig): VNode {
  const { sidebar, editor, terminal, sidebarRatio = 0.2, terminalRatio = 0.4, sidebarStyle, editorStyle, terminalStyle } = config;

  const mainContent = splitPane({
    direction: 'vertical',
    ratio: terminalRatio,
    first: editorStyle ? panel({ ...editorStyle, content: editor }) : editor,
    second: terminalStyle ? panel({ ...terminalStyle, content: terminal }) : terminal,
  });

  return splitPane({
    direction: 'horizontal',
    ratio: sidebarRatio,
    first: sidebarStyle ? panel({ ...sidebarStyle, content: sidebar }) : sidebar,
    second: mainContent,
  });
}

export interface ShellLayoutConfig {
  header?: VNode;
  sidebar?: VNode;
  content: VNode;
  statusBar?: VNode;
  sidebarRatio?: number;
  sidebarStyle?: PanelStyle;
  contentStyle?: PanelStyle;
  headerStyle?: PanelStyle;
  statusStyle?: PanelStyle;
}

export function shellLayout(config: ShellLayoutConfig): VNode {
  const { header, sidebar, content, statusBar, sidebarRatio = 0.2, sidebarStyle, contentStyle, headerStyle, statusStyle } = config;

  let main: VNode;

  if (sidebar) {
    main = splitPane({
      direction: 'horizontal',
      ratio: sidebarRatio,
      first: sidebarStyle ? panel({ ...sidebarStyle, content: sidebar }) : sidebar,
      second: contentStyle ? panel({ ...contentStyle, content }) : content,
    });
  } else {
    main = contentStyle ? panel({ ...contentStyle, content }) : content;
  }

  const sections: VNode[] = [];

  if (header) {
    sections.push(headerStyle ? panel({ ...headerStyle, content: header }) : header);
  }

  // Wrap main in flex so it expands to fill the remaining height in the column
  sections.push(flex(main));

  if (statusBar) {
    sections.push(statusStyle ? panel({ ...statusStyle, content: statusBar }) : statusBar);
  }

  if (sections.length === 1) {
    return sections[0]!;
  }

  return column(...sections);
}

export interface GridLayoutConfig {
  panes: VNode[][];
  paneStyle?: PanelStyle;
}

export function gridLayout(config: GridLayoutConfig): VNode {
  const { panes, paneStyle } = config;

  if (panes.length === 0) {
    return column(text(''));
  }

  const rows: VNode[] = panes.map((rowPanes) => {
    if (rowPanes.length === 0) {
      return text('');
    }

    if (rowPanes.length === 1) {
      return paneStyle ? panel({ ...paneStyle, content: rowPanes[0]! }) : rowPanes[0]!;
    }

    const ratio = 1 / rowPanes.length;
    let result = paneStyle ? panel({ ...paneStyle, content: rowPanes[0]! }) : rowPanes[0]!;

    for (let i = 1; i < rowPanes.length; i++) {
      const pane = paneStyle ? panel({ ...paneStyle, content: rowPanes[i]! }) : rowPanes[i]!;
      result = splitPane({
        direction: 'horizontal',
        ratio: (ratio * i) / (ratio * (i + 1)),
        first: result,
        second: pane,
      });
    }

    return result;
  });

  if (rows.length === 1) {
    return rows[0]!;
  }

  const ratio = 1 / rows.length;
  let result = rows[0]!;

  for (let i = 1; i < rows.length; i++) {
    result = splitPane({
      direction: 'vertical',
      ratio: (ratio * i) / (ratio * (i + 1)),
      first: result,
      second: rows[i]!,
    });
  }

  return result;
}

export interface TabPanelConfig {
  tabs: string[];
  activeIndex: number;
  content: VNode;
  tabStyle?: 'underline' | 'bracketed' | 'pill';
  activeColor?: Color;
  inactiveColor?: Color;
  contentStyle?: PanelStyle;
}

export function tabPanel(config: TabPanelConfig): VNode {
  const { tabs, activeIndex, content, tabStyle = 'bracketed', activeColor = color.cyan, inactiveColor = color.gray, contentStyle } = config;

  const R = color.reset.fg();

  let tabBar: string;
  switch (tabStyle) {
    case 'underline':
      tabBar = tabs.map((t, i) => (i === activeIndex ? `${activeColor.fg()} ${t} ${R}${activeColor.fg()}▼${R}` : `${inactiveColor.fg()} ${t} ${R}`)).join(' ');
      break;
    case 'pill':
      tabBar = tabs.map((t, i) => (i === activeIndex ? `${activeColor.fg()}[${t}]${R}` : `${inactiveColor.fg()} ${t} ${R}`)).join(' ');
      break;
    case 'bracketed':
    default:
      tabBar = tabs
        .map((t, i) => (i === activeIndex ? `${activeColor.fg()}[ ${t} ]${R}` : `${inactiveColor.fg()}  ${t}  ${R}`))
        .join(`${inactiveColor.fg()}│${R}`);
      break;
  }

  return column(text(tabBar), contentStyle ? panel({ ...contentStyle, content }) : content);
}
