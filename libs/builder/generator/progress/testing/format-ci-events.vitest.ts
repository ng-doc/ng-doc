import { describe, expect, it, vi } from 'vitest';

import {
  appendStepSummary,
  ciProgressMessage,
  escapeTeamCity,
  neutralizeServiceMessages,
  sectionEnd,
  sectionStart,
} from '../ci';
import type { ProgressSettledEvent } from '../events';
import { guardProgressSink, progressFailure, SESSION_PROGRESS_FAILED } from '../events';
import {
  activityDone,
  activityNotice,
  backgroundDone,
  backgroundLabel,
  buildSummary,
  compactText,
  editFailureLine,
  editLine,
  formatDuration,
  liveText,
  paint,
  phasesLine,
  restartLine,
  slowEditLine,
  startLine,
  stepLine,
  stepText,
  switchesLine,
  timingText,
  truncate,
} from '../format';
import type { GenerationView } from '../model';

const view = (overrides: Partial<GenerationView> = {}): GenerationView => ({
  generation: 1,
  trigger: 'build',
  mode: 'production',
  changes: 0,
  elapsedMs: 0,
  lastSeq: 0,
  restarted: false,
  totals: {},
  stepped: true,
  fraction: 0.48,
  ...overrides,
});

const settled = (
  overrides: Partial<ProgressSettledEvent> = {},
  counts: Partial<ProgressSettledEvent['counts']> = {},
): ProgressSettledEvent => ({
  kind: 'progress-settled',
  generation: 1,
  seq: 9,
  status: 'success',
  elapsedMs: 900,
  phases: {},
  ...overrides,
  counts: { pages: 664, rebuilt: 1, errors: 0, warnings: 0, ...counts },
});

