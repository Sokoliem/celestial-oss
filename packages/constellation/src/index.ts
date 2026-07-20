/**
 * @celestial/ui
 *
 * The curated component surface for the Celestial open-source preview.
 * Unlisted components are outside this focused repository and are intentionally
 * absent from this package's declarations and tarball.
 */

export type {
  ComponentDescriptor,
  FocusState,
  Orientation,
  TreeNodeBase,
} from './types.js';
export { normalizeContent } from './types.js';

export type {
  ColorScale,
  ConstellationSize,
  ConstellationTheme,
  ConstellationThemedOptions,
  ConstellationThemeInput,
  ConstellationTone,
  StateToken,
  ThemeContext,
  TokenContract,
  TypographyToken,
} from './theme.js';
export {
  applyState,
  applyTypography,
  createConstellationTheme,
  defaultConstellationTheme,
  resolveAnimatedBorderColor,
  resolveBorderStyle,
  resolveConstellationTheme,
  resolveMutedStyle,
  resolveScale,
  resolveSpacing,
  resolveTextStyle,
  resolveTheme,
  resolveToneColor,
  useTokens,
} from './theme.js';

export type { ValidationResult, Validator } from './validation.js';
export { compose, composeAll, custom, isValid, maxLength, minLength, pattern, required, validate } from './validation.js';

// Inputs
export type { ButtonConfig, ButtonVariant, ClickableTokens, ClickContext } from './clickable.js';
export { button } from './clickable.js';
export type { TextInputConfig, TextInputModel, TextInputMsg, TextInputTokens } from './text-input.js';
export { textInput, textInputContract } from './text-input.js';
export type { TextareaConfig, TextareaModel, TextareaMsg, TextareaTokens } from './textarea.js';
export { textarea, textareaContract } from './textarea.js';
export type { CheckboxConfig, CheckboxModel, CheckboxMsg, CheckboxTokens } from './checkbox.js';
export { checkbox, checkboxContract } from './checkbox.js';
export type { RadioGroupConfig, RadioGroupModel, RadioGroupMsg, RadioOption, RadioTokens } from './radio.js';
export { radioContract, radioGroup } from './radio.js';
export type { SelectConfig, SelectDisplay, SelectModel, SelectMsg, SelectOption, SelectTokens } from './select.js';
export { select, selectContract } from './select.js';
export type { ToggleConfig, ToggleModel, ToggleMsg, ToggleTokens } from './toggle.js';
export { toggle, toggleContract } from './toggle.js';
export type { SliderConfig, SliderModel, SliderMsg, SliderTokens } from './slider.js';
export { slider, sliderContract } from './slider.js';

// Navigation
export type { TabsConfig, TabsModel, TabsMsg, TabsTokens } from './tabs.js';
export { tabs, tabsContract } from './tabs.js';
export type { BreadcrumbConfig, BreadcrumbItem, BreadcrumbModel, BreadcrumbMsg, BreadcrumbTokens } from './breadcrumb.js';
export { breadcrumb, breadcrumbContract } from './breadcrumb.js';
export type { PaginationConfig, PaginationModel, PaginationMsg, PaginationTokens } from './pagination.js';
export { pagination, paginationContract } from './pagination.js';
export type {
  CommandPaletteConfig,
  CommandPaletteModel,
  CommandPaletteMsg,
  CommandPaletteTokens,
  PaletteFilter,
  PaletteSortMode,
} from './command-palette.js';
export { commandPalette, commandPaletteContract } from './command-palette.js';
export type { Command } from './palette.js';

// Data and display
export type { DataColumn, DataTableConfig, DataTableModel, DataTableMsg, DataTableTokens, SortState } from './data-table.js';
export { dataTable, dataTableContract } from './data-table.js';
export type { TreeConfig, TreeModel, TreeMsg, TreeNode, TreeNodeInfo, TreeTokens } from './tree.js';
export { tree, treeContract } from './tree.js';
export type { ListConfig, ListItem, ListTokens } from './list.js';
export { list, listContract } from './list.js';
export type {
  IndeterminateProgressConfig,
  IndeterminateProgressModel,
  IndeterminateProgressMsg,
  ProgressBarConfig,
  ProgressTokens,
  SpinnerConfig,
  SpinnerModel,
  SpinnerMsg,
  SpinnerStyle,
} from './progress.js';
export { progressBar, progressContract, spinner } from './progress.js';
export type { CardConfig, CardModel, CardMsg, CardSize, CardTokens, CardVariant } from './card.js';
export { card, cardContract } from './card.js';
export type { DividerAlign, DividerConfig, DividerTokens } from './divider.js';
export { divider, dividerContract } from './divider.js';
export type { EmptyStateAction, EmptyStateConfig, EmptyStateTokens } from './empty-state.js';
export { emptyState, emptyStateContract } from './empty-state.js';

// Feedback
export type { BadgeConfig, BadgeModel, BadgeMsg, BadgeSize, BadgeTokens, BadgeVariant } from './badge.js';
export { badge, badgeContract } from './badge.js';
export type { AlertConfig, AlertModel, AlertMsg, AlertSize, AlertTokens, AlertVariant } from './alert.js';
export { alert, alertContract } from './alert.js';
export type {
  TooltipBubbleMeasurement,
  TooltipBubbleOptions,
  TooltipConfig,
  TooltipModel,
  TooltipMsg,
  TooltipPosition,
  TooltipTokens,
  TooltipVariant,
} from './tooltip.js';
export { measureTooltipBubble, renderTooltipBubble, tooltip, tooltipContract } from './tooltip.js';
export type {
  Toast,
  ToastEntry,
  ToastLayerOptions,
  ToastLevel,
  ToastManagerConfig,
  ToastModel,
  ToastMsg,
  ToastPlacement,
  ToastTokens,
  ToastViewOptions,
} from './toast.js';
export { createToastManager, toastContract } from './toast.js';

// Layered surfaces
export type { ModalConfig, ModalModel, ModalMsg, ModalTokens } from './modal.js';
export { modal, modalContract } from './modal.js';
export type { ConfirmDialogConfig, ConfirmDialogModel, ConfirmDialogMsg, ConfirmDialogTokens } from './confirm-dialog.js';
export { confirmDialog, confirmDialogContract } from './confirm-dialog.js';
export type { DrawerBackdrop, DrawerConfig, DrawerModel, DrawerMsg, DrawerPosition, DrawerTokens, DrawerVariant } from './drawer.js';
export { drawer, drawerContract } from './drawer.js';
