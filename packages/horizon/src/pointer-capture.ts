/**
 * Horizon pointer-capture integration — re-exports nexus's pointer-capture
 * primitives so horizon-level drag/resize surfaces (splitter, floating-window
 * resize, workspace pane reposition) can opt into capture sessions without
 * piping nexus imports through each consumer.
 */

export type {
  PointerCaptureEnd,
  PointerCaptureEndKind,
  PointerCaptureMsg,
  PointerCaptureReason,
  PointerCaptureSession,
  PointerCaptureState,
} from '@celestial/core/nexus';
export {
  createPointerCaptureState,
  getPointerCaptureLocalOffset,
  getPointerCaptureOffset,
  isPointerCaptured,
  isPointerCaptureOwner,
  pointerCaptureUpdate,
} from '@celestial/core/nexus';
