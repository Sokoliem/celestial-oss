import { fileURLToPath } from 'node:url';
import { createPtyHarness } from '@celestial/test/pty';
import { describe, expect, it } from 'vitest';

describe('Celestial Flight Deck PTY', () => {
  it('launches, traverses every lab and its deep instruments, resizes, opens help, and exits cleanly', async () => {
    const packageRoot = fileURLToPath(new URL('../..', import.meta.url));
    const harness = await createPtyHarness({
      command: process.execPath,
      args: ['dist/index.js'],
      cwd: packageRoot,
      cols: 140,
      rows: 42,
      timeoutMs: 25_000,
      env: { CELESTIAL_DEMO_FAST: '1' },
    });

    try {
      await harness.waitForText('CELESTIAL FLIGHT DECK');
      await harness.waitForText('WIDE / floating');
      // F10 is the compatibility form of the Shift+F10 context-menu gesture.
      // ConPTY does not preserve synthetic Shift modifiers consistently.
      harness.write('\u001b[21~');
      await harness.waitForText('Open Core help');
      harness.write('\u001b');
      // Sub-page keys are swallowed while a context menu is open, so 'l' must not be
      // sent until Escape has landed. There is no usable receipt to wait on: the
      // status bar repaints in non-contiguous chunks, so waitForText('Closed context
      // menu.') never matches (verified — it times out). This wait is therefore
      // unanchored by necessity, but it is not a correctness hole: if Escape has not
      // landed, 'l' is swallowed and the 'Locale scope |' assertion below fails loudly
      // rather than passing silently.
      await new Promise<void>((resolve) => setTimeout(resolve, 75));

      harness.write('l');
      await harness.waitForText('Locale scope |');
      harness.write('g');
      await harness.waitForText('@celestial/atlas');
      harness.write('2');
      await harness.waitForText('Run headless checks');
      harness.write(']');
      await harness.waitForText('checkboxGroup()');
      harness.write('3');
      await harness.waitForText('Release preferences');
      harness.write(']');
      await harness.waitForText('Validation accepted');
      harness.write(']');
      // Headings replace in place and are not guaranteed to reach the transcript as one
      // contiguous chunk, so each deep instrument below is confirmed by a freshly
      // painted body receipt instead of its title.
      await harness.waitForText('Single + multi select');
      harness.write('4');
      await harness.waitForText('Stellar line chart');
      harness.write(']');
      await harness.waitForText('semantic terminal light');
      harness.write(']');
      await harness.waitForText('Heatmap + sparkline');
      harness.write(']');
      await harness.waitForText('Document receipts');
      harness.write('5');
      await harness.waitForText('verification receipt');
      harness.write('6');
      await harness.waitForText('Base application - should never disappear');
      harness.write('7');
      // Incremental terminal diffs do not guarantee that a replaced heading is
      // emitted as one contiguous chunk. This window body is newly painted and
      // therefore a stable transcript receipt for the lab switch.
      await harness.waitForText('Live instrument bus');
      harness.write(']');
      await harness.waitForText('saved sessions');
      harness.write('v');
      await harness.waitForText('snap zone and tile layout.');
      harness.write('8');
      await harness.waitForText('Component changed');
      const appShell = harness.mark();
      harness.write('9');
      await harness.waitForText('Config receipt: not loaded', { since: appShell });
      const appShellJobs = harness.mark();
      harness.write('j');
      await harness.waitForText(
        'Compass route receipt: /jobs/flight-42?view=queue -> jobs.',
        { since: appShellJobs },
      );
      const appShellPalette = harness.mark();
      harness.write('\u0010');
      await harness.waitForText('[Close]', { since: appShellPalette });
      const appShellPaletteClosed = harness.mark();
      harness.write('\u001b');
      await harness.waitForText(/SHARED\s*TOAST\s*PROJECTION/u, {
        since: appShellPaletteClosed,
      });
      const appShellHelp = harness.mark();
      harness.write('?');
      await harness.waitForText('[Close]', { since: appShellHelp });
      const appShellHelpClosed = harness.mark();
      harness.write('\u001b');
      await harness.waitForText(/SHARED\s*TOAST\s*PROJECTION/u, {
        since: appShellHelpClosed,
      });
      const appShellConfirm = harness.mark();
      harness.write('x');
      await harness.waitForText('Compass modal screen remains locked', { since: appShellConfirm });
      const appShellApproved = harness.mark();
      harness.write('\r');
      await harness.waitForText(
        'Confirmation receipt: preview release approved.',
        { since: appShellApproved },
      );
      const appShellTask = harness.mark();
      harness.write('s');
      await harness.waitForText('Background verification is running.', {
        since: appShellTask,
      });
      await harness.waitForText('Background task: success', {
        since: appShellTask,
      });
      await harness.waitForText(
        'Config receipt: workspace-config | 2 checked | first-listed-wins',
        { since: appShellTask },
      );
      const appShellSecondTask = harness.mark();
      harness.write('s');
      await harness.waitForText('Background task: running', {
        since: appShellSecondTask,
      });
      const appShellCancelled = harness.mark();
      harness.write('c');
      await harness.waitForText('Background task: cancelled', {
        since: appShellCancelled,
      });
      const appShellInbox = harness.mark();
      harness.write('i');
      await harness.waitForText('Release approved from the modal receipt.', { since: appShellInbox });
      const appShellInboxClosed = harness.mark();
      harness.write('\u001b');
      await harness.waitForText(/SHARED\s*TOAST\s*PROJECTION/u, {
        since: appShellInboxClosed,
      });
      // 'Live instrument bus' is already in the transcript from the earlier visit to
      // this lab, so a plain waitForText would resolve instantly and synchronise
      // nothing. Marking first makes this wait mean "painted again, now", which
      // proves the lab switch landed before the resize below.
      const backToWindows = harness.mark();
      harness.write('7');
      harness.write('[');
      await harness.waitForText('Live instrument bus', { since: backToWindows });
      harness.resize(70, 32);
      await harness.waitForText('COMPACT / single');
      const narrowAppShell = harness.mark();
      harness.write('9');
      await harness.waitForText('Diagnostics: none', { since: narrowAppShell });
      const narrowAppShellHelp = harness.mark();
      harness.write('?');
      await harness.waitForText('[Close]', { since: narrowAppShellHelp });
      const narrowAppShellHelpClosed = harness.mark();
      harness.write('\u001b');
      await harness.waitForText(/SHARED\s*TOAST\s*PROJECTION/u, {
        since: narrowAppShellHelpClosed,
      });
      const narrowWindows = harness.mark();
      harness.write('7');
      await harness.waitForText('Live instrument bus', { since: narrowWindows });
      harness.write('?');
      await harness.waitForText('Windows help');
      harness.write('\u001b');
      // Wait for Escape to be consumed before sending q. Without an output
      // receipt ConPTY may coalesce the writes into Alt+Q, which correctly
      // does not match the plain quit binding.
      await harness.waitForText('Closed contextual help.');
      harness.write('q');
      const exit = await harness.waitForExit();

      // Nebula catches render errors and keeps the app alive, so a broken frame
      // would otherwise still exit 0. The transcript is ANSI-stripped, so the
      // runtime's diagnostic row and the demo's stderr both arrive as plain text.
      expect(harness.output()).not.toContain('render error:');
      expect(harness.output()).not.toContain(' Error: ');
      expect(exit.exitCode).toBe(0);
    } finally {
      harness.dispose();
    }
  }, 30_000);
});
