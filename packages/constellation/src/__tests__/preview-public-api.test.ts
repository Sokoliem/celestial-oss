import { describe, expect, it } from 'vitest';
import {
  alert,
  badge,
  breadcrumb,
  button,
  card,
  checkbox,
  commandPalette,
  confirmDialog,
  createToastManager,
  dataTable,
  divider,
  drawer,
  emptyState,
  list,
  modal,
  pagination,
  progressBar,
  radioGroup,
  select,
  slider,
  spinner,
  tabs,
  textarea,
  textInput,
  toggle,
  tooltip,
  tree,
} from '../index.js';
import * as ui from '../index.js';

const componentBuilders = [
  button,
  textInput,
  textarea,
  checkbox,
  radioGroup,
  select,
  toggle,
  slider,
  tabs,
  breadcrumb,
  pagination,
  commandPalette,
  dataTable,
  tree,
  list,
  progressBar,
  spinner,
  card,
  divider,
  emptyState,
  badge,
  alert,
  tooltip,
  createToastManager,
  modal,
  confirmDialog,
  drawer,
];

const excludedBuilders = ['fileExplorer', 'markdownViewer', 'terminal', 'kanbanBoard', 'imageViewer', 'notificationCenter'] as const;

describe('@celestial/ui preview surface', () => {
  it('exports the curated 27 component builders', () => {
    expect(componentBuilders).toHaveLength(27);
    for (const builder of componentBuilders) expect(builder).toBeTypeOf('function');
  });

  it('does not export experimental components', () => {
    for (const name of excludedBuilders) expect(name in ui).toBe(false);
  });
});
