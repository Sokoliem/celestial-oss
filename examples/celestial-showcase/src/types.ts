import type { DragState, MouseEventData } from '@celestial/core';
import type { FloatingWindowDragState, FloatingWindowResizeState, WindowManager, WorkspaceModel } from '@celestial/horizon';
import type { SchemaFormModel, SchemaFormMsg, WizardModel, WizardMsg } from '@celestial/orbit';
import type {
  BreadcrumbModel,
  BreadcrumbMsg,
  CheckboxModel,
  CheckboxMsg,
  CommandPaletteModel,
  CommandPaletteMsg,
  ConfirmDialogModel,
  ConfirmDialogMsg,
  ContextMenuMsg,
  ContextMenuState,
  DataTableModel,
  DataTableMsg,
  DrawerModel,
  DrawerMsg,
  ModalModel,
  ModalMsg,
  PaginationModel,
  PaginationMsg,
  RadioGroupModel,
  RadioGroupMsg,
  SelectModel,
  SelectMsg,
  SliderModel,
  SliderMsg,
  TabsModel,
  TabsMsg,
  TextareaModel,
  TextareaMsg,
  TextInputModel,
  TextInputMsg,
  ToastModel,
  ToastMsg,
  ToggleModel,
  ToggleMsg,
  TooltipModel,
  TooltipMsg,
  TreeModel,
  TreeMsg,
} from '@celestial/ui';

export type LabId = 'core' | 'components' | 'workflows' | 'visuals' | 'mouse' | 'layers' | 'windows' | 'smoke';
export type ViewportTier = 'compact' | 'medium' | 'wide';
export type ComponentFocus = 'none' | 'text' | 'textarea' | 'checkbox' | 'radio' | 'select' | 'toggle' | 'slider' | 'tabs' | 'pagination' | 'table' | 'tree';
export type SurfaceId = 'modal' | 'confirm' | 'drawer' | 'tooltip' | 'palette' | 'toast';
export type SmokeId = 'core' | 'component' | 'workflow' | 'visual' | 'mouse-click' | 'mouse-drag' | 'context-menu' | 'layer' | 'adaptive' | 'window' | 'help';

export type ShowcaseContextAction =
  | { type: 'run-action'; action: string }
  | { type: 'switch-lab'; lab: LabId }
  | { type: 'open-help'; lab: LabId }
  | { type: 'next-receipt' }
  | { type: 'window-action'; id: string; action: 'focus' | 'close' | 'minimize' | 'maximize' | 'restore' }
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
  stopPropagation(): void;
}

export type WindowDrag = { id: string; kind: 'drag'; state: FloatingWindowDragState } | { id: string; kind: 'resize'; state: FloatingWindowResizeState };

export interface CelestialShowcaseModel {
  cols: number;
  rows: number;
  tick: number;
  activeLab: LabId;
  previousTier: ViewportTier;
  completed: Set<SmokeId>;
  lastAction: string;
  componentPage: number;
  componentFocus: ComponentFocus;
  helpOpen: boolean;
  contextMenu: ContextMenuState<ShowcaseContextAction>;
  contextMenuSource: string | null;
  hoveredRegion: string | null;
  pointer: PointerTelemetry;
  dragDemo: DragState<MouseDragPayload>;
  droppedReceipts: number;
  lastDroppedReceipt: string | null;
  windowDrag: WindowDrag | null;
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
  | { type: 'help-surface'; msg: DrawerMsg }
  | { type: 'open-help' }
  | { type: 'open-surface'; surface: SurfaceId }
  | { type: 'switch-workspace'; index: number }
  | { type: 'window-action'; id: string; action: 'focus' | 'close' | 'minimize' | 'maximize' | 'fullscreen' | 'restore' | 'reopen' }
  | { type: 'dismiss-top' }
  | { type: 'reset' }
  | { type: 'quit' }
  | { type: 'noop' };
