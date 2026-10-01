import { describe, expect, it, vi } from 'vitest';

import { NX_TASK_COLUMNS } from '../detect';
import type { ProgressEvent } from '../events';
import { CLEAR_LINE } from '../live';
import type { ProgressReporterOptions } from '../reporter';
import { createProgressReporter, systemClock } from '../reporter';
import type { ProgressSetting } from '../settings';
import type { CaptureOptions } from './harness/fake-io';
import { CaptureWriter, FakeClock, viteTimestamp } from './harness/fake-io';
import type { Scenario } from './harness/simulate';
import {
  activity,
  COLD_COUNTS,
  COLD_PHASES,
  edit,
  generation,
  replay,
  SCENARIOS,
} from './harness/simulate';
import { render } from './harness/vt';

interface Run {
  writer: CaptureWriter;
  clock: FakeClock;
  reporter: ReturnType<typeof createProgressReporter>;
}

function setup(
  setting: ProgressSetting,
  env: NodeJS.ProcessEnv = {},
  capture: CaptureOptions = {},
  extra: Partial<ProgressReporterOptions> = {},
): Run {
  const clock = new FakeClock();
  const writer = new CaptureWriter({ clock, ...capture });
  const reporter = createProgressReporter({
    writer,
    setting,
    env,
    platform: 'linux',
    clock,
    date: () => 1_790_000_000_000,
    exitHook: () => () => {},
    ...extra,
  });
  return { writer, clock, reporter };
}

function play(
  scenario: Scenario | string,
  run: Run,
  hooks: Parameters<typeof replay>[3] = [],
): Run {
  replay(
    typeof scenario === 'string' ? SCENARIOS[scenario]() : scenario,
    run.reporter,
    run.clock,
    hooks,
  );
  return run;
}

const golden = (name: string): string => `golden/${name}.txt`;

/** A readable transcript: every line, and every live frame marked with `~`. */
function transcript(writer: CaptureWriter): string {
  return writer.written
    .filter((entry) => entry.channel !== 'live' || entry.text !== '\r\x1b[2K')
    .map((entry) => {
      const time = `${(entry.at / 1000).toFixed(1).padStart(5)}s`;
      if (entry.channel === 'live') return `${time} ~ ${entry.text.replace('\r\x1b[2K', '')}`;
      return `${time} ${entry.channel === 'line' ? ' ' : entry.channel === 'summary' ? '>' : '@'} ${entry.text}`;
    })
    .join('\n')
    .concat('\n');
}