describe('format', () => {
  it('durations', () => {
    expect(
      [0, 940, 9_849, 10_000, 21_400, 59_999, 65_000, 3_725_000, -5].map((ms) =>
        formatDuration(ms),
      ),
    ).toEqual(['0.0s', '0.9s', '9.8s', '10s', '21s', '59s', '1m 05s', '62m 05s', '0.0s']);
    // Coarse: whole seconds, so a redrawn line changes at most once per second because of the clock.
    expect([0, 940, 9_849, 65_000].map((ms) => formatDuration(ms, true))).toEqual([
      '0s',
      '0s',
      '9s',
      '1m 05s',
    ]);
  });

  it('steps: preparing details, page counts, files, percent', () => {
    expect(stepText(view({ phase: 'semantic' }))).toBe(
      '[1/4] preparing (analyzing TypeScript) (48%)',
    );
    expect(stepText(view({ phase: 'semantic' }), { live: true })).toBe(
      '[1/4] preparing: analyzing TypeScript (48%)',
    );
    expect(stepText(view({ phase: 'aggregate' as const, totals: {} }))).toBe(
      '[3/4] linking pages (48%)',
    );
    expect(stepText(view({ phase: 'render', totals: { render: 664 }, completed: 312 }))).toBe(
      '[2/4] rendering 312/664 pages (48%)',
    );
    // From 0/664 at the phase start, so the visible count never drops.
    expect(stepText(view({ phase: 'render', totals: { render: 664 }, completed: 0 }))).toBe(
      '[2/4] rendering 0/664 pages (48%)',
    );
    expect(stepText(view({ phase: 'render', totals: { render: 1 }, phaseState: 'end' }))).toBe(
      '[2/4] rendering 1 page (48%)',
    );
    expect(stepText(view({ phase: 'keywords', totals: { render: 664 }, completed: 0 }))).toBe(
      '[2/4] rendering 664 pages (48%)',
    );
    expect(
      stepText(
        view({ phase: 'render', phaseState: 'end', totals: { render: 664 }, completed: 664 }),
      ),
    ).toBe('[2/4] rendering 664 pages (48%)');
    expect(stepText(view({ phase: 'commit', totals: { commit: 6669 } }))).toBe(
      '[4/4] writing 6669 files (48%)',
    );
    expect(stepText(view({ phase: 'transfer' }))).toBe('[4/4] writing files (48%)');
    expect(stepText(view({ phase: 'plan' as const }))).toBe(
      '[1/4] preparing (collecting pages) (48%)',
    );
    expect(stepText(view({ phase: undefined }))).toBe('[1/4] preparing (48%)');
    // Before the compiler reports phases: one step.
    expect(stepText(view({ stepped: false }))).toBe('generating documentation');
    expect(stepText(view({ stepped: false, phase: 'boot' }))).toBe(
      'generating documentation (starting)',
    );
    expect(stepText(view({ stepped: false, phase: 'commit', totals: { commit: 6669 } }))).toBe(
      'writing 6669 files',
    );
  });

  it('step-start lines show totals; heartbeats and the live line show the count so far', () => {
    const running = view({ phase: 'render', totals: { render: 664 }, completed: 312 });
    expect(stepLine(running, 6_900, true)).toBe(
      'NgDoc: [2/4] rendering 664 pages (48%), 6.9s elapsed',
    );
    expect(stepLine(running, 16_000)).toBe(
      'NgDoc: [2/4] rendering 312/664 pages (48%), 16s elapsed',
    );
    expect(compactText(running, 7_500, true)).toBe('NgDoc: rendering 664 pages, 48%, 7.5s');
    expect(stepText(running, { totals: true, live: true })).toBe('[2/4] rendering 664 pages (48%)');
    expect(stepText(running, { totals: true, percent: false })).toBe('[2/4] rendering 664 pages');
  });

  it('compact lines for Nx panes', () => {
    expect(
      compactText(view({ phase: 'render', totals: { render: 664 }, completed: 312 }), 7_500),
    ).toBe('NgDoc: rendering 312/664 pages, 48%, 7.5s');
    expect(compactText(view({ phase: 'link', totals: { link: 664 }, completed: 0 }), 7_500)).toBe(
      'NgDoc: linking 0/664 pages, 48%, 7.5s',
    );
    expect(
      compactText(
        view({ phase: 'link', phaseState: 'end', totals: { link: 664 }, completed: 664 }),
        7_500,
      ),
    ).toBe('NgDoc: linking 664 pages, 48%, 7.5s');
    expect(
      compactText(view({ phase: 'render', phaseState: 'end', totals: { render: 1 } }), 700),
    ).toBe('NgDoc: rendering 1 page, 48%, 0.7s');
    expect(compactText(view({ phase: 'render' }), 700)).toBe('NgDoc: rendering 48%, 0.7s');
    expect(compactText(view({ phase: undefined }), 700)).toBe('NgDoc: preparing 48%, 0.7s');
    expect(compactText(view({ stepped: false }), 12_000)).toBe(
      'NgDoc: generating documentation, 12s',
    );
    expect(startLine(view(), 'docs', true)).toBe('NgDoc: started (production)');
    expect(startLine(view({ mode: 'development' }))).toBe(
      'NgDoc: generating documentation (development)',
    );
  });

  it('the live line fits the terminal and never wraps', () => {
    const body = stepText(view({ phase: 'render', totals: { render: 664 }, completed: 312 }), {
      live: true,
    });
    expect(liveText(body, 9_400, 0.48, { frame: 4, unicode: true, columns: 120, bar: true })).toBe(
      '⠼ NgDoc [2/4] rendering 312/664 pages (48%) · 9s ━━━━━━──────',
    );
    expect(liveText(body, 9_400, 0.48, { frame: 1, unicode: false, columns: 60, bar: true })).toBe(
      '\\ NgDoc [2/4] rendering 312/664 pages (48%), 9s',
    );
    const narrow = liveText(body, 9_400, undefined, {
      frame: 0,
      unicode: true,
      columns: 30,
      bar: true,
    });
    expect([...narrow].length).toBe(29);
    expect(narrow.endsWith('…')).toBe(true);
    expect(liveText('x', 0, 2, { frame: 0, unicode: false, columns: 80, bar: true })).toBe(
      `- NgDoc x, 0s ${'#'.repeat(12)}`,
    );
    // Never wider than columns - 1, however narrow.
    for (const columns of [1, 2, 5, 10, 19])
      expect(
        [...liveText(body, 0, 0.5, { frame: 0, unicode: true, columns, bar: true })].length,
      ).toBeLessThanOrEqual(Math.max(1, columns - 1));
    expect(liveText('x', 0, -1, { frame: 0, unicode: false, columns: 5, bar: true })).toBe('- Ng');
    expect(truncate('abc', 5, true)).toBe('abc');
    expect(truncate('abcdef', 4, false)).toBe('abcd');
  });

  it('build summaries', () => {
    const phases = {
      boot: 800,
      semantic: 4_700,
      render: 5_100,
      keywords: 300,
      link: 2_000,
      transfer: 1_000,
      commit: 3_400,
    };
    expect(
      buildSummary(settled({ elapsedMs: 21_000, phases }, { rebuilt: 664, written: 6669 }), false),
    ).toBe(
      'NgDoc: OK generated 664 pages in 21s; 6669 files written; analyze 4.7s, render 5.4s, link 2.0s, write 4.4s',
    );
    expect(
      buildSummary(
        settled({ elapsedMs: 9_800, phases }, { rebuilt: 0, written: 0, unchanged: 6669 }),
        true,
      ),
    ).toBe(
      'NgDoc: \x1b[32mOK\x1b[39m generated 664 pages in 9.8s; 0 rebuilt, 6669 files unchanged',
    );
    expect(buildSummary(settled({}, { pages: 1, rebuilt: 1, removed: 3 }), false)).toBe(
      'NgDoc: OK generated 1 page in 0.9s; 3 files removed',
    );
    // A fast start compiled nothing: it says so, and nothing about rebuilt pages.
    expect(
      buildSummary(
        settled(
          { elapsedMs: 3_300, pass: 'restored' },
          { rebuilt: 0, written: 0, unchanged: 4600 },
        ),
        false,
      ),
    ).toBe('NgDoc: OK restored 664 pages in 3.3s (inputs unchanged); 4600 files unchanged');
    // Singular counts read as such.
    expect(buildSummary(settled({}, { pages: 1, rebuilt: 1, written: 1 }), false)).toBe(
      'NgDoc: OK generated 1 page in 0.9s; 1 file written',
    );
    expect(buildSummary(settled({}, { pages: 1, rebuilt: 1, removed: 1 }), false)).toBe(
      'NgDoc: OK generated 1 page in 0.9s; 1 file removed',
    );
    expect(buildSummary(settled({}, { pages: 2, rebuilt: 0, unchanged: 1 }), false)).toBe(
      'NgDoc: OK generated 2 pages in 0.9s; 0 rebuilt, 1 file unchanged',
    );
    expect(
      buildSummary(settled({ status: 'failure', elapsedMs: 12_000 }, { errors: 1 }), true),
    ).toBe('NgDoc: \x1b[31mFAILED\x1b[39m generation failed after 12s (1 error, see above)');
    expect(buildSummary(settled({ status: 'failure' }), false)).toBe(
      'NgDoc: FAILED generation failed after 0.9s (see above)',
    );
    expect(buildSummary(settled({ status: 'cancelled' }), false)).toBe(
      'NgDoc: generation cancelled after 0.9s',
    );
    expect(timingText({})).toBe('');
    expect(paint('x', 1, false)).toBe('x');
  });

  it('per-edit lines', () => {
    expect(editLine(settled({}, { routes: ['/getting-started/installation'] }))).toBe(
      'NgDoc: updated 1 of 664 pages in 0.9s (/getting-started/installation)',
    );
    expect(
      editLine(settled({ elapsedMs: 1_200 }, { rebuilt: 3, routes: ['', '/api/a', '/api/b'] })),
    ).toBe('NgDoc: updated 3 of 664 pages in 1.2s (/api/a, +2)');
    expect(editLine(settled({ elapsedMs: 6_800 }, { rebuilt: 664 }))).toBe(
      'NgDoc: updated 664 pages in 6.8s',
    );
    expect(editLine(settled({}, { rebuilt: 0, written: 2, removed: 1 }))).toBe(
      'NgDoc: updated 3 files in 0.9s',
    );
    expect(editLine(settled({}, { rebuilt: 0 }))).toBeUndefined();
    expect(editFailureLine(settled({}, { errors: 2 }))).toBe(
      'NgDoc: update failed (2 errors above); the site keeps the last good version',
    );
    expect(editFailureLine(settled())).toBe(
      'NgDoc: update failed; the site keeps the last good version',
    );
    expect(slowEditLine(view({ changes: 2 }))).toBe('NgDoc: updating (2 files changed)...');
    expect(slowEditLine(view())).toBe('NgDoc: updating...');
    expect(slowEditLine(view({ pass: 'full', restarted: true }))).toBe(
      'NgDoc: rebuilding all pages...',
    );
    expect(slowEditLine(view({ pass: 'full', reason: 'tsconfig.json changed' }))).toBe(
      'NgDoc: rebuilding all pages (tsconfig.json changed)...',
    );
    expect(slowEditLine(view({ pass: 'full' }))).toBe('NgDoc: updating...');
    expect(restartLine(view())).toBe('NgDoc: rebuilding all pages');
  });

  it('background, activity, verbose and switch lines', () => {
    expect(backgroundLabel('audit')).toBe('checking generated files');
    expect(backgroundLabel('watch')).toBe('updating in the background');
    expect(backgroundDone('audit', settled({ elapsedMs: 3_100 }, { rebuilt: 0, written: 2 }))).toBe(
      'NgDoc: checking generated files finished in 3.1s; updated 2 files',
    );
    expect(backgroundDone('confirmation', settled({}, { rebuilt: 0 }))).toBe(
      'NgDoc: confirming the last update finished in 0.9s; no changes',
    );
    expect(activityNotice('warming-up')).toBe('NgDoc: warming up...');
    expect(
      activityDone(
        { kind: 'progress-activity', activity: 'warming-up', state: 'end', elapsedMs: 9_500 },
        9_500,
      ),
    ).toBe('NgDoc: warm-up finished in 9.5s');
    expect(
      activityDone(
        {
          kind: 'progress-activity',
          activity: 'checking-inputs',
          state: 'end',
          failed: true,
          elapsedMs: 0,
        },
        1_200,
      ),
    ).toBe('NgDoc: input check failed after 1.2s; the next update may be slower');
    expect(phasesLine(settled())).toBeUndefined();
    expect(
      phasesLine(settled({ phases: { commit: 100, boot: 800 }, pass: 'full', reason: 'x' })),
    ).toBe('NgDoc: phases (full pass: x): boot 0.8s, commit 0.1s');
    expect(phasesLine(settled({ phases: { commit: 100 }, pass: 'targeted' }))).toBe(
      'NgDoc: phases (targeted pass): commit 0.1s',
    );
    expect(phasesLine(settled({ phases: { commit: 100 } }))).toBe('NgDoc: phases: commit 0.1s');
    expect(phasesLine(settled({ phases: { restore: 700, commit: 100 }, pass: 'restored' }))).toBe(
      'NgDoc: phases (fast start): restore 0.7s, commit 0.1s',
    );
    expect(switchesLine(['A=0 (a)', 'B=verify (b)'])).toBe(
      'NgDoc: engine switches set: A=0 (a), B=verify (b); builds and edits may be slower',
    );
  });
});

