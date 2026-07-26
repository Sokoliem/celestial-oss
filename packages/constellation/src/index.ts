/**
 * @celestial/ui
 *
 * The curated component surface for the Celestial open-source preview.
 * Unlisted components are outside this focused repository and are intentionally
 * absent from this package's declarations and tarball.
 */

// Command spine: one action registry drives palette entries and key bindings,
// so a shortcut and the command that advertises it cannot disagree.
export type { ActionCommandOptions, ActionKeyBindingOptions, UnbindableShortcut, UnbindableShortcutReason } from './actions.js';
export { actionCommands, actionKeyBindings, formatActionShortcut, unbindableActionShortcuts } from './actions.js';
export type { AlertConfig, AlertModel, AlertMsg, AlertSize, AlertTokens, AlertVariant } from './alert.js';
export { alert, alertContract } from './alert.js';
export type {
  AppShell,
  AppShellActionSource,
  AppShellConfig,
  AppShellConfirmState,
  AppShellContext,
  AppShellDiagnostic,
  AppShellDiagnosticCode,
  AppShellModel,
  AppShellModelSeed,
  AppShellMsg,
  AppShellNotificationOptions,
  AppShellProjection,
  AppShellReceipt,
  AppShellShortcut,
  AppShellShortcutName,
  AppShellShortcuts,
  AppShellStatusOptions,
  AppShellStatusSections,
  AppShellTaskMessage,
  AppShellTaskMessages,
  AppShellTaskRecord,
  AppShellTaskSummary,
  AppShellToastOptions,
  AppShellUpdateResult,
} from './app-shell.js';
export {
  AppShellValidationError,
  createAppShell,
  getAppShellTaskMessage,
  summarizeAppShellTasks,
} from './app-shell.js';
export type { AutocompleteConfig, AutocompleteModel, AutocompleteMsg, AutocompleteTokens } from './autocomplete.js';
export { autocomplete, autocompleteContract } from './autocomplete.js';
// Feedback
export type { BadgeConfig, BadgeModel, BadgeMsg, BadgeSize, BadgeTokens, BadgeVariant } from './badge.js';
export { badge, badgeContract } from './badge.js';
export type { BreadcrumbConfig, BreadcrumbItem, BreadcrumbModel, BreadcrumbMsg, BreadcrumbTokens } from './breadcrumb.js';
export { breadcrumb, breadcrumbContract } from './breadcrumb.js';
export type { CardConfig, CardGridConfig, CardGridModel, CardGridMsg, CardModel, CardMsg, CardSize, CardTokens, CardVariant } from './card.js';
export { card, cardContract, cardGrid } from './card.js';
export type {
  CheckboxConfig,
  CheckboxGroupConfig,
  CheckboxGroupModel,
  CheckboxGroupMsg,
  CheckboxGroupOption,
  CheckboxModel,
  CheckboxMsg,
  CheckboxTokens,
} from './checkbox.js';
export { checkbox, checkboxContract, checkboxGroup } from './checkbox.js';
// Inputs
export type { ButtonConfig, ButtonVariant, ClickableTokens, ClickContext } from './clickable.js';
export { button } from './clickable.js';
export type {
  ColorPickerBounds,
  ColorPickerConfig,
  ColorPickerField,
  ColorPickerHelpInfo,
  ColorPickerHit,
  ColorPickerHoverTarget,
  ColorPickerLayout,
  ColorPickerModel,
  ColorPickerMsg,
  ColorPickerSliderField,
  ColorPickerTokens,
  HSL,
  RGB,
} from './color-picker.js';
export {
  colorPicker,
  colorPickerContract,
  getColorPickerHelp,
  getColorPickerHelpWithLabels,
  getColorPickerHit,
  getColorPickerLayout,
  getColorPickerSliderValue,
  hexToRgb,
  hslToRgb,
  rgbToHex,
  rgbToHsl,
} from './color-picker.js';
export type { ComboboxConfig, ComboboxModel, ComboboxMsg, ComboboxOption, ComboboxTokens } from './combobox.js';
export { combobox, comboboxContract } from './combobox.js';
export type {
  CommandPaletteConfig,
  CommandPaletteModel,
  CommandPaletteMsg,
  CommandPaletteTokens,
  PaletteFilter,
  PaletteSortMode,
} from './command-palette.js';
export { commandPalette, commandPaletteContract } from './command-palette.js';
export type { ConfirmDialogConfig, ConfirmDialogModel, ConfirmDialogMsg, ConfirmDialogTokens } from './confirm-dialog.js';
export { confirmDialog, confirmDialogContract } from './confirm-dialog.js';
export type { ContextMenuMsg, ContextMenuState, MenuItem, SubmenuStackEntry } from './context-menu.js';
export { contextMenuUpdate, createContextMenuState, getActiveItems, getSelectedItem } from './context-menu.js';
export type {
  ContextMenuLayout,
  ContextMenuLayoutOptions,
  ContextMenuViewOptions,
  ContextMenuViewTokens,
  MeasureContextMenuItemWidthOptions,
} from './context-menu-view.js';
export { contextMenuView, measureContextMenuItemWidth, measureContextMenuLayout } from './context-menu-view.js';
// Data and display
export type { DataColumn, DataTableConfig, DataTableModel, DataTableMsg, DataTableTokens, SortState } from './data-table.js';
export { dataTable, dataTableContract } from './data-table.js';
export type { DatePickerConfig, DatePickerModel, DatePickerMsg, DatePickerTokens, SimpleDate } from './date-picker.js';
export { datePicker, datePickerContract, daysInMonth, firstDayOfMonth, getToday, isSameDay } from './date-picker.js';
export type { DividerAlign, DividerConfig, DividerTokens } from './divider.js';
export { divider, dividerContract } from './divider.js';
export type { DrawerAction, DrawerBackdrop, DrawerConfig, DrawerModel, DrawerMsg, DrawerPosition, DrawerTokens, DrawerVariant } from './drawer.js';
export { drawer, drawerContract } from './drawer.js';
export type { EmptyStateAction, EmptyStateConfig, EmptyStateTokens } from './empty-state.js';
export { emptyState, emptyStateContract } from './empty-state.js';
export type { FormFieldConfig, FormFieldTokens } from './form-field.js';
export { formField, formFieldContract } from './form-field.js';
export type { HovercardConfig, HovercardModel, HovercardMsg } from './hovercard.js';
export { hovercard } from './hovercard.js';
export type { HelpViewOptions, KeyBinding } from './keyboard.js';
export { formatDisplayKey, formatKeyBinding, getMatchingKeyBinding, helpView, keyMap, matchesKeyBinding } from './keyboard.js';
export type { ListConfig, ListItem, ListTokens } from './list.js';
export { list, listContract } from './list.js';
// Layered surfaces
export type { ModalConfig, ModalModel, ModalMsg, ModalTokens } from './modal.js';
export { modal, modalContract } from './modal.js';
export type { MultiSelectConfig, MultiSelectModel, MultiSelectMsg, MultiSelectOption, MultiSelectTokens } from './multi-select.js';
export { multiSelect, multiSelectContract } from './multi-select.js';
export type {
  NotificationCenter,
  NotificationCenterAction,
  NotificationCenterActionCursor,
  NotificationCenterActionReceipt,
  NotificationCenterConfig,
  NotificationCenterHoverTarget,
  NotificationCenterMsg,
  NotificationCenterState,
  NotificationCenterTokens,
  NotificationCenterUpdate,
  NotificationCenterViewport,
} from './notification-center.js';
export { createNotificationCenter, notificationCenterContract } from './notification-center.js';
export type {
  NotificationDelivery,
  NotificationDiagnostic,
  NotificationDiagnosticCode,
  NotificationEnqueueInput,
  NotificationEnqueueValue,
  NotificationEntry,
  NotificationId,
  NotificationLevel,
  NotificationModel,
  NotificationModelSeed,
  NotificationPausedToast,
  NotificationStore,
  NotificationStoreConfig,
  NotificationStoreResult,
} from './notification-store.js';
export { createNotificationStore } from './notification-store.js';
export type { NumberInputConfig, NumberInputModel, NumberInputMsg, NumberInputTokens } from './number-input.js';
export { numberInput, numberInputContract } from './number-input.js';
export type { OptionListConfig, OptionListFilter, OptionListItem, OptionListModel, OptionListMsg, OptionListTokens } from './option-list-view.js';
export { filterByFuzzy, filterByLabel, optionListContract, optionListView } from './option-list-view.js';
export type { PaginationConfig, PaginationModel, PaginationMsg, PaginationTokens } from './pagination.js';
export { pagination, paginationContract } from './pagination.js';
export type { Command } from './palette.js';
export type { PopoverConfig, PopoverGroupConfig, PopoverModel, PopoverMsg, PopoverPosition, PopoverTokens, PopoverVariant } from './popover.js';
export { popover, popoverContract, popoverGroup } from './popover.js';
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
export { indeterminateProgress, progressBar, progressContract, spinner } from './progress.js';
export type { RadioGroupConfig, RadioGroupModel, RadioGroupMsg, RadioOption, RadioTokens } from './radio.js';
export { radioContract, radioGroup } from './radio.js';
export type { RangeSliderConfig, RangeSliderModel, RangeSliderMsg, RangeSliderTokens } from './range-slider.js';
export { rangeSlider, rangeSliderContract, rangeSliderDragTest, rangeSliderHitTest } from './range-slider.js';
export type { RatingConfig, RatingModel, RatingMsg, RatingTokens } from './rating.js';
export { rating, ratingContract } from './rating.js';
export type { SegmentedControlConfig, SegmentedControlModel, SegmentedControlMsg, SegmentedControlTokens } from './segmented-control.js';
export { segmentedControl, segmentedControlContract, segmentedControlHitTest } from './segmented-control.js';
export type { SelectConfig, SelectDisplay, SelectModel, SelectMsg, SelectOption, SelectTokens } from './select.js';
export { select, selectContract } from './select.js';
export type { SliderConfig, SliderModel, SliderMsg, SliderTokens } from './slider.js';
export { slider, sliderContract } from './slider.js';
export type { StatusBarConfig, StatusBarModel, StatusBarMsg, StatusBarSection, StatusBarTokens } from './status-bar.js';
export { statusBar, statusBarContract } from './status-bar.js';
// Navigation
export type { TabsConfig, TabsModel, TabsMsg, TabsTokens } from './tabs.js';
export { tabs, tabsContract } from './tabs.js';
export type { TagInputConfig, TagInputModel, TagInputMsg, TagInputTokens } from './tag-input.js';
export { tagInput, tagInputContract, tagInputHitTest } from './tag-input.js';
export type { TextInputConfig, TextInputModel, TextInputMsg, TextInputTokens } from './text-input.js';
export { textInput, textInputContract } from './text-input.js';
export type { TextareaConfig, TextareaModel, TextareaMsg, TextareaTokens } from './textarea.js';
export { textarea, textareaContract } from './textarea.js';
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
export type {
  Toast,
  ToastEnqueueResult,
  ToastEnqueueValue,
  ToastEntry,
  ToastInteractionState,
  ToastLayerOptions,
  ToastLevel,
  ToastManagerConfig,
  ToastModel,
  ToastMsg,
  ToastPlacement,
  ToastProjectionResult,
  ToastTokens,
  ToastViewOptions,
} from './toast.js';
export { createToastManager, ToastValidationError, toastContract } from './toast.js';
export type { ToggleConfig, ToggleGroupConfig, ToggleGroupModel, ToggleGroupMsg, ToggleModel, ToggleMsg, ToggleTokens } from './toggle.js';
export { toggle, toggleContract, toggleGroup } from './toggle.js';
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
export type { TreeConfig, TreeModel, TreeMsg, TreeNode, TreeNodeInfo, TreeTokens } from './tree.js';
export { tree, treeContract } from './tree.js';
export type {
  ComponentDescriptor,
  FocusState,
  Orientation,
  TreeNodeBase,
} from './types.js';
export { normalizeContent } from './types.js';
export type { ValidationResult, Validator } from './validation.js';
export { compose, composeAll, custom, isValid, maxLength, minLength, pattern, required, validate } from './validation.js';
// The hardened uniform-windowing kernel. Implemented, guarded and unit-tested,
// but never re-exported, so no consumer of @celestial/ui could reach it.
export type { VirtualScrollConfig, VirtualScrollMsg, VirtualScrollState, VisibleRange } from './virtual-scroll.js';
export { createVirtualScrollState, getVisibleRange, scrollToIndex, virtualScrollUpdate } from './virtual-scroll.js';
