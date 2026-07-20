import {
  type AppConfig,
  border,
  box,
  Cmd,
  column,
  defaultTheme,
  easing,
  event,
  getCapabilities,
  getTerminalSize,
  row,
  runtime,
  scroll,
  shouldAnimate,
  style,
  Sub,
  text,
  tween,
  type VNode,
} from '@celestial/core';
import {
  badge,
  type Command,
  commandPalette,
  type CommandPaletteModel,
  type CommandPaletteMsg,
  confirmDialog,
  type ConfirmDialogModel,
  type ConfirmDialogMsg,
  emptyState,
  progressBar,
} from '@celestial/ui';
import { createLocalTaskRuntime, type TaskId, type TaskRuntime, taskIds, type TaskWorkerEvent } from './runtime.js';

export type TaskStatus = 'idle' | 'running' | 'success' | 'failed' | 'cancelled';
export type TaskFilter = 'all' | 'active' | 'failed' | 'complete';

export interface TaskState {
  id: TaskId;
  label: string;
  description: string;
  status: TaskStatus;
  progress: number;
  displayProgress: number;
  attempt: number;
  generation: number;
  logs: string[];
  animation?: { from: number; to: number; startedAt: number };
}

export interface TaskConsoleModel {
  tasks: Record<TaskId, TaskState>;
  selected: TaskId;
  filter: TaskFilter;
  cols: number;
  rows: number;
  palette: CommandPaletteModel;
  cancelDialog: ConfirmDialogModel;
  animate: boolean;
}

export type TaskConsoleMsg =
  | { type: 'run-all' }
  | { type: 'run-selected' }
  | { type: 'retry-selected' }
  | { type: 'cancel-request' }
  | { type: 'select-next' }
  | { type: 'select-prev' }
  | { type: 'select-task'; taskId: TaskId }
  | { type: 'set-filter'; filter: TaskFilter }
  | { type: 'worker-event'; event: TaskWorkerEvent }
  | { type: 'runtime-error'; taskId: TaskId; generation: number; message: string }
  | { type: 'palette'; msg: CommandPaletteMsg }
  | { type: 'cancel-dialog'; msg: ConfirmDialogMsg }
  | { type: 'mouse'; handlerTag: string }
  | { type: 'resize'; cols: number; rows: number }
  | { type: 'animation-frame'; timestamp: number }
  | { type: 'dismiss' }
  | { type: 'quit' }
  | { type: 'noop' };

export interface TaskConsoleOptions {
  runtime?: TaskRuntime;
  autoStart?: boolean;
  animate?: boolean;
  initialSize?: { cols: number; rows: number };
}

const taskDetails: Record<TaskId, { label: string; description: string }> = {
  compile: { label: 'Compile', description: 'Build the TypeScript project graph.' },
  test: { label: 'Test', description: 'Run deterministic interaction checks.' },
  package: { label: 'Package', description: 'Verify and assemble the preview archive.' },
};

const toneByStatus = {
  idle: 'default',
  running: 'info',
  success: 'success',
  failed: 'danger',
  cancelled: 'warning',
} as const;

const surfaceStyle = style({ border: border.rounded, color: defaultTheme.colors.border, padding: 1 });
const selectedSurfaceStyle = style({ border: border.rounded, color: defaultTheme.colors.borderActive, padding: 1 });
const headingStyle = style({ color: defaultTheme.colors.tones.accent, bold: true });
const mutedStyle = style({ color: defaultTheme.colors.muted, dim: true });
const selectedStyle = style({ color: defaultTheme.colors.interactive, bold: true });
const errorStyle = style({ color: defaultTheme.colors.tones.danger });

function initialTask(id: TaskId): TaskState {
  return {
    id,
    ...taskDetails[id],
    status: 'idle',
    progress: 0,
    displayProgress: 0,
    attempt: 0,
    generation: 0,
    logs: ['Ready.'],
  };
}

function appendLog(task: TaskState, message: string): TaskState {
  return { ...task, logs: [...task.logs, message].slice(-200) };
}

function isVisible(task: TaskState, filter: TaskFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'active') return task.status === 'running';
  if (filter === 'failed') return task.status === 'failed';
  return task.status === 'success';
}

function visibleTaskIds(model: TaskConsoleModel): TaskId[] {
  return taskIds.filter((id) => isVisible(model.tasks[id], model.filter));
}