describe('CI extras', () => {
  it('escapes TeamCity service messages', () => {
    expect(escapeTeamCity("it's [1|2]\n\r")).toBe("it|'s |[1||2|]|n|r");
    expect(escapeTeamCity('a\u0085b\u2028c\u2029d')).toBe('a|xb|lc|pd');
    expect(neutralizeServiceMessages('x ##vso[task.x]y ##teamcity[z] ##[error]e ## plain')).toBe(
      'x vso[task.x]y teamcity[z] [error]e ## plain',
    );
    expect(ciProgressMessage('teamcity', 'NgDoc: a', undefined)).toBe(
      "##teamcity[progressMessage 'NgDoc: a']",
    );
  });

  it('Azure progress needs a percentage and stays on one line', () => {
    expect(ciProgressMessage('azure', 'NgDoc: a\nb', 48.9)).toBe(
      '##vso[task.setprogress value=48;]NgDoc: a b',
    );
    expect(ciProgressMessage('azure', 'x', 180)).toBe('##vso[task.setprogress value=100;]x');
    expect(ciProgressMessage('azure', 'x', undefined)).toBeUndefined();
    expect(ciProgressMessage('github', 'x', 1)).toBeUndefined();
    expect(ciProgressMessage(undefined, 'x', 1)).toBeUndefined();
  });

  it('sections for GitHub and GitLab only', () => {
    expect(sectionStart('github', 'T', 0)).toBe('::group::T');
    expect(sectionEnd('github', 0)).toBe('::endgroup::');
    expect(sectionStart('gitlab', 'T', 1_500)).toBe(
      '\x1b[0Ksection_start:1:ngdoc_generation[collapsed=true]\r\x1b[0KT',
    );
    expect(sectionEnd('gitlab', 2_500)).toBe('\x1b[0Ksection_end:2:ngdoc_generation\r\x1b[0K');
    expect(sectionStart('azure', 'T', 0)).toBeUndefined();
    expect(sectionEnd(undefined, 0)).toBeUndefined();
  });

  it('step summary: appended when configured, failures ignored', () => {
    const append = vi.fn();
    expect(appendStepSummary({}, 'NgDoc: OK', append)).toBe(false);
    expect(appendStepSummary({ GITHUB_STEP_SUMMARY: '/s.md' }, 'NgDoc: OK', append)).toBe(true);
    expect(append).toHaveBeenCalledWith('/s.md', '**NgDoc:** OK\n');
    expect(
      appendStepSummary({ GITHUB_STEP_SUMMARY: '/s.md' }, 'x', () => {
        throw new Error('EACCES');
      }),
    ).toBe(false);
  });
});

