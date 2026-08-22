import type { DragState, LayoutRect, MouseEventData } from '@celestial/core';
import type { WindowManager, WindowManagerPointerState, WorkspaceModel } from '@celestial/horizon';
import type { SchemaFormModel, SchemaFormMsg, WizardModel, WizardMsg } from '@celestial/orbit';
import type {
  AutocompleteModel,
  AutocompleteMsg,
  BreadcrumbModel,
  BreadcrumbMsg,
  CardGridModel,
  CardGridMsg,
  CheckboxGroupModel,
  CheckboxGroupMsg,
  CheckboxModel,
  CheckboxMsg,
  ColorPickerModel,
  ColorPickerMsg,
  ComboboxModel,
  ComboboxMsg,
  CommandPaletteModel,
  CommandPaletteMsg,
  ConfirmDialogModel,
  ConfirmDialogMsg,
  ContextMenuMsg,
  ContextMenuState,
  DataTableModel,
  DataTableMsg,
  DatePickerModel,
  DatePickerMsg,
  DrawerModel,
  DrawerMsg,
  HovercardModel,
  HovercardMsg,
  ModalModel,
  ModalMsg,
  MultiSelectModel,
  MultiSelectMsg,
  NumberInputModel,
  NumberInputMsg,
  OptionListModel,
  OptionListMsg,
  PaginationModel,
  PaginationMsg,
  PopoverModel,
  PopoverGroupModel,
  PopoverMsg,
  RadioGroupModel,
  RadioGroupMsg,
  RangeSliderModel,
  RangeSliderMsg,
  RatingModel,
  RatingMsg,
  SegmentedControlModel,
  SegmentedControlMsg,
  SelectModel,
  SelectMsg,
  SliderModel,
  SliderMsg,
  ScrollbarModel,
  ScrollbarMsg,
  TabsModel,
  TabsMsg,
  TagInputModel,
  TagInputMsg,
  TextareaModel,
  TextareaMsg,
  TextInputModel,
  TextInputMsg,
  ToastModel,
  ToastMsg,
  ToggleGroupModel,
  ToggleGroupMsg,
  ToggleModel,
  ToggleMsg,
  ToolCallModel,
  ToolCallMsg,
  TooltipModel,
  TooltipMsg,
  TreeModel,
  TreeMsg,
  VirtualListModel,
  VirtualListMsg,
} from '@celestial/ui';
import type {
  AppShellLabModel,
  AppShellLabMsg,
} from './app-shell-lab.js';

export interface ShowcaseGalleryModels {
  checkboxGroup: CheckboxGroupModel;
  toggleGroup: ToggleGroupModel;
  autocomplete: AutocompleteModel;
  combobox: ComboboxModel;
  datePicker: DatePickerModel;
  multiSelect: MultiSelectModel;
  numberInput: NumberInputModel;
  rangeSlider: RangeSliderModel;
  rating: RatingModel;
  segmentedControl: SegmentedControlModel;
  tagInput: TagInputModel;
  colorPicker: ColorPickerModel;
  optionList: OptionListModel<string>;
  scrollbar: ScrollbarModel;
  virtualList: VirtualListModel<ShowcaseVirtualReceipt>;
  cardGrid: CardGridModel;
  popover: PopoverModel;
  popoverGroup: PopoverGroupModel;
  hovercard: HovercardModel;
  toolCall: ToolCallModel;
}

export interface ShowcaseVirtualReceipt {
  id: string;
  label: string;
  disabled?: boolean;
}