describe('golden output per host and environment', () => {
  it('CLI terminal, LIVE: cleared at the end, summary on stdout', async () => {
    const run = play('cold-build', setup('auto', {}, { tty: { columns: 120 }, summary: true }));
    const frames = run.writer.frames();
    expect(frames.length).toBeGreaterThan(20);
    expect(frames.every((frame) => [...frame].length <= 119 && !frame.includes('\n'))).toBe(true);
    expect(render(run.writer.terminal(), 10, 120).screen()).toBe(
      'NgDoc: OK generated 664 pages in 20s; 6669 files written; analyze 4.7s, render 5.4s, link 2.8s, write 5.3s',
    );
    await expect(transcript(run.writer)).toMatchFileSnapshot(golden('cli-live-cold'));
  });

  it('CI / piped LINES: a production build is about six lines', async () => {
    const run = play(
      'cold-build',
      setup('auto', { CI: 'true', GITHUB_ACTIONS: 'true', NX_TASK_TARGET_PROJECT: 'docs' }),
    );
    expect(run.writer.lines().length).toBeLessThanOrEqual(8);
    expect(run.writer.terminal()).not.toContain('\x1b');
    await expect(transcript(run.writer)).toMatchFileSnapshot(golden('ci-lines-production'));
  });

  it('warm development start', async () => {
    const run = play('warm-start', setup('summary'));
    expect(run.writer.lines()).toEqual([
      'NgDoc: OK generated 664 pages in 9.8s; 0 rebuilt, 6669 files unchanged',
    ]);
  });

  it('failure after the diagnostics', async () => {
    const run = play('failed-build', setup('plain'));
    expect(run.writer.lines().at(-1)).toBe(
      'NgDoc: FAILED generation failed after 12s (3 errors, see above)',
    );
    await expect(transcript(run.writer)).toMatchFileSnapshot(golden('failure-lines'));
  });

  it('first shipped state (session phases only): one step with elapsed time and heartbeat', async () => {
    const lines = play('cold-build-session-only', setup('plain'));
    await expect(transcript(lines.writer)).toMatchFileSnapshot(golden('session-only-lines'));
    const live = play(
      'cold-build-session-only',
      setup('auto', {}, { tty: { columns: 100 }, summary: true }),
    );
    expect(
      live.writer.frames().some((frame) => frame.includes('NgDoc generating documentation ·')),
    ).toBe(true);
    expect(live.writer.frames().some((frame) => frame.includes('writing 6669 files'))).toBe(true);
    expect(live.writer.frames().some((frame) => /[━─]/.test(frame))).toBe(false); // no bar without a fraction
  });

  it('ng-doc watch in a terminal: one line per completed edit; a superseded one is completed by the next', async () => {
    const run = play('watch-edits', setup('plain', {}, { summary: true }));
    expect(run.writer.lines()).toEqual([
      'NgDoc: updated 1 of 664 pages in 0.9s (/getting-started/installation)',
      'NgDoc: updated 3 of 664 pages in 0.9s (/api/core/functions/asArray, +2)',
      'NgDoc: finished in 0.9s; no changes',
      // The superseded edit's commit belongs to the edit its successor completes; the time is the successor's.
      'NgDoc: updated 1 of 664 pages in 0.9s (/getting-started/installation)',
    ]);
  });

  it('every completed edit prints exactly one line in every human style, even a 300 ms one', () => {
    const quick = edit(2, 0, {
      phases: [
        { phase: 'transfer', ms: 100 },
        { phase: 'commit', ms: 200, total: 23 },
      ],
    });
    for (const [setting, capture, extra] of [
      ['auto', { tty: { columns: 100 }, summary: true }, {}],
      ['auto', { tty: { columns: 100 } }, { foreign: true }],
      ['plain', {}, {}],
      ['verbose', {}, {}],
      ['summary', {}, {}],
      ['live', { tty: { columns: 100 } }, {}],
    ] as const) {
      const run = play(
        { name: 'quick', events: quick, end: 5_000 },
        setup(setting, {}, capture, extra),
      );
      const completions = run.writer.lines().filter((line) => line.startsWith('NgDoc: updated'));
      expect({ setting, completions }).toEqual({
        setting,
        completions: ['NgDoc: updated 1 of 664 pages in 0.3s (/getting-started/installation)'],
      });
      expect(run.writer.frames()).toEqual([]); // the in-progress line waits 1 s; the final line does not
    }
  });

  it('a fixed error always prints one resolved line, from an edit or from background work', () => {
    const failed = { pages: 664, rebuilt: 0, errors: 1, warnings: 0 };
    const fixedByEdit = play(
      {
        name: 'r',
        events: [
          ...edit(2, 0, { status: 'failure', counts: failed }),
          ...edit(3, 10_000),
          ...edit(4, 20_000),
        ],
        end: 30_000,
      },
      setup('summary'),
    );
    expect(fixedByEdit.writer.lines()).toEqual([
      'NgDoc: update failed (1 error above); the site keeps the last good version',
      'NgDoc: error resolved; updated 1 of 664 pages in 0.9s (/getting-started/installation)',
      'NgDoc: updated 1 of 664 pages in 0.9s (/getting-started/installation)',
    ]);
    // A fast idle confirmation is normally hidden, but not when it clears the reported error.
    const fixedInBackground = play(
      {
        name: 'r',
        events: [
          ...generation({
            generation: 1,
            trigger: 'build',
            phases: [],
            status: 'failure',
            counts: failed,
          }),
          ...generation({
            generation: 2,
            trigger: 'confirmation',
            start: 5_000,
            phases: [{ phase: 'commit', ms: 300, total: 2 }],
            status: 'success',
            counts: { pages: 664, rebuilt: 0, errors: 0, warnings: 0, written: 2 },
          }),
          ...generation({
            generation: 3,
            trigger: 'confirmation',
            start: 9_000,
            phases: [{ phase: 'commit', ms: 300, total: 2 }],
            status: 'success',
            counts: { pages: 664, rebuilt: 0, errors: 0, warnings: 0, written: 0 },
          }),
        ],
        end: 12_000,
      },
      setup('plain', {}, {}, { foreign: true }),
    );
    expect(fixedInBackground.writer.lines()).toEqual([
      'NgDoc: FAILED generation failed after 0.0s (1 error, see above)',
      'NgDoc: error resolved; updated 2 files in 0.3s',
    ]);
    // A superseded or cancelled generation does not clear it; the next success does.
    const later = play(
      {
        name: 'r',
        events: [
          ...edit(2, 0, { status: 'failure', counts: failed }),
          ...edit(3, 5_000, { status: 'superseded' }),
          ...edit(4, 6_000, { counts: { pages: 664, rebuilt: 0, errors: 0, warnings: 0 } }),
        ],
        end: 9_000,
      },
      setup('plain'),
    );
    expect(later.writer.lines().at(-1)).toBe(
      'NgDoc: error resolved; updated 1 of 664 pages in 0.9s (/getting-started/installation)',
    );
  });

  it('Vite dev server: summary before the banner, then timestamped edit lines', async () => {
    const run = setup('auto', {}, { tty: { columns: 100 }, timestamp: viteTimestamp });
    play('cold-build', run);
    run.reporter.setForeign();
    run.writer.written.push({
      channel: 'line',
      text: '  VITE v7.3.5  ready in 24112 ms',
      at: run.clock.now(),
    });
    const edits: Scenario = {
      name: 'vite-edits',
      events: [
        ...edit(2, 27_000),
        ...generation({
          generation: 3,
          trigger: 'watch',
          changes: 1,
          start: 52_000,
          phases: [
            { phase: 'semantic', ms: 300, pass: 'targeted' },
            { phase: 'render', ms: 250, total: 3 },
            { phase: 'transfer', ms: 120 },
            { phase: 'commit', ms: 530, total: 61 },
          ],
          status: 'success',
          counts: {
            pages: 664,
            rebuilt: 3,
            errors: 0,
            warnings: 0,
            written: 61,
            routes: ['/api/core/functions/asArray', '/api/core/functions/isPresent'],
          },
        }),
        ...SCENARIOS['slow-full-edit']().events.map((entry) => ({
          ...entry,
          at: entry.at + 100_000,
          event: { ...entry.event, generation: 4 } as ProgressEvent,
        })),
        ...edit(5, 130_000, {
          status: 'failure',
          counts: { pages: 664, rebuilt: 0, errors: 1, warnings: 0 },
        }),
      ],
      end: 140_000,
    };
    replay(edits, run.reporter, run.clock);
    const text = transcript(run.writer);
    expect(text).toContain(
      '@ 3:04:27 PM [vite] NgDoc: updated 1 of 664 pages in 0.9s (/getting-started/installation)',
    );
    expect(text).toContain(
      '@ 3:05:42 PM [vite] NgDoc: rebuilding all pages (tsconfig.json changed)...',
    );
    expect(text).toContain(
      'NgDoc: update failed (1 error above); the site keeps the last good version',
    );
    await expect(text).toMatchFileSnapshot(golden('vite-dev'));
  });

  it('vite build on CI', async () => {
    const run = play('cold-build', setup('auto', { CI: '1' }));
    expect(run.writer.lines()[0]).toBe('NgDoc: generating documentation (production)');
    await expect(transcript(run.writer)).toMatchFileSnapshot(golden('vite-build-ci'));
  });

  it('Angular builder: summary before the host starts, summaries after', async () => {
    const run = setup('auto', {}, { tty: { columns: 100, colors: false } });
    play('cold-build', run);
    run.reporter.setForeign();
    replay({ name: 'ng-edit', events: edit(2, 30_000), end: 31_000 }, run.reporter, run.clock);
    const lines = run.writer.lines();
    expect(lines).toEqual([
      'NgDoc: OK generated 664 pages in 20s; 6669 files written; analyze 4.7s, render 5.4s, link 2.8s, write 5.3s',
      'NgDoc: updated 1 of 664 pages in 0.9s (/getting-started/installation)',
    ]);
    // No redraw after the host started.
    expect(
      run.writer.written.filter((entry) => entry.channel === 'live' && entry.at > 20_600),
    ).toEqual([]);
  });

  it('Nx TUI / stream output: compact append-only lines, 5 s heartbeat', async () => {
    const run = play(
      'cold-build',
      setup(
        'auto',
        { NX_TASK_TARGET_PROJECT: 'docs', NX_STREAM_OUTPUT: 'true' },
        { tty: { columns: 160 } },
      ),
    );
    expect(run.writer.frames()).toEqual([]);
    // Progress lines fit a 46-column pane; only the summary wraps (harmlessly).
    expect(
      run.writer
        .lines()
        .slice(0, -1)
        .every((line) => line.length <= 46),
    ).toBe(true);
    await expect(transcript(run.writer)).toMatchFileSnapshot(golden('nx-shared'));
  });

  it('Azure and TeamCity hidden progress', async () => {
    const azure = play('cold-build', setup('auto', { TF_BUILD: 'True' }));
    await expect(transcript(azure.writer)).toMatchFileSnapshot(golden('azure'));
    const teamcity = play('cold-build', setup('auto', { TEAMCITY_VERSION: '2025.1' }));
    expect(
      teamcity.writer.lines().filter((line) => line.startsWith('##teamcity[progressMessage'))
        .length,
    ).toBeGreaterThan(3);
    expect(
      play('cold-build', setup('plain', { TF_BUILD: 'True' }))
        .writer.lines()
        .some((line) => line.startsWith('##vso')),
    ).toBe(false);
  });

  it('GitHub sections, opt-in, with the step summary', async () => {
    const appended: string[] = [];
    const run = play(
      'cold-build',
      setup(
        'auto',
        {
          CI: 'true',
          GITHUB_ACTIONS: 'true',
          NGDOC_PROGRESS_SECTIONS: '1',
          GITHUB_STEP_SUMMARY: '/summary.md',
        },
        {},
        {
          appendFile: (file, data) => appended.push(`${file}: ${data}`),
        },
      ),
    );
    const lines = run.writer.lines();
    expect(lines[0]).toBe('::group::NgDoc: generating documentation (production)');
    expect(lines.at(-2)).toBe('::endgroup::');
    expect(lines.at(-1)).toMatch(/^NgDoc: OK generated/);
    expect(appended).toEqual([
      `/summary.md: **NgDoc:** ${lines.at(-1)!.slice('NgDoc: '.length)}\n`,
    ]);
  });

  it('GitLab sections, opt-in', () => {
    const run = play(
      'cold-build',
      setup('auto', { CI: 'true', GITLAB_CI: 'true', NGDOC_PROGRESS_SECTIONS: 'on' }),
    );
    const lines = run.writer.lines();
    expect(lines[0]).toBe(
      '\x1b[0Ksection_start:1790000000:ngdoc_generation[collapsed=true]\r\x1b[0KNgDoc: generating documentation (production)',
    );
    expect(lines.at(-2)).toBe('\x1b[0Ksection_end:1790000000:ngdoc_generation\r\x1b[0K');
  });

  it('background work: hidden unless it fails or takes longer than 2 s; the warm-up only in verbose', async () => {
    const run = play(
      'background',
      setup(
        'plain',
        { NGDOC_TARGETED_REBUILD: '0' },
        { timestamp: viteTimestamp },
        { foreign: true },
      ),
    );
    await expect(transcript(run.writer)).toMatchFileSnapshot(golden('background'));
    const lines = run.writer.lines();
    expect(lines[0]).toMatch(
      /NgDoc: engine switches set: NGDOC_TARGETED_REBUILD=0 \(edits rebuild all pages\)/,
    );
    expect(lines.some((line) => line.includes('confirming'))).toBe(false);
    expect(lines.some((line) => line.includes('checking inputs'))).toBe(false);
    expect(lines.some((line) => line.includes('warm'))).toBe(false);
  });

  it('a warm-up that other work stopped says so, in verbose output only', () => {
    const stopped = (setting: ProgressSetting) =>
      play(
        {
          name: 'stopped-warm-up',
          events: [
            activity('warming-up', 0, 3_000)[0],
            {
              at: 3_000,
              event: {
                kind: 'progress-activity',
                activity: 'warming-up',
                state: 'end',
                stopped: true,
                elapsedMs: 3_000,
              },
            },
          ],
          end: 4_000,
        },
        setup(setting),
      ).writer.lines();
    expect(stopped('verbose')).toEqual([
      'NgDoc: warming up...',
      'NgDoc: warm-up stopped after 3.0s',
    ]);
    expect(stopped('plain')).toEqual([]);
  });

  it('verbose adds phases, the FULL reason, superseded and background notices', async () => {
    const run = setup('verbose');
    play('slow-full-edit', run);
    replay(
      {
        name: 'more',
        events: [
          ...edit(3, 10_000, { status: 'superseded' }),
          // The successor a superseded generation always has.
          ...edit(4, 11_000),
          ...SCENARIOS['background']()
            .events.slice(2)
            .map((entry) => ({
              ...entry,
              at: entry.at + 20_000,
              event:
                'generation' in entry.event
                  ? ({ ...entry.event, generation: entry.event.generation + 10 } as ProgressEvent)
                  : entry.event,
            })),
        ],
        end: 70_000,
      },
      run.reporter,
      run.clock,
    );
    await expect(transcript(run.writer)).toMatchFileSnapshot(golden('verbose'));
  });

  it('json: the accepted events, one per line', () => {
    const run = play('supersession', setup('json'));
    const events = run.writer.lines().map((line) => JSON.parse(line) as ProgressEvent);
    expect(events[0]).toMatchObject({ kind: 'progress-started', generation: 3 });
    // Generation 3's late tail is dropped.
    const afterFour = events.slice(
      events.findIndex((event) => event.kind === 'progress-started' && event.generation === 4),
    );
    expect(afterFour.every((event) => !('generation' in event) || event.generation === 4)).toBe(
      true,
    );
    expect(events.at(-1)).toMatchObject({
      kind: 'progress-settled',
      generation: 4,
      status: 'success',
    });
  });

  it('off prints nothing at all', () => {
    const run = play('failed-build', setup('off', { NGDOC_PERSISTENT_WORKER: '0' }, { tty: {} }));
    expect(run.writer.written).toEqual([]);
    expect(run.clock.pending).toBe(0);
  });
});

