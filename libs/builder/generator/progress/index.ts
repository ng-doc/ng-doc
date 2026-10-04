/**
 * NgDoc generation progress. Pure and host-neutral: hosts create a reporter with a writer
 * port and feed it the session's `ProgressEvent`s. Nothing here affects results, commits or
 * watching; every failure is contained.
 */
export * from './ci';
export * from './detect';
export * from './events';
export * from './format';
export * from './gate';
export * from './host';
export { LinesRenderer } from './lines';
export type { ExitHook, LiveFrame, LiveStream } from './live';
export {
  CLEAR_LINE,
  LIVE_ACTIVITY_DRAW_MS,
  LIVE_EDIT_DRAW_MS,
  LIVE_FIRST_DRAW_MS,
  LiveRenderer,
  processExitHook,
} from './live';
export type { GenerationView, ModelChange, ProgressStep } from './model';
export { PHASE_WEIGHTS, PROGRESS_STEPS, ProgressModel, stepOf } from './model';
export * from './reporter';
export * from './settings';
