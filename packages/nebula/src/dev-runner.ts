/**
 * Nebula Dev Runner
 *
 * A thin wrapper that runs a celesTUI app in dev mode with auto-restart
 * on file changes.
 *
 * Usage:
 *   node --import tsx packages/nebula/src/dev-runner.ts ./src/main.ts
 *
 * Or use it programmatically:
 *   import { runDev } from '@celestial/nebula/dev-runner';
 *   runDev('./src/main.ts', ['./src']);
 *
 * How it works:
 * 1. Spawns the entry point as a child process
 * 2. When the child exits with code 75 (restart requested), restarts it
 * 3. When the child exits with any other code, exits with the same code
 *
 * The devPlugin in the running app handles file watching and exits with
 * code 75 when a file change is detected.
 */

import { type ChildProcess, spawn } from 'node:child_process';

/** Exit code that signals "restart requested" from the dev plugin. */
const DEV_RESTART_EXIT_CODE = 75;

/**
 * Run a celesTUI app in dev mode with auto-restart on file changes.
 *
 * @param entryPoint - Path to the app's entry file (e.g., './src/main.ts')
 * @param execArgs - Additional arguments to pass to the Node.js process
 *                   (e.g., ['--import', 'tsx'] for TypeScript support)
 */
export function runDev(entryPoint: string, execArgs?: string[]): void {
  let child: ChildProcess | null = null;
  let restarting = false;

  function start(): void {
    const args = [...(execArgs ?? []), entryPoint];

    if (typeof process !== 'undefined' && process.stderr) {
      process.stderr.write(`[celestui-dev] Starting: node ${args.join(' ')}\n`);
    }

    child = spawn(process.execPath, args, {
      stdio: 'inherit',
      env: process.env,
    });

    child.on('exit', (code) => {
      child = null;

      if (code === DEV_RESTART_EXIT_CODE) {
        restarting = true;
        if (typeof process !== 'undefined' && process.stderr) {
          process.stderr.write('[celestui-dev] Restarting...\n');
        }
        // Small delay to allow the filesystem to settle
        setTimeout(start, 100);
      } else {
        if (typeof process !== 'undefined' && process.stderr) {
          process.stderr.write(`[celestui-dev] Process exited with code ${code ?? 'null'}\n`);
        }
        process.exit(code ?? 0);
      }
    });

    child.on('error', (err) => {
      if (typeof process !== 'undefined' && process.stderr) {
        process.stderr.write(`[celestui-dev] Failed to start: ${err.message}\n`);
      }
      process.exit(1);
    });
  }

  // Forward SIGINT/SIGTERM to the child process
  function forwardSignal(signal: NodeJS.Signals): void {
    if (child) {
      child.kill(signal);
    } else if (!restarting) {
      process.exit(0);
    }
  }

  process.on('SIGINT', () => forwardSignal('SIGINT'));
  process.on('SIGTERM', () => forwardSignal('SIGTERM'));

  start();
}

// If run directly as a script, treat the first argument as the entry point
const isDirectRun =
  typeof process !== 'undefined' && process.argv[1] && (process.argv[1].endsWith('dev-runner.ts') || process.argv[1].endsWith('dev-runner.js'));

if (isDirectRun) {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    process.stderr.write('Usage: celestui-dev <entry-point> [--exec-args ...]\n');
    process.stderr.write('Example: celestui-dev ./src/main.ts --import tsx\n');
    process.exit(1);
  }

  const entryPoint = args[0]!;
  const execArgs = args.slice(1);
  runDev(entryPoint, execArgs);
}
