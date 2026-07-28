import { createActionRegistry, getVNodeMeta, text } from '@celestial/core/nebula';
import { auditA11y, renderToText } from '@celestial/test';
import { describe, expect, it } from 'vitest';
import { createAppShell } from '../app-shell.js';
import { createAppShellView } from '../app-shell-view.js';
import { createNotificationStore } from '../notification-store.js';

interface HostModel {
  readonly enabled: boolean;
}

type HostMsg = { readonly type: 'run' };

const hostModel: HostModel = { enabled: true };
const viewport = { cols: 70, rows: 32 } as const;

function harness() {
  const registry = createActionRegistry<HostModel, HostMsg>([
    {
      id: 'release.run',
      title: 'Run release',
      category: 'Release',
      shortcuts: ['ctrl+r'],
      when: (model) => model.enabled,
      run: () => ({ type: 'run' }),
    },
  ]);
  const shell = createAppShell({
    id: 'view-test',
    registry,
    notificationStore: createNotificationStore({ now: () => 10 }),
    formatTimestamp: (timestamp) => String(timestamp),
    canUseGlobalShortcuts: () => true,
  });
  const view = createAppShellView(shell, { id: 'view-test' });
  return { shell, view };
}

describe('AppShell controlled view adapter', () => {
  it('renders the canonical modal frame and hides the base accessibility tree', () => {
    const { shell, view } = harness();
    const model = shell.init(hostModel, {
      confirm: {
        id: 'release',
        title: 'Approve preview release?',
        description: 'The host remains mounted below this blocking surface.',
        confirmLabel: 'Approve',
        cancelLabel: 'Keep reviewing',
      },
    });
    const base = text('HOST BASE');
    const layered = view.layer(base, model, { hostModel, viewport });
    const frame = renderToText(layered, viewport);

    expect(frame).toContain('MODAL CONFIRMATION');
    expect(frame).toContain('[Approve]');
    expect(frame).toContain('[Keep reviewing]');
    expect(frame).toContain('╔');
    expect(JSON.stringify(layered)).toContain('"focusMode":"modal"');
    expect(JSON.stringify(layered)).toContain('"focusMode":"passive"');
    expect(getVNodeMeta(base)?.a11y?.hidden).toBe(true);
    expect(auditA11y(layered).violations.filter((violation) => violation.severity === 'error')).toEqual([]);
  });

  it('keeps pointer selection and activation in the headless shell model', () => {
    const { shell } = harness();
    let model = shell.init(hostModel, {
      confirm: { id: 'release', title: 'Approve preview release?' },
    });

    model = shell.update(
      { type: 'shell-confirm-select', selection: 'cancel' },
      model,
      { hostModel, viewport },
    ).model;
    expect(model.confirmSelection).toBe('cancel');

    model = shell.update(
      { type: 'shell-confirm-toggle' },
      model,
      { hostModel, viewport },
    ).model;
    expect(model.confirmSelection).toBe('confirm');

    const resolved = shell.update(
      { type: 'shell-confirm', id: 'release' },
      model,
      { hostModel, viewport },
    );
    expect(resolved.receipts).toEqual([
      { type: 'confirm-resolved', id: 'release', confirmed: true },
    ]);
  });

  it('renders palette rows with canonical hover, click, wheel, and accessibility affordances', () => {
    const { shell, view } = harness();
    const initial = shell.init(hostModel);
    const model = shell.update(
      { type: 'shell-open-palette' },
      initial,
      { hostModel, viewport },
    ).model;
    const layered = view.layer(text('HOST BASE'), model, { hostModel, viewport });
    const serialized = JSON.stringify(layered);

    expect(renderToText(layered, viewport)).toContain('ACTION PALETTE');
    expect(serialized).toContain('view-test:palette-highlight');
    expect(serialized).toContain('view-test:palette-select');
    expect(serialized).toContain('view-test:palette-scroll');
    expect(auditA11y(layered).violations.filter((violation) => violation.severity === 'error')).toEqual([]);
  });
});