export type ShowcaseGalleryComponentMsg =
  | { id: 'checkboxGroup'; msg: CheckboxGroupMsg }
  | { id: 'toggleGroup'; msg: ToggleGroupMsg }
  | { id: 'autocomplete'; msg: AutocompleteMsg }
  | { id: 'combobox'; msg: ComboboxMsg }
  | { id: 'datePicker'; msg: DatePickerMsg }
  | { id: 'multiSelect'; msg: MultiSelectMsg }
  | { id: 'numberInput'; msg: NumberInputMsg }
  | { id: 'rangeSlider'; msg: RangeSliderMsg }
  | { id: 'rating'; msg: RatingMsg }
  | { id: 'segmentedControl'; msg: SegmentedControlMsg }
  | { id: 'tagInput'; msg: TagInputMsg }
  | { id: 'colorPicker'; msg: ColorPickerMsg }
  | { id: 'optionList'; msg: OptionListMsg }
  | { id: 'scrollbar'; msg: ScrollbarMsg }
  | { id: 'virtualList'; msg: VirtualListMsg<ShowcaseVirtualReceipt> }
  | { id: 'cardGrid'; msg: CardGridMsg }
  | { id: 'popover'; msg: PopoverMsg }
  | { id: 'popoverGroup'; msg: PopoverMsg }
  | { id: 'hovercard'; msg: HovercardMsg }
  | { id: 'toolCall'; msg: ToolCallMsg };

export type LabId =
  | 'core'
  | 'components'
  | 'workflows'
  | 'visuals'
  | 'mouse'
  | 'layers'
  | 'windows'
  | 'smoke'
  | 'app-shell';
export type ViewportTier = 'compact' | 'medium' | 'wide';
export type CorePage = 'foundations' | 'locale' | 'ledger';
export type ComponentFocus = 'none' | 'text' | 'textarea' | 'checkbox' | 'radio' | 'select' | 'toggle' | 'slider' | 'tabs' | 'pagination' | 'table' | 'tree';
export type SurfaceId = 'modal' | 'confirm' | 'drawer' | 'tooltip' | 'palette' | 'toast';
export type SmokeId =
  | 'core'
  | 'component'
  | 'workflow'
  | 'visual'
  | 'locale'
  | 'mouse-click'
  | 'mouse-drag'
  | 'context-menu'
  | 'layer'
  | 'adaptive'
  | 'window'
  | 'app-shell'
  | 'help';

export interface SmokeEvidence {
  coreVisits: number;
  componentChanges: number;
  workflowAdvances: number;
  visualVisits: number;
  localeChanges: number;
  mouseClicks: number;
  payloadDrops: number;
  contextMenus: number;
  layersOpened: number;
  breakpointCrossings: number;
  windowChanges: number;
  appShellActions: number;
  helpOpens: number;
}

export type ShowcaseContextAction =
  | { type: 'run-action'; action: string }
  | { type: 'switch-lab'; lab: LabId }
  | { type: 'open-help'; lab: LabId }
  | { type: 'next-receipt' }
  | { type: 'window-action'; id: string; action: 'focus' | 'close' | 'minimize' | 'maximize' | 'fullscreen' | 'restore' }
  | { type: 'reset' }
  | { type: 'close' };

export interface ShowcaseWorkspace {
  id: 'flight' | 'systems' | 'verification';
  name: string;
  summary: string;
}

export interface PointerTelemetry {
  x: number;
  y: number;
  type: MouseEventData['type'] | 'idle';
  target: string;
  clicks: number;
  hovering: boolean;
}

export interface MouseDragPayload {
  id: 'verification-receipt';
  label: string;
}

export interface ElementMouseReceipt {
  handlerTag: string;
  elementId: string;
  x: number;
  y: number;
  type?: MouseEventData['type'];
  deltaY?: number;
  currentTargetRect?: LayoutRect;
  stopPropagation(): void;
}