function actionable(id: string, label: string, shortcut?: string): VNode {
  const node = event(
    `task-action:${id}`,
    text(`[${label}]`, selectedStyle),
    { onClick: `task-action:${id}` },
    { label, intent: id, affordances: ['click'], cursor: 'pointer', keyboardHint: shortcut },
  );
  runtime.setVNodeMeta(node, { a11y: { role: 'button', label } });
  return node;
}

function filterNode(filter: TaskFilter, label: string, active: boolean): VNode {
  const node = event(
    `task-filter:${filter}`,
    text(active ? `[${label}]` : ` ${label} `, active ? selectedStyle : mutedStyle),
    { onClick: `task-filter:${filter}` },
    { label: `Show ${label.toLowerCase()} tasks`, intent: 'filter', affordances: ['click'], cursor: 'pointer' },
  );
  runtime.setVNodeMeta(node, { a11y: { role: 'button', label: `Show ${label.toLowerCase()} tasks`, selected: active } });
  return node;
}

function statusBadge(task: TaskState): VNode {
  return badge({ label: task.status, variant: toneByStatus[task.status], size: 'sm' }).view({ visible: true });
}

function taskRow(task: TaskState, selected: boolean, cols: number): VNode {
  const barWidth = Math.max(8, Math.min(24, Math.floor(cols / 5)));
  const content =
    cols < 100
      ? row(
          text(selected ? '> ' : '  ', selected ? selectedStyle : mutedStyle),
          text(task.label.padEnd(10), selected ? selectedStyle : undefined),
          statusBadge(task),
          text(` ${Math.round(task.displayProgress)}%`, mutedStyle),
        )
      : column(
          row(text(selected ? '> ' : '  ', selected ? selectedStyle : mutedStyle), text(task.label, selected ? selectedStyle : undefined), text(' '), statusBadge(task)),
          row(text('  '), progressBar({ value: task.displayProgress / 100, width: barWidth, showPercentage: true })),
        );
  const node = event(
    `task-select:${task.id}`,
    content,
    { onClick: `task-select:${task.id}` },
    { label: `${task.label}, ${task.status}`, intent: 'select', affordances: ['click'], cursor: 'pointer', keyboardHint: 'Up/Down' },
  );
  runtime.setVNodeMeta(node, { a11y: { role: 'button', label: `${task.label}, ${task.status}`, selected } });
  return node;
}

function sampleProgress(animation: NonNullable<TaskState['animation']>, timestamp: number): { value: number; done: boolean } {
  const duration = 180;
  const elapsed = Math.max(0, timestamp - animation.startedAt);
  const motion = tween({ from: animation.from, to: animation.to, duration, easing: easing.easeOutCubic });
  motion.tick(0);
  motion.tick(Math.min(duration, elapsed));
  return { value: motion.value(), done: elapsed >= duration };
}

function panel(title: string, content: VNode, focused = false): VNode {
  return box(column(text(title, headingStyle), text(''), content), focused ? selectedSurfaceStyle : surfaceStyle, { overflow: 'hidden' });
}