describe('SESSION_PROGRESS_FAILED: progress is advisory', () => {
  it('is a warning, never an error', () => {
    expect(progressFailure(new Error('boom'))).toEqual({
      code: SESSION_PROGRESS_FAILED,
      severity: 'warning',
      stage: 'host',
      message: 'Progress reporting failed and was skipped: boom',
    });
    expect(progressFailure('text').message).toMatch(/text$/);
    const hostile = {
      toString: () => {
        throw new Error('no');
      },
    };
    expect(progressFailure(hostile).message).toMatch(/Unknown error$/);
  });

  it('guards a sink: sync throws and rejections are reported once; events keep flowing', async () => {
    const report = vi.fn();
    const seen: string[] = [];
    let mode: 'throw' | 'reject' | 'ok' = 'throw';
    const sink = guardProgressSink((event) => {
      seen.push(event.kind);
      if (mode === 'throw') throw new Error('sync');
      if (mode === 'reject') return Promise.reject(new Error('async'));
      return undefined;
    }, report);
    const event = {
      kind: 'progress-activity',
      activity: 'warming-up',
      state: 'start',
      elapsedMs: 0,
    } as const;
    expect(() => sink(event)).not.toThrow();
    mode = 'reject';
    sink(event);
    await new Promise((resolve) => setImmediate(resolve));
    mode = 'ok';
    sink(event);
    expect(seen).toHaveLength(3);
    expect(report).toHaveBeenCalledTimes(1);
    expect(report.mock.calls[0][0]).toMatchObject({
      code: 'SESSION_PROGRESS_FAILED',
      severity: 'warning',
    });
  });

  it('a rejection first, and a throwing reporter, are contained', async () => {
    const sink = guardProgressSink(
      () => Promise.reject(new Error('late')),
      () => {
        throw new Error('reporter');
      },
    );
    sink({ kind: 'progress-activity', activity: 'warming-up', state: 'start', elapsedMs: 0 });
    await new Promise((resolve) => setImmediate(resolve));
    expect(true).toBe(true);
  });
});
