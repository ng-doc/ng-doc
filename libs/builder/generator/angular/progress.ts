import type { BuilderContext } from '@angular-devkit/architect';

import type { GeneratorBootstrapOptions } from '../bootstrap';
import type { ProgressEvent } from '../progress/events';
import { stepText } from '../progress/format';
import { type HostProgress, createHostProgress } from '../progress/host';
import { ProgressModel, stepOf } from '../progress/model';
import { type ProgressOptionSetting, resolveProgressSetting } from '../progress/settings';

/** Architect progress reports during the initial generation, at most once per second. */
const REPORT_INTERVAL_MS = 1_000;

/**
 * NgDoc progress in the Angular builders. Until the Angular host starts, NgDoc owns the terminal:
 * a live line on stderr or plain lines through the Architect logger, then the summary. After the
 * host starts (`setForeign('summaries')`) only result lines are printed. The initial generation
 * also reaches Architect's own progress channel (`reportStatus`, `reportProgress`), which neither
 * the Angular CLI nor Nx renders; it is for programmatic Architect consumers.
 */
export function createAngularProgress(
  context: BuilderContext,
  options: { option?: ProgressOptionSetting; angularProgress?: boolean; project: string },
): HostProgress | undefined {
  const { setting } = resolveProgressSetting({
    ...(options.option ? { option: options.option } : {}),
    ...(options.angularProgress === false ? { host: { angularProgress: false } } : {}),
  });
  if (setting === 'off') return undefined;
  const info = (text: string) => context.logger.info(text);
  return createHostProgress({
    writer: { line: info, live: process.stderr },
    setting,
    project: options.project,
    forward: architectReports(context),
    warn: (message) => context.logger.warn(message),
  });
}

/** The generator options with `progress` as the session's progress consumer. */
export function withProgress(
  bootstrap: GeneratorBootstrapOptions,
  progress: HostProgress | undefined,
): GeneratorBootstrapOptions {
  if (!progress) return bootstrap;
  return { ...bootstrap, session: { ...bootstrap.session, onProgress: progress.sink } };
}

/**
 * `reportStatus` when the step changes (not on every count) and `reportProgress` at most once per
 * second, for the first build only: once it settles, the Angular host owns Architect's progress
 * channel.
 */
function architectReports(context: BuilderContext): (event: ProgressEvent) => void {
  const model = new ProgressModel();
  let done = false;
  let step: number | undefined;
  let reportedAt = -Infinity;
  return (event) => {
    if (done) return;
    const change = model.apply(event);
    if (!change || change.kind === 'activity' || change.view.trigger !== 'build') return;
    if (change.kind === 'settled') {
      done = true;
      context.reportProgress(1, 1);
      return;
    }
    // Before the compiler reports phases, `generating documentation` is one step until the commit.
    const view = change.view;
    const current = view.phase ? stepOf(view.phase) : -1;
    if (current !== step) {
      step = current;
      // The status stays until the next step: totals, not the count at the step's start (`0/445`),
      // and no percentage, which `reportProgress` carries.
      context.reportStatus(`NgDoc: ${stepText(view, { totals: true, percent: false })}`);
    }
    const now = performance.now();
    if (now - reportedAt >= REPORT_INTERVAL_MS) {
      reportedAt = now;
      context.reportProgress(Math.floor(change.view.fraction * 1000), 1000);
    }
  };
}
