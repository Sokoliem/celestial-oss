// Cross-platform postinstall.
//
// node-pty ships a `spawn-helper` binary in its prebuilds that must be
// executable on Unix. On Windows there is nothing to chmod, so this is a
// no-op there. Failures are non-fatal — a missing helper for a platform we
// aren't running on must not break `pnpm install`.
import { chmodSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

if (process.platform === 'win32') {
  process.exit(0);
}

const pnpmDir = join(process.cwd(), 'node_modules', '.pnpm');
if (!existsSync(pnpmDir)) process.exit(0);

try {
  for (const entry of readdirSync(pnpmDir)) {
    if (!entry.startsWith('node-pty@')) continue;
    const prebuilds = join(pnpmDir, entry, 'node_modules', 'node-pty', 'prebuilds');
    if (!existsSync(prebuilds)) continue;
    for (const abi of readdirSync(prebuilds)) {
      const helper = join(prebuilds, abi, 'spawn-helper');
      if (existsSync(helper) && statSync(helper).isFile()) {
        chmodSync(helper, 0o755);
      }
    }
  }
} catch {
  // Best-effort: never fail the install over this.
}