export interface CelestialShowcaseModel {
  cols: number;
  rows: number;
  tick: number;
  activeLab: LabId;
  previousTier: ViewportTier;
  evidence: SmokeEvidence;
  completed: Set<SmokeId>;
  lastAction: string;
  corePage: CorePage;
  localeIndex: number;
  ledgerPage: number;
  visualPage: number;
  visualVariant: number;
  workflowPage: number;
  workflowVariant: number;
  windowPage: number;
  windowVariant: number;
  componentPage: number;
  componentFocus: ComponentFocus;
  helpOpen: boolean;
  contextMenu: ContextMenuState<ShowcaseContextAction>;
  contextMenuSource: string | null;
  galleryContextMenu: ContextMenuState<string>;
  galleryModels: ShowcaseGalleryModels;
  hoveredRegion: string | null;
  shelfHoveredWindowId: string | null;
  pointer: PointerTelemetry;
  dragDemo: DragState<MouseDragPayload>;
  droppedReceipts: number;
  lastDroppedReceipt: string | null;
  windowPointer: WindowManagerPointerState;
  workspaces: WorkspaceModel<ShowcaseWorkspace>;
  windows: WindowManager;
  textInput: TextInputModel;
  textarea: TextareaModel;
  checkbox: CheckboxModel;
  radio: RadioGroupModel;
  select: SelectModel;
  toggle: ToggleModel;
  slider: SliderModel;
  tabs: TabsModel;
  breadcrumb: BreadcrumbModel;
  pagination: PaginationModel;
  table: DataTableModel;
  tree: TreeModel;
  schemaForm: SchemaFormModel;
  wizard: WizardModel;
  tooltip: TooltipModel;
  toast: ToastModel;
  modal: ModalModel;
  confirm: ConfirmDialogModel;
  drawer: DrawerModel;
  palette: CommandPaletteModel;
  appShellLab: AppShellLabModel;
}

export type CelestialShowcaseMsg =
  | { type: 'switch-lab'; lab: LabId }
  | { type: 'next-lab'; delta: 1 | -1 }
  | { type: 'resize'; cols: number; rows: number }
  | { type: 'tick' }
  | { type: 'element-mouse'; event: ElementMouseReceipt }
  | { type: 'raw-mouse'; event: MouseEventData }
  | { type: 'context-menu'; msg: ContextMenuMsg<ShowcaseContextAction> }
  | { type: 'context-menu-activate' }
  | { type: 'open-context-menu-keyboard' }
  | { type: 'run-action'; action: string }
  | { type: 'component-page'; page: number }
  | { type: 'core-page'; page: CorePage }
  | { type: 'locale-cycle'; delta: 1 | -1 }
  | { type: 'ledger-cycle'; delta: 1 | -1 }
  | { type: 'visual-page'; delta: 1 | -1 }
  | { type: 'visual-variant' }
  | { type: 'workflow-page'; delta: 1 | -1 }
  | { type: 'workflow-variant' }
  | { type: 'window-page'; delta: 1 | -1 }
  | { type: 'window-variant' }
  | { type: 'gallery-component'; component: ShowcaseGalleryComponentMsg }
  | { type: 'gallery-context-menu'; open: boolean }
  | { type: 'component-focus'; focus: ComponentFocus }
  | { type: 'text-input'; msg: TextInputMsg }
  | { type: 'textarea'; msg: TextareaMsg }
  | { type: 'checkbox'; msg: CheckboxMsg }
  | { type: 'radio'; msg: RadioGroupMsg }
  | { type: 'select'; msg: SelectMsg }
  | { type: 'toggle'; msg: ToggleMsg }
  | { type: 'slider'; msg: SliderMsg }
  | { type: 'tabs'; msg: TabsMsg }
  | { type: 'breadcrumb'; msg: BreadcrumbMsg }
  | { type: 'pagination'; msg: PaginationMsg }
  | { type: 'table'; msg: DataTableMsg }
  | { type: 'tree'; msg: TreeMsg }
  | { type: 'schema-form'; msg: SchemaFormMsg }
  | { type: 'wizard'; msg: WizardMsg }
  | { type: 'tooltip'; msg: TooltipMsg }
  | { type: 'toast'; msg: ToastMsg }
  | { type: 'modal'; msg: ModalMsg }
  | { type: 'confirm'; msg: ConfirmDialogMsg }
  | { type: 'drawer'; msg: DrawerMsg }
  | { type: 'palette'; msg: CommandPaletteMsg }
  | { type: 'app-shell-lab'; msg: AppShellLabMsg }
  | { type: 'help-surface'; msg: DrawerMsg }
  | { type: 'open-help' }
  | { type: 'open-surface'; surface: SurfaceId }
  | { type: 'switch-workspace'; index: number }
  | { type: 'window-action'; id: string; action: 'focus' | 'close' | 'minimize' | 'maximize' | 'fullscreen' | 'restore' | 'reopen' }
  | { type: 'dismiss-top' }
  | { type: 'reset' }
  | { type: 'quit' }
  | { type: 'noop' };