export function createTaskConsoleApp(options: TaskConsoleOptions = {}): AppConfig<TaskConsoleModel, TaskConsoleMsg> {
  const workerRuntime = options.runtime ?? createLocalTaskRuntime();
  const terminalSize = options.initialSize ?? getTerminalSize();
  const animate = options.animate ?? shouldAnimate(getCapabilities());

  const commands: Array<Command<TaskConsoleMsg>> = [
    { id: 'run-all', label: 'Run all tasks', category: 'Tasks', shortcut: 'A', msg: { type: 'run-all' } },
    { id: 'run-selected', label: 'Run selected task', category: 'Tasks', shortcut: 'Enter', msg: { type: 'run-selected' } },
    { id: 'retry', label: 'Retry selected task', category: 'Tasks', shortcut: 'R', msg: { type: 'retry-selected' } },
    { id: 'cancel', label: 'Cancel selected task', category: 'Tasks', shortcut: 'X', msg: { type: 'cancel-request' } },
    { id: 'failed', label: 'Show failed tasks', category: 'Filters', shortcut: '3', msg: { type: 'set-filter', filter: 'failed' } },
  ];
  const paletteComponent = commandPalette<TaskConsoleMsg>({ commands, placeholder: 'Run a task command...' });
  const cancelComponent = confirmDialog({
    title: 'Cancel task',
    message: 'Stop the selected worker process?',
    confirmLabel: 'Stop worker',
    cancelLabel: 'Keep running',
    danger: true,
    open: false,
  });

  const [initialPalette] = paletteComponent.init();
  const [initialCancelDialog] = cancelComponent.init();

  const runTasks = (model: TaskConsoleModel, ids: readonly TaskId[]): [TaskConsoleModel, Cmd<TaskConsoleMsg>] => {
    const tasks = { ...model.tasks };
    const commandsToRun = ids.map((taskId) => {
      const current = tasks[taskId];
      const attempt = current.attempt + 1;
      const generation = current.generation + 1;
      tasks[taskId] = appendLog(
        { ...current, status: 'running', progress: 0, displayProgress: 0, attempt, generation, animation: undefined },
        `Queued attempt ${attempt}.`,
      );
      return Cmd.attempt<TaskConsoleMsg, void>(
        (signal) => workerRuntime.run(taskId, generation, attempt, signal),
        (result) =>
          result.ok
            ? { type: 'noop' }
            : { type: 'runtime-error', taskId, generation, message: result.error instanceof Error ? result.error.message : String(result.error) },
      );
    });
    return [{ ...model, tasks }, Cmd.batch(...commandsToRun)];
  };

  return {
    init() {
      const model: TaskConsoleModel = {
        tasks: { compile: initialTask('compile'), test: initialTask('test'), package: initialTask('package') },
        selected: 'compile',
        filter: 'all',
        cols: terminalSize.cols,
        rows: terminalSize.rows,
        palette: initialPalette,
        cancelDialog: initialCancelDialog,
        animate,
      };
      return [model, options.autoStart === false ? Cmd.none() : Cmd.msg({ type: 'run-all' })];
    },

    update(message, model) {
      switch (message.type) {
        case 'run-all':
          return runTasks(model, taskIds);
        case 'run-selected':
          return runTasks(model, [model.selected]);
        case 'retry-selected':
          return model.tasks[model.selected].status === 'running' ? [model, Cmd.none()] : runTasks(model, [model.selected]);
        case 'cancel-request': {
          if (model.tasks[model.selected].status !== 'running') return [model, Cmd.none()];
          const [cancelDialog, cmd] = cancelComponent.update({ type: 'open' }, model.cancelDialog);
          return [{ ...model, cancelDialog }, Cmd.map(cmd, (msg) => ({ type: 'cancel-dialog', msg }))];
        }
        case 'select-next':
        case 'select-prev': {
          const ids = visibleTaskIds(model);
          if (ids.length === 0) return [model, Cmd.none()];
          const current = Math.max(0, ids.indexOf(model.selected));
          const direction = message.type === 'select-next' ? 1 : -1;
          const selected = ids[(current + direction + ids.length) % ids.length]!;
          return [{ ...model, selected }, Cmd.none()];
        }
        case 'select-task':
          return [{ ...model, selected: message.taskId }, Cmd.none()];
        case 'set-filter': {
          const next = { ...model, filter: message.filter };
          const first = visibleTaskIds(next)[0];
          return [{ ...next, selected: first ?? model.selected }, Cmd.none()];
        }
        case 'worker-event': {
          const incoming = message.event;
          const current = model.tasks[incoming.taskId];
          if (current.generation !== incoming.generation) return [model, Cmd.none()];
          let task = current;
          if (incoming.type === 'start') task = appendLog(task, incoming.message);
          if (incoming.type === 'log') task = appendLog(task, incoming.message);
          if (incoming.type === 'progress') {
            task = {
              ...task,
              progress: incoming.progress,
              displayProgress: model.animate ? task.displayProgress : incoming.progress,
              animation: model.animate ? { from: task.displayProgress, to: incoming.progress, startedAt: Date.now() } : undefined,
            };
          }
          if (incoming.type === 'exit') {
            task = appendLog(
              { ...task, status: incoming.code === 0 ? 'success' : 'failed', progress: incoming.code === 0 ? 100 : task.progress, displayProgress: incoming.code === 0 ? 100 : task.displayProgress },
              incoming.message,
            );
          }
          if (incoming.type === 'error') task = appendLog({ ...task, status: 'failed', animation: undefined }, incoming.message);
          if (incoming.type === 'cancel') task = appendLog({ ...task, status: 'cancelled', animation: undefined }, incoming.message);
          return [{ ...model, tasks: { ...model.tasks, [incoming.taskId]: task } }, Cmd.none()];
        }
        case 'runtime-error': {
          const task = model.tasks[message.taskId];
          if (task.generation !== message.generation) return [model, Cmd.none()];
          return [
            { ...model, tasks: { ...model.tasks, [message.taskId]: appendLog({ ...task, status: 'failed' }, message.message) } },
            Cmd.none(),
          ];
        }
        case 'palette': {
          const selectedId =
            message.msg.type === 'cp-select' ? model.palette.palette.filteredIds[model.palette.palette.selectedIndex] : undefined;
          const selectedCommand = commands.find((command) => command.id === selectedId);
          const [palette, innerCmd] = paletteComponent.update(message.msg, model.palette);
          const mapped = Cmd.map(innerCmd, (msg) => ({ type: 'palette', msg }) as TaskConsoleMsg);
          return [
            { ...model, palette },
            selectedCommand ? Cmd.batch(mapped, Cmd.msg(selectedCommand.msg)) : mapped,
          ];
        }
        case 'cancel-dialog': {
          const shouldCancel = message.msg.type === 'confirm' && model.cancelDialog.open;
          const [cancelDialog, innerCmd] = cancelComponent.update(message.msg, model.cancelDialog);
          const mapped = Cmd.map(innerCmd, (msg) => ({ type: 'cancel-dialog', msg }) as TaskConsoleMsg);
          if (!shouldCancel) return [{ ...model, cancelDialog }, mapped];
          return [
            { ...model, cancelDialog },
            Cmd.batch(
              mapped,
              Cmd.perform(
                async () => workerRuntime.cancel(model.selected),
                () => ({ type: 'noop' }),
              ),
            ),
          ];
        }
        case 'mouse': {
          if (message.handlerTag.startsWith('task-select:')) {
            const taskId = message.handlerTag.slice('task-select:'.length) as TaskId;
            if (taskIds.includes(taskId)) return [{ ...model, selected: taskId }, Cmd.none()];
          }
          if (message.handlerTag.startsWith('task-filter:')) {
            const filter = message.handlerTag.slice('task-filter:'.length) as TaskFilter;
            return this.update({ type: 'set-filter', filter }, model);
          }
          if (message.handlerTag === 'task-action:run-all') return this.update({ type: 'run-all' }, model);
          if (message.handlerTag === 'task-action:retry') return this.update({ type: 'retry-selected' }, model);
          if (message.handlerTag === 'task-action:cancel') return this.update({ type: 'cancel-request' }, model);
          if (message.handlerTag === 'task-action:palette') return this.update({ type: 'palette', msg: { type: 'cp-open' } }, model);
          return [model, Cmd.none()];
        }
        case 'resize':
          return [{ ...model, cols: message.cols, rows: message.rows }, Cmd.none()];
        case 'animation-frame': {
          let changed = false;
          const tasks = { ...model.tasks };
          for (const taskId of taskIds) {
            const task = tasks[taskId];
            if (!task.animation) continue;
            const sample = sampleProgress(task.animation, message.timestamp);
            tasks[taskId] = { ...task, displayProgress: sample.value, animation: sample.done ? undefined : task.animation };
            changed = true;
          }
          return changed ? [{ ...model, tasks }, Cmd.none()] : [model, Cmd.none()];
        }
        case 'dismiss':
          return [model, Cmd.none()];
        case 'quit':
          return [model, Cmd.quit()];
        case 'noop':
          return [model, Cmd.none()];
      }
    },

    view(model) {
      const counts = taskIds.reduce(
        (summary, id) => {
          summary[model.tasks[id].status] += 1;
          return summary;
        },
        { idle: 0, running: 0, success: 0, failed: 0, cancelled: 0 },
      );
      const header = column(
        row(text('Celestial Task Console', headingStyle), text('  '), badge({ label: 'local workers', variant: 'info', size: 'sm' }).view({ visible: true })),
        row(
          badge({ label: `${counts.running} running`, variant: 'info', size: 'sm' }).view({ visible: true }),
          text(' '),
          badge({ label: `${counts.success} passed`, variant: 'success', size: 'sm' }).view({ visible: true }),
          text(' '),
          badge({ label: `${counts.failed} failed`, variant: 'danger', size: 'sm' }).view({ visible: true }),
        ),
        row(
          filterNode('all', '1 All', model.filter === 'all'),
          text(' '),
          filterNode('active', '2 Active', model.filter === 'active'),
          text(' '),
          filterNode('failed', '3 Failed', model.filter === 'failed'),
          text(' '),
          filterNode('complete', '4 Complete', model.filter === 'complete'),
        ),
      );

      const ids = visibleTaskIds(model);
      const taskList =
        ids.length > 0
          ? column(...ids.map((id) => taskRow(model.tasks[id], model.selected === id, model.cols)))
          : emptyState({ title: 'No matching tasks', description: 'Choose another status filter.' });
      const selected = model.tasks[model.selected];
      const logHeight = Math.max(5, model.rows - 17);
      const logLines = selected.logs.map((line) => text(line, line.includes('failed') ? errorStyle : undefined));
      const details =
        model.cols < 100
          ? column(
              text(`Attempt ${selected.attempt || '-'} / generation ${selected.generation}`, mutedStyle),
              ...logLines.slice(-Math.max(3, Math.min(6, model.rows - 17))),
            )
          : column(
              text(selected.description),
              text(`Attempt ${selected.attempt || '-'} / generation ${selected.generation}`, mutedStyle),
              text(''),
              scroll(column(...logLines), { height: logHeight, offset: Math.max(0, logLines.length - logHeight) }),
            );
      const taskPanel = panel('Tasks', taskList, true);
      const logPanel = panel(`${selected.label} log`, details);
      const main =
        model.cols >= 100
          ? row(runtime.flex(taskPanel, { flex: 2, minWidth: 36 }), runtime.flex(logPanel, { flex: 3, minWidth: 48 }))
          : column(runtime.flex(taskPanel, { flex: 1, minHeight: 7 }), runtime.flex(logPanel, { flex: 1, minHeight: 8 }));
      const actions = row(
        actionable('run-all', 'Run all', 'A'),
        text(' '),
        actionable('retry', 'Retry', 'R'),
        text(' '),
        actionable('cancel', 'Cancel', 'X'),
        text(' '),
        actionable('palette', 'Commands', 'Ctrl+P'),
      );
      const base = column(header, text(''), main, actions, text('Arrows select | A run all | R retry | X cancel | Ctrl+P commands | Q quit', mutedStyle));
      const layers: VNode[] = [base];
      if (model.cancelDialog.open) layers.push(cancelComponent.view(model.cancelDialog));
      if (model.palette.palette.open) layers.push(paletteComponent.view(model.palette));
      return runtime.stackedLayers(...layers);
    },

    subscriptions(model) {
      const persistent = [
        Sub.resize<TaskConsoleMsg>((cols, rows) => ({ type: 'resize', cols, rows })),
        Sub.stream<TaskConsoleMsg>({
          id: 'task-console-workers',
          setup: () => {
            let unsubscribe = () => {};
            return {
              onData(callback) {
                unsubscribe = workerRuntime.subscribe(callback as (event: TaskWorkerEvent) => void);
              },
              teardown() {
                unsubscribe();
                workerRuntime.dispose();
              },
            };
          },
          toMsg: (data) => ({ type: 'worker-event', event: data as TaskWorkerEvent }),
        }),
      ];
      if (model.animate && taskIds.some((id) => model.tasks[id].animation)) {
        persistent.push(Sub.animationFrame<TaskConsoleMsg>((frame) => ({ type: 'animation-frame', timestamp: frame.timestamp })));
      }
      if (model.cancelDialog.open) {
        return Sub.batch(
          ...persistent,
          Sub.map(cancelComponent.subscriptions?.(model.cancelDialog) ?? Sub.none<ConfirmDialogMsg>(), (msg) => ({ type: 'cancel-dialog', msg }) as TaskConsoleMsg),
        );
      }
      if (model.palette.palette.open) {
        return Sub.batch(
          ...persistent,
          Sub.map(paletteComponent.subscriptions?.(model.palette) ?? Sub.none<CommandPaletteMsg>(), (msg) => ({ type: 'palette', msg }) as TaskConsoleMsg),
        );
      }
      return Sub.batch(
        ...persistent,
        Sub.key('down', { type: 'select-next' }),
        Sub.key('up', { type: 'select-prev' }),
        Sub.key('enter', { type: 'run-selected' }),
        Sub.key('a', { type: 'run-all' }),
        Sub.key('r', { type: 'retry-selected' }),
        Sub.key('x', { type: 'cancel-request' }),
        Sub.key('1', { type: 'set-filter', filter: 'all' }),
        Sub.key('2', { type: 'set-filter', filter: 'active' }),
        Sub.key('3', { type: 'set-filter', filter: 'failed' }),
        Sub.key('4', { type: 'set-filter', filter: 'complete' }),
        Sub.keyWithModifiers('p', { ctrl: true }, { type: 'palette', msg: { type: 'cp-open' } }),
        Sub.key('escape', { type: 'dismiss' }),
        Sub.key('q', { type: 'quit' }),
        Sub.elementMouse<TaskConsoleMsg>((mouse) => ({ type: 'mouse', handlerTag: mouse.handlerTag })),
      );
    },
  };
}