describe('reporter behaviour', () => {
  it('drops a superseded generation and restarts once in LINES', async () => {
    const run = play('supersession', setup('plain'));
    const lines = run.writer.lines();
    expect(lines.filter((line) => line === 'NgDoc: inputs changed, restarting')).toHaveLength(1);
    expect(lines.filter((line) => line.startsWith('NgDoc: OK'))).toHaveLength(1);
    expect(lines.some((line) => line.includes('cancelled'))).toBe(false);
  });

  it('never flashes a live line for a sub-second edit (CLI watch, own terminal)', () => {
    const run = play(
      { name: 'e', events: edit(2, 0), end: 5_000 },
      setup('auto', {}, { tty: {}, summary: true }),
    );
    expect(run.writer.frames()).toEqual([]);
    expect(run.writer.lines()).toEqual([
      'NgDoc: updated 1 of 664 pages in 0.9s (/getting-started/installation)',
    ]);
  });

  it('draws a live line for a slow edit and clears it', () => {
    const run = play('slow-full-edit', setup('auto', {}, { tty: { columns: 80 } }));
    expect(run.writer.frames().length).toBeGreaterThan(5);
    expect(render(run.writer.terminal(), 5, 80).screen()).toBe('NgDoc: updated 664 pages in 6.8s');
  });

  it('prints a slow edit notice once, and the edit line after it even when nothing changed', () => {
    const slow = edit(2, 0, {
      phases: [{ phase: 'transfer', ms: 2_500 }],
      counts: { pages: 664, rebuilt: 0, errors: 0, warnings: 0, written: 0, unchanged: 6_669 },
    });
    const run = play(
      { name: 's', events: slow, end: 10_000 },
      setup('plain', {}, {}, { foreign: true }),
    );
    expect(run.writer.lines()).toEqual([
      'NgDoc: updating (1 file changed)...',
      'NgDoc: finished in 2.5s; no changes',
    ]);
    // Summary style skips the notice but still completes the edit.
    const quiet = play({ name: 's', events: slow, end: 10_000 }, setup('summary'));
    expect(quiet.writer.lines()).toEqual(['NgDoc: finished in 2.5s; no changes']);
  });

  it('summary mode: final lines only', () => {
    const run = play('cold-build', setup('summary', { CI: 'true', TF_BUILD: 'True' }, { tty: {} }));
    expect(run.writer.lines()).toHaveLength(1);
    expect(run.writer.frames()).toEqual([]);
  });

  it('foreign mid-build: stops redrawing, still ends with the summary', () => {
    const run = setup('auto', {}, { tty: { columns: 100 } });
    play('cold-build', run, [{ at: 3_000, run: () => run.reporter.setForeign() }]);
    expect(
      run.writer.written.filter((entry) => entry.channel === 'live' && entry.at > 3_000),
    ).toEqual([]);
    expect(run.writer.lines()).toHaveLength(1);
    run.reporter.setForeign(); // idempotent
  });

  it('LIVE shows the input check only past 1 s, in its own line', () => {
    const run = play(
      { name: 'a', events: [...activity('checking-inputs', 0, 3_000)], end: 4_000 },
      setup('auto', {}, { tty: { columns: 80 } }),
    );
    expect(run.writer.frames()[0]).toMatch(/NgDoc checking inputs · 1s$/);
    expect(render(run.writer.terminal()).screen()).toBe('');
  });

  it('activity: a failed warm-up is always reported; a fast one is silent', () => {
    const run = play(
      {
        name: 'a',
        events: [...activity('warming-up', 0, 500, true), ...activity('warming-up', 1_000, 500)],
        end: 4_000,
      },
      setup('summary'),
    );
    expect(run.writer.lines()).toEqual([
      'NgDoc: warm-up failed after 0.5s; the next update may be slower',
    ]);
  });

  it('activity: an end without a start is ignored; one during a generation is still handled', () => {
    const run = setup('verbose');
    run.reporter.handle(
      generation({
        generation: 1,
        trigger: 'build',
        phases: [],
        status: 'success',
        counts: COLD_COUNTS,
      })[0].event,
    );
    run.reporter.handle({
      kind: 'progress-activity',
      activity: 'checking-inputs',
      state: 'end',
      elapsedMs: 0,
    });
    const activityLines = () => run.writer.lines().filter((line) => /warm|input/.test(line));
    expect(activityLines()).toEqual([]);
    run.reporter.handle({
      kind: 'progress-activity',
      activity: 'warming-up',
      state: 'start',
      elapsedMs: 0,
    });
    expect(activityLines()).toEqual(['NgDoc: warming up...']);
  });

  it('a warm-up failure is never lost: not to an edit that starts meanwhile, nor to an input check', () => {
    const failedWarmUp = (at: number, ms: number) => activity('warming-up', at, ms, true);
    // The warm-up runs past 2 s while an edit starts: its notice is dropped (stale), its failure prints.
    const duringEdit = play(
      {
        name: 'warm-up-during-edit',
        events: [
          ...failedWarmUp(0, 4_000).slice(0, 1),
          ...edit(2, 1_000),
          failedWarmUp(0, 4_000)[1],
        ],
        end: 8_000,
      },
      setup('plain'),
    );
    expect(duringEdit.writer.lines()).toEqual([
      'NgDoc: updated 1 of 664 pages in 0.9s (/getting-started/installation)',
      'NgDoc: warm-up failed after 4.0s; the next update may be slower',
    ]);
    // Overlapping activities are tracked per kind.
    const overlapping = play(
      {
        name: 'overlapping-activities',
        events: [
          activity('warming-up', 0, 500, true)[0],
          ...activity('checking-inputs', 100, 200),
          activity('warming-up', 0, 500, true)[1],
        ].sort((a, b) => a.at - b.at),
        end: 3_000,
      },
      setup('summary'),
    );
    expect(overlapping.writer.lines()).toEqual([
      'NgDoc: warm-up failed after 0.5s; the next update may be slower',
    ]);
    // A slow warm-up's notice does not fire after an edit replaced it.
    const stale = play(
      {
        name: 'stale-warm-up-notice',
        events: [activity('warming-up', 0, 20_000)[0], ...edit(2, 1_500)],
        end: 10_000,
      },
      setup('plain'),
    );
    expect(stale.writer.lines()).toEqual([
      'NgDoc: updated 1 of 664 pages in 0.9s (/getting-started/installation)',
    ]);
  });

  it('a printed notice is always answered: by the successor, or by a cancelled line', () => {
    const slow = { phases: [{ phase: 'transfer' as const, ms: 3_000 }] };
    const cancelled = play(
      { name: 'c', events: edit(2, 0, { ...slow, status: 'cancelled' }), end: 5_000 },
      setup('plain'),
    );
    expect(cancelled.writer.lines()).toEqual([
      'NgDoc: updating (1 file changed)...',
      'NgDoc: update cancelled after 3.0s',
    ]);
    const background = play(
      {
        name: 'b',
        events: generation({
          generation: 2,
          trigger: 'audit',
          phases: [{ phase: 'transfer', ms: 3_000 }],
          status: 'cancelled',
          counts: { pages: 1, rebuilt: 0, errors: 0, warnings: 0 },
        }),
        end: 5_000,
      },
      setup('plain'),
    );
    expect(background.writer.lines()).toEqual([
      'NgDoc: checking generated files...',
      'NgDoc: checking generated files cancelled after 3.0s',
    ]);
    // Superseded after its notice, then a fast successor: one answer, from the successor.
    const superseded = play(
      {
        name: 's',
        events: [...edit(2, 0, { ...slow, status: 'superseded' }), ...edit(3, 3_000)],
        end: 6_000,
      },
      setup('plain'),
    );
    expect(superseded.writer.lines()).toEqual([
      'NgDoc: updating (1 file changed)...',
      'NgDoc: updated 1 of 664 pages in 0.9s (/getting-started/installation)',
    ]);
    // A background notice replaced by a hidden background successor still gets its answer.
    const replaced = play(
      {
        name: 'r',
        events: [
          ...generation({
            generation: 2,
            trigger: 'audit',
            phases: [{ phase: 'transfer', ms: 3_000 }],
            status: 'success',
            counts: { pages: 1, rebuilt: 0, errors: 0, warnings: 0 },
            truncateAfter: 3,
          }),
          ...generation({
            generation: 3,
            trigger: 'confirmation',
            start: 3_000,
            phases: [{ phase: 'transfer', ms: 200 }],
            status: 'success',
            counts: { pages: 1, rebuilt: 0, errors: 0, warnings: 0, written: 1 },
          }),
        ],
        end: 6_000,
      },
      setup('plain'),
    );
    expect(replaced.writer.lines()).toEqual([
      'NgDoc: checking generated files...',
      'NgDoc: confirming the last update finished in 0.2s; updated 1 file',
    ]);
  });

  it('a superseded or replaced build is finished by its successor with exactly one build summary', async () => {
    const build = (overrides: Parameters<typeof generation>[0]['status']) =>
      generation({
        generation: 1,
        trigger: 'build',
        phases: COLD_PHASES,
        status: overrides,
        counts: COLD_COUNTS,
      });
    // Replaced: a file is saved during the cold development start; generation 1 never settles.
    const replacedEvents = [
      ...build('success').filter((entry) => entry.at < 9_000),
      ...edit(2, 9_000, {
        phases: COLD_PHASES.slice(5),
        counts: { ...COLD_COUNTS, routes: ['/getting-started/installation'] },
      }),
    ];
    // Superseded: generation 1 committed, then generation 2 continues.
    const supersededEvents = [...build('superseded'), ...edit(2, 21_000)];
    const text: string[] = [];
    for (const [name, events] of [
      ['replaced', replacedEvents],
      ['superseded', supersededEvents],
    ] as const) {
      for (const setting of ['plain', 'summary'] as const) {
        const run = play({ name, events, end: 40_000 }, setup(setting));
        const lines = run.writer.lines();
        expect(lines.filter((line) => line.startsWith('NgDoc: OK generated'))).toHaveLength(1);
        expect(lines.some((line) => line.startsWith('NgDoc: updated'))).toBe(false);
        text.push(`== ${name}, ${setting}`, ...transcript(run.writer).trimEnd().split('\n'));
      }
      const live = play(
        { name, events, end: 40_000 },
        setup('auto', {}, { tty: { columns: 100 } }),
      );
      expect(render(live.writer.terminal(), 10, 100).screen()).toMatch(
        /^NgDoc: OK generated 664 pages/,
      );
    }
    await expect(`${text.join('\n')}\n`).toMatchFileSnapshot(golden('build-superseded'));
  });

  it('reads the terminal width at every draw, and draws nothing when it is too narrow', () => {
    const run = setup('auto', {}, { tty: { columns: 120 } });
    const stream = run.writer.live!;
    play('cold-build', run, [
      { at: 5_050, run: () => (stream.columns = 40) },
      { at: 10_050, run: () => (stream.columns = 12) },
      { at: 15_050, run: () => (stream.columns = 60) },
    ]);
    const frames = run.writer.written.filter(
      (entry) => entry.channel === 'live' && entry.text !== CLEAR_LINE,
    );
    const width = (text: string) => [...text.replace(CLEAR_LINE, '')].length;
    // A draw due at a resize instant runs before the resize in the replay: compare strictly after.
    const between = (from: number, to: number) =>
      frames.filter((entry) => entry.at > from && entry.at <= to);
    expect(between(0, 5_050).some((entry) => width(entry.text) > 39)).toBe(true);
    expect(between(5_050, 10_050).every((entry) => width(entry.text) <= 39)).toBe(true);
    expect(between(5_050, 10_050).length).toBeGreaterThan(0);
    expect(between(10_050, 15_050)).toEqual([]);
    expect(between(15_050, 60_000).every((entry) => width(entry.text) <= 59)).toBe(true);
    expect(between(15_050, 60_000).length).toBeGreaterThan(0);
    // Under an Nx task the width is capped whatever the stream reports.
    const nx = play(
      'cold-build',
      setup('auto', { NX_TASK_TARGET_PROJECT: 'p' }, { tty: { columns: 200 } }),
    );
    expect(nx.writer.frames().every((frame) => [...frame].length <= NX_TASK_COLUMNS - 1)).toBe(
      true,
    );
  });

  it('foreign "summaries" keeps results only; "notices" keeps the slow-edit notice', () => {
    const slow = edit(2, 0, { phases: [{ phase: 'transfer', ms: 3_000 }] });
    const notices = play(
      { name: 'n', events: slow, end: 5_000 },
      setup('auto', {}, { tty: {} }, { foreign: 'notices' }),
    );
    expect(notices.writer.lines()[0]).toBe('NgDoc: updating (1 file changed)...');
    const summaries = play(
      { name: 's', events: slow, end: 5_000 },
      setup('auto', {}, { tty: {} }, { foreign: 'summaries' }),
    );
    expect(summaries.writer.lines()).toEqual([
      'NgDoc: updated 1 of 664 pages in 3.0s (/getting-started/installation)',
    ]);
    // Switching to summaries mid-edit cancels a pending notice; back to notices re-arms it.
    const switched = setup('plain');
    play({ name: 'w', events: slow, end: 5_000 }, switched, [
      { at: 500, run: () => switched.reporter.setForeign('summaries') },
    ]);
    expect(switched.writer.lines()).toEqual([
      'NgDoc: updated 1 of 664 pages in 3.0s (/getting-started/installation)',
    ]);
    const rearmed = setup('plain', {}, {}, { foreign: 'summaries' });
    play({ name: 'w', events: slow, end: 5_000 }, rearmed, [
      { at: 500, run: () => rearmed.reporter.setForeign('notices') },
    ]);
    expect(rearmed.writer.lines()[0]).toBe('NgDoc: updating (1 file changed)...');
    // Warm-up notices follow the same rule.
    const warm = play(
      { name: 'a', events: activity('warming-up', 0, 5_000), end: 6_000 },
      setup('plain', {}, {}, { foreign: 'summaries' }),
    );
    expect(warm.writer.lines()).toEqual([]);
    const switchedWarm = setup('plain');
    play({ name: 'a', events: activity('warming-up', 0, 5_000), end: 6_000 }, switchedWarm, [
      { at: 500, run: () => switchedWarm.reporter.setForeign('summaries') },
    ]);
    expect(switchedWarm.writer.lines()).toEqual([]);
  });

  it('a build that succeeds after a reported failure says so in its one summary line', () => {
    const failed = { pages: 664, rebuilt: 0, errors: 1, warnings: 0 };
    const run = play(
      {
        name: 'build-after-failure',
        events: [
          ...edit(2, 0, { status: 'failure', counts: failed }),
          ...generation({
            generation: 3,
            trigger: 'build',
            start: 5_000,
            phases: [{ phase: 'commit', ms: 100, total: 6_669 }],
            status: 'success',
            counts: COLD_COUNTS,
          }),
        ],
        end: 9_000,
      },
      setup('summary'),
    );
    expect(run.writer.lines()).toEqual([
      'NgDoc: update failed (1 error above); the site keeps the last good version',
      'NgDoc: error resolved; OK generated 664 pages in 0.1s; 6669 files written; write 0.1s',
    ]);
  });

  it('json goes to the json channel when the host has one', () => {
    const json: string[] = [];
    const run = setup('json');
    const writer = run.writer as CaptureWriter & { json?: (text: string) => void };
    writer.json = (text) => json.push(text);
    play('warm-start', run);
    expect(run.writer.lines()).toEqual([]);
    expect(JSON.parse(json[0])).toMatchObject({ kind: 'progress-started' });
  });

  it('free text can never become a CI service message', () => {
    const run = play(
      {
        name: 'inject',
        events: edit(2, 0, {
          counts: {
            pages: 2,
            rebuilt: 1,
            errors: 0,
            warnings: 0,
            routes: ['/##vso[task.setvariable variable=x]1', '##teamcity[x]', '##[error]x'],
          },
        }),
        end: 2_000,
      },
      setup('auto', { TF_BUILD: 'True' }),
    );
    expect(run.writer.lines()).toEqual([
      'NgDoc: updated 1 of 2 pages in 0.9s (/vso[task.setvariable variable=x]1)',
    ]);
    expect(run.writer.lines().join('\n')).not.toMatch(/##(vso|teamcity)?\[/);
  });

  it('runs of # and control characters cannot smuggle a service message or a terminal sequence', () => {
    const injected = [
      '/a####vso[task.setvariable variable=x]1',
      '/b\n::error::forged',
      '/c\x1b]0;pwned\x07\x1b[2J',
    ];
    const run = play(
      {
        name: 'inject-2',
        events: [
          ...generation({
            generation: 1,
            trigger: 'watch',
            changes: 1,
            phases: [
              { phase: 'semantic', ms: 200, pass: 'targeted' },
              {
                phase: 'discovery',
                ms: 2_500,
                pass: 'full',
                reason: '####[error]x\r\n::warning::y z',
              },
            ],
            status: 'success',
            counts: { pages: 5, rebuilt: 3, errors: 0, warnings: 0, routes: injected },
          }),
        ],
        end: 5_000,
      },
      setup(
        'plain',
        { TF_BUILD: 'True' },
        {},
        { project: 'docs\n##vso[task.complete]', foreign: true },
      ),
    );
    const text = run.writer.lines().join('\n');
    expect(run.writer.lines()).toEqual([
      'NgDoc: rebuilding all pages ([error]x  ::warning::y z)...',
      'NgDoc: updated 3 of 5 pages in 2.7s (/avso[task.setvariable variable=x]1, +2)',
    ]);
    // eslint-disable-next-line no-control-regex
    expect(text).not.toMatch(/#(vso|teamcity)?\[|\x1b|\x07|^::/m);
    // The project name reaches the LINES start line only as one plain line.
    const build = play('cold-build', setup('plain', {}, {}, { project: 'docs\n####vso[x]' }));
    expect(build.writer.lines()[0]).toBe(
      'NgDoc: generating documentation for docs vso[x] (production)',
    );
  });

  it('a superseded edit waits 1 s for its successor, then prints its own result; dispose flushes it too', () => {
    const lonely = play(
      { name: 'lonely', events: edit(2, 0, { status: 'superseded' }), end: 5_000 },
      setup('plain'),
    );
    expect(lonely.writer.written.map((entry) => [entry.at, entry.text])).toEqual([
      [1_900, 'NgDoc: updated 1 of 664 pages in 0.9s (/getting-started/installation)'],
    ]);
    const disposed = setup('summary');
    replay(
      { name: 'disposed', events: edit(2, 0, { status: 'superseded' }), end: 950 },
      disposed.reporter,
      disposed.clock,
    );
    expect(disposed.writer.lines()).toEqual([]);
    disposed.reporter.dispose();
    expect(disposed.writer.lines()).toEqual([
      'NgDoc: updated 1 of 664 pages in 0.9s (/getting-started/installation)',
    ]);
    // A superseded build without a successor still prints its summary.
    const build = play(
      {
        name: 'lonely-build',
        events: generation({
          generation: 1,
          trigger: 'build',
          phases: COLD_PHASES,
          status: 'superseded',
          counts: COLD_COUNTS,
        }),
        end: 30_000,
      },
      setup('summary'),
    );
    expect(build.writer.lines()).toEqual([
      'NgDoc: OK generated 664 pages in 20s; 6669 files written; analyze 4.7s, render 5.4s, link 2.8s, write 5.3s',
    ]);
    // A superseded hidden background run stays hidden.
    const hidden = play(
      {
        name: 'hidden',
        events: generation({
          generation: 1,
          trigger: 'audit',
          phases: [{ phase: 'commit', ms: 300 }],
          status: 'superseded',
          counts: { pages: 1, rebuilt: 0, errors: 0, warnings: 0, written: 1 },
        }),
        end: 5_000,
      },
      setup('plain'),
    );
    expect(hidden.writer.lines()).toEqual([]);
  });

  it('a continued edit reports its own time with the merged pages, files and newest route first', () => {
    const run = play(
      {
        name: 'merged-edit',
        events: [
          ...edit(2, 0, {
            status: 'superseded',
            counts: {
              pages: 664,
              rebuilt: 2,
              errors: 0,
              warnings: 0,
              written: 40,
              routes: ['/old/a', '/old/b'],
            },
          }),
          ...edit(3, 1_000, {
            counts: {
              pages: 664,
              rebuilt: 1,
              errors: 0,
              warnings: 0,
              written: 23,
              routes: ['/new'],
            },
          }),
        ],
        end: 5_000,
      },
      setup('verbose'),
    );
    expect(run.writer.lines()).toContain('NgDoc: updated 2 of 664 pages in 0.9s (/new, +1)');
    // Phases are the successor's own for an edit.
    expect(run.writer.lines().at(-1)).toBe(
      'NgDoc: phases (targeted pass): semantic 0.3s, render 0.2s, link 0.1s, transfer 0.0s, commit 0.1s',
    );
  });

  it('merged files written never exceed the real output count; a continued build never shows a lower percentage', () => {
    const run = setup('auto', {}, { tty: { columns: 120 } });
    play(
      {
        name: 'merged-build',
        events: [
          ...generation({
            generation: 1,
            trigger: 'build',
            phases: COLD_PHASES,
            status: 'superseded',
            counts: COLD_COUNTS,
          }),
          ...generation({
            generation: 2,
            trigger: 'watch',
            start: 21_000,
            phases: COLD_PHASES.slice(0, 7),
            status: 'success',
            counts: { ...COLD_COUNTS, written: 6_669 },
          }),
        ],
        end: 40_000,
      },
      run,
    );
    const summary = run.writer.lines().at(-1)!;
    expect(summary).toMatch(/; 6669 files written;/);
    const percents = run.writer
      .frames()
      .map((frame) => Number(/\((\d+)%\)/.exec(frame)?.[1] ?? '-1'))
      .filter((n) => n >= 0);
    expect(percents.length).toBeGreaterThan(10);
    for (let index = 1; index < percents.length; index++)
      expect(percents[index]).toBeGreaterThanOrEqual(percents[index - 1]);
  });

  it('a throwing writer stops the reporter and reports once; nothing throws', () => {
    const onError = vi.fn();
    const run = setup('plain', {}, { failOn: 2 }, { onError });
    expect(() => play('cold-build', run)).not.toThrow();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(run.clock.pending).toBe(0);
    run.reporter.handle(SCENARIOS['cold-build']().events[0].event);
    run.reporter.setForeign();
    run.reporter.dispose();
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it('a throwing onError is contained too', () => {
    const run = setup(
      'plain',
      {},
      { failOn: 1 },
      {
        onError: () => {
          throw new Error('boom');
        },
      },
    );
    expect(() => play('cold-build', run)).not.toThrow();
  });

  it('a throwing live stream during a timer tick is contained', () => {
    const onError = vi.fn();
    const clock = new FakeClock();
    const reporter = createProgressReporter({
      writer: {
        line: () => {},
        live: {
          isTTY: true,
          columns: 80,
          write: () => {
            throw new Error('EPIPE');
          },
        },
      },
      setting: 'auto',
      env: {},
      clock,
      exitHook: () => () => {},
      onError,
    });
    replay(SCENARIOS['cold-build'](), reporter, clock);
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it('dispose clears the live line synchronously and prints no summary', () => {
    const run = setup('auto', {}, { tty: { columns: 100 } });
    const events = SCENARIOS['cold-build']().events;
    replay(
      { name: 'part', events: events.filter((entry) => entry.at < 5_000), end: 5_000 },
      run.reporter,
      run.clock,
    );
    expect(run.writer.frames().length).toBeGreaterThan(0);
    run.reporter.dispose();
    run.reporter.dispose();
    expect(render(run.writer.terminal()).screen()).toBe('');
    expect(run.clock.pending).toBe(0);
    run.reporter.handle(events.at(-1)!.event);
    expect(run.writer.lines()).toEqual([]);
  });

  it('clears the live line at process exit', () => {
    let exit: (() => void) | undefined;
    let removed = 0;
    const run = setup(
      'auto',
      {},
      { tty: { columns: 100 } },
      {
        exitHook: (callback) => {
          exit = callback;
          return () => removed++;
        },
      },
    );
    replay(
      {
        name: 'part',
        events: SCENARIOS['cold-build']().events.filter((entry) => entry.at < 3_000),
        end: 3_000,
      },
      run.reporter,
      run.clock,
    );
    exit?.();
    expect(render(run.writer.terminal()).screen()).toBe('');
    expect(removed).toBeGreaterThan(0);
  });

  it('uses the system clock, environment and settings by default', () => {
    const lines: string[] = [];
    const previous = process.env['NGDOC_PROGRESS'];
    process.env['NGDOC_PROGRESS'] = 'summary';
    try {
      const reporter = createProgressReporter({ writer: { line: (text) => lines.push(text) } });
      expect(reporter.environment.style).toBe('summary');
      for (const entry of SCENARIOS['warm-start']().events) reporter.handle(entry.event);
      reporter.dispose();
    } finally {
      if (previous === undefined) delete process.env['NGDOC_PROGRESS'];
      else process.env['NGDOC_PROGRESS'] = previous;
    }
    expect(lines.at(-1)).toMatch(/^NgDoc: OK generated 664 pages/);
    const handle = systemClock.setTimeout(() => {}, 10_000);
    systemClock.clearTimeout(handle);
    expect(systemClock.now()).toBeGreaterThan(0);
  });

  it('a cancelled build reports its end; a cancelled edit is silent', () => {
    const run = play(
      {
        name: 'c',
        events: [
          ...generation({
            generation: 1,
            trigger: 'build',
            phases: COLD_PHASES.slice(0, 2),
            status: 'cancelled',
            counts: COLD_COUNTS,
          }),
          ...edit(2, 5_000, { status: 'cancelled' }),
        ],
        end: 9_000,
      },
      setup('summary'),
    );
    expect(run.writer.lines()).toEqual(['NgDoc: generation cancelled after 1.3s']);
  });

  it('build warnings and removed files appear in the summary', () => {
    const run = play(
      {
        name: 'w',
        events: generation({
          generation: 1,
          trigger: 'build',
          phases: [{ phase: 'commit', ms: 1_000, total: 10 }],
          status: 'success',
          counts: { pages: 10, rebuilt: 10, errors: 0, warnings: 2, written: 8, removed: 2 },
        }),
        end: 2_000,
      },
      setup('summary', {}, {}, { platform: undefined }),
    );
    expect(run.writer.lines()).toEqual([
      'NgDoc: OK generated 10 pages in 1.0s; 8 files written, 2 removed; write 1.0s; 2 warnings',
    ]);
  });
});
