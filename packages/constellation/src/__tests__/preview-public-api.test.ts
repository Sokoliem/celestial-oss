import { describe, expect, it } from 'vitest';
import * as ui from '../index.js';
import {
  actionCommands,
  actionKeyBindings,
  alert,
  autocomplete,
  badge,
  breadcrumb,
  button,
  card,
  cardGrid,
  checkbox,
  checkboxGroup,
  colorPicker,
  combobox,
  commandPalette,
  confirmDialog,
  createToastManager,
  dataTable,
  datePicker,
  divider,
  drawer,
  emptyState,
  formField,
  hovercard,
  helpView,
  indeterminateProgress,
  list,
  modal,
  keyMap,
  multiSelect,
  numberInput,
  optionListView,
  pagination,
  popover,
  popoverGroup,
  progressBar,
  radioGroup,
  rangeSlider,
  rating,
  segmentedControl,
  select,
  slider,
  spinner,
  tabs,
  tagInput,
  textarea,
  textInput,
  toggle,
  toggleGroup,
  tooltip,
  tree,
  unbindableActionShortcuts,
} from '../index.js';

const componentBuilders = [
  button,
  textInput,
  textarea,
  checkbox,
  checkboxGroup,
  radioGroup,
  select,
  toggle,
  slider,
  autocomplete,
  combobox,
  datePicker,
  multiSelect,
  numberInput,
  rangeSlider,
  rating,
  segmentedControl,
  tagInput,
  colorPicker,
  formField,
  tabs,
  breadcrumb,
  pagination,
  commandPalette,
  optionListView,
  dataTable,
  tree,
  list,
  progressBar,
  indeterminateProgress,
  spinner,
  card,
  cardGrid,
  divider,
  emptyState,
  badge,
  alert,
  tooltip,
  createToastManager,
  modal,
  confirmDialog,
  drawer,
  popover,
  popoverGroup,
  hovercard,
  toggleGroup,
];

const excludedBuilders = ['fileExplorer', 'markdownViewer', 'terminal', 'kanbanBoard', 'imageViewer', 'notificationCenter'] as const;

describe('@celestial/ui preview surface', () => {
  it('exports the curated 46 component builders', () => {
    expect(componentBuilders).toHaveLength(46);
    for (const builder of componentBuilders) expect(builder).toBeTypeOf('function');
  });

  it('does not export experimental components', () => {
    for (const name of excludedBuilders) expect(name in ui).toBe(false);
  });

  it('exports the command-spine helpers from the public entrypoint', () => {
    for (const helper of [actionCommands, actionKeyBindings, unbindableActionShortcuts, keyMap, helpView]) {
      expect(helper).toBeTypeOf('function');
    }
  });
});
