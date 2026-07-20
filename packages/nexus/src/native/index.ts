/**
 * `@celestial/nexus/native` — Node-only IO primitives.
 *
 * This subpath shells out to OS tools (`pbcopy`, `clip`, `wl-copy`, `xclip`,
 * `xsel`, `open`, `xdg-open`, `start`, `wslview`, `powershell`). Browser /
 * rift consumers should not import this barrel. See the package README
 * "Node-only IO" section for threat-model considerations.
 */

export {
  nativeClipboardCopy,
  nativeClipboardRead,
} from './clipboard-native.js';
export type { OpenUrlOpts, OpenUrlResult } from './open-url.js';
export { openUrl } from './open-url.js';
export type {
  ChildHandle,
  ClipboardToolProbe,
  ProcessEnvProbe,
  SpawnFn,
  SpawnOpts,
} from './process-env.js';
export {
  _resetClipboardToolCache,
  detectClipboardTools,
  getEnv,
  getPlatform,
  isSshSession,
} from './process-env.js';
