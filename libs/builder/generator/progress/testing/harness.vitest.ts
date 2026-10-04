import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { CiCase } from './harness/ci-matrix';
import { CI_MATRIX } from './harness/ci-matrix';
import { bundleChild, cleanEnv, ptySupport, runInPty, runPiped } from './harness/pty';
import { COLD_COUNTS, generation, SCENARIOS } from './harness/simulate';
import { render, VirtualTerminal } from './harness/vt';

/** No escape bytes other than SGR colour. */
// The patterns below match terminal escape sequences.
// eslint-disable-next-line no-control-regex
const withoutColour = (text: string): string => text.replace(/\x1b\[\d+m/g, '');

describe('VT emulator', () => {
  it('handles CR, erase in line, wrap, scroll and scrollback (LF acts as CR LF, like a PTY)', () => {
    const terminal = new VirtualTerminal(3, 10);
    terminal.feed('hello\r\x1b[2Kworld\n').feed('0123456789ABC\nlast');
    expect(terminal.screen()).toBe('0123456789\nABC\nlast');
    expect(terminal.scrollback).toEqual(['world']);
    terminal.feed('\nmore');
    expect(terminal.transcript()).toBe('world\n0123456789\nABC\nlast\nmore');
  });

  it('cursor moves, erase in display, alternate screen, OSC and split escapes', () => {
    const terminal = new VirtualTerminal(4, 20);
    terminal.feed('abc\x1b[1;1HX\x1b[2CY\x1b[1DZ\x1b[2B\x1b[3GQ\x1b[1AW\x1b7\x1b[4;1H!\x1b8V');
    expect(terminal.screen()).toBe('XbcZ\n   WV\n  Q\n!');
    terminal.feed('\x1b]0;title\x07\x1b[?1049hALT');
    expect(terminal.screen().trim()).toBe('ALT'); // the cursor keeps its position
    terminal.feed('\x1b[?1049l\x1b[2J');
    expect(terminal.screen()).toBe('');
    terminal.feed('\x1b[1;1Hab\x1b[');
    terminal.feed('1Dc');
    expect(terminal.screen()).toBe('ac');
    terminal.feed(
      '\x1b[0K\x1b[1K\x1b(B\tt\bu\x1b[0J\x1b[1J\x1b[3J\x1b[1;2r\x1b[S\x1b[?25l\x1b[31mred\x1b[39m\x1bZ',
    );
    expect(terminal.screen()).toContain('red');
  });

  it('renders buffers too', () => {
    expect(render(Buffer.from('x\r\x1b[2Ky'), 2, 5).screen()).toBe('y');
  });
});

describe('simulated feeds', () => {
  it('scenarios are ordered, seq-increasing and settle once per generation', () => {
    for (const [name, create] of Object.entries(SCENARIOS)) {
      const scenario = create();
      expect(scenario.name).toBe(name);
      const sorted = [...scenario.events].sort((a, b) => a.at - b.at);
      expect(scenario.end).toBeGreaterThanOrEqual(sorted.at(-1)!.at);
    }
    const events = generation({
      generation: 1,
      trigger: 'build',
      phases: [{ phase: 'render', ms: 1_000, total: 10 }],
      status: 'success',
      counts: COLD_COUNTS,
      truncateAfter: 3,
    });
    expect(events).toHaveLength(3);
  });
});

const pty = ptySupport();
/** CI and the modernization runner on POSIX set this, so the PTY checks cannot vanish silently. */
const requirePty = process.env['NGDOC_REQUIRE_PTY'] === '1';

/** Runs one CI-matrix row and checks what a CI log would show. */
async function checkCiRow(child: string, entry: CiCase): Promise<void> {
  const env = cleanEnv({ ...entry.env });
  const result = entry.pty
    ? await runInPty(child, ['cold-build', 'instant'], {
        rows: 30,
        columns: 120,
        env,
        python: pty.python,
      })
    : await runPiped(child, ['cold-build', 'instant'], env);
  expect(result.exit).toBe(0);
  const output = result.output.replace(
    /\(node:\d+\) Warning: The 'NO_COLOR' env is ignored.*\n(\(Use .*\n)?/,
    '',
  );
  const lines = output.split(/\r?\n/).filter(Boolean);
  expect(output).not.toContain('\r\x1b[2K'); // never a redraw
  // eslint-disable-next-line no-control-regex
  const stripped = entry.expected.sections ? output.replace(/\x1b\[0K/g, '') : output;
  expect(withoutColour(stripped)).not.toContain('\x1b');
  // eslint-disable-next-line no-control-regex
  expect(/\x1b\[\d+m/.test(output)).toBe(entry.expected.color);
  if (entry.expected.marker) expect(output).toMatch(entry.expected.marker);
  // eslint-disable-next-line no-control-regex
  expect(lines.filter((line) => /NgDoc: (\x1b\[\d+m)?OK/.test(line))).toHaveLength(1);
  expect(lines.length).toBeLessThanOrEqual(
    entry.expected.ci === 'azure' || entry.expected.ci === 'teamcity' ? 16 : 10,
  );
  if (!entry.pty) expect(result.stdout.trim().split('\n')).toHaveLength(1); // the summary alone on stdout
}

describe('real processes', () => {
  let directory: string;
  let child: string;

  beforeAll(async () => {
    directory = mkdtempSync(path.join(tmpdir(), 'ngdoc-progress-harness-'));
    child = await bundleChild(directory);
  });

  afterAll(() => rmSync(directory, { recursive: true, force: true }));

  // Pipes work everywhere, Windows included.
  it.each(CI_MATRIX.filter((entry) => !entry.pty).map((entry) => [entry.name, entry] as const))(
    'CI matrix, piped: %s',
    async (_name, entry) => checkCiRow(child, entry),
  );

  it.runIf(requirePty)('NGDOC_REQUIRE_PTY=1: the PTY checks can run here', () => {
    expect(pty.reason).toBeUndefined();
  });

  describe.skipIf(!pty.available)(
    `PTY checks${pty.available ? '' : ` (skipped: ${pty.reason}; set NGDOC_REQUIRE_PTY=1 to fail instead)`}`,
    () => {
      it.each(CI_MATRIX.filter((entry) => entry.pty).map((entry) => [entry.name, entry] as const))(
        'CI matrix, PTY: %s',
        async (_name, entry) => checkCiRow(child, entry),
      );

      it('terminal: every edit prints its line; a cold build redraws in place and leaves only the summary', async () => {
        const edits = await runInPty(child, ['watch-edits', 'real', '0.02'], {
          rows: 30,
          columns: 100,
          env: cleanEnv({ TERM: 'xterm-256color' }),
          python: pty.python,
        });
        expect(edits.timeout).toBe(false);
        expect(edits.exit).toBe(0);
        // Real time is scaled, so durations vary; the lines themselves do not.
        expect(
          render(edits.output, 30, 100)
            .transcript()
            .split('\n')
            .map((line) => withoutColour(line).replace(/ in [\d.]+s/, ' in Ns')),
        ).toEqual([
          'NgDoc: updated 1 of 664 pages in Ns (/getting-started/installation)',
          'NgDoc: updated 3 of 664 pages in Ns (/api/core/functions/asArray, +2)',
          'NgDoc: finished in Ns; no changes',
          'NgDoc: updated 1 of 664 pages in Ns (/getting-started/installation)',
        ]);
        const cold = await runInPty(child, ['cold-build', 'real', '0.15'], {
          rows: 30,
          columns: 120,
          env: cleanEnv({ TERM: 'xterm-256color' }),
          python: pty.python,
        });
        expect(cold.exit).toBe(0);
        expect(cold.output).toContain('\r\x1b[2K'); // it did redraw
        const screen = render(cold.output, 30, 120).transcript();
        expect(withoutColour(screen)).toBe(
          'NgDoc: OK generated 664 pages in 20s; 6669 files written; analyze 4.7s, render 5.4s, link 2.8s, write 5.3s',
        );
      });

      it('Nx TUI pane: the PTY reports 160 columns, the pane is 46; lines wrap harmlessly and never accumulate', async () => {
        const result = await runInPty(child, ['cold-build', 'instant'], {
          rows: 40,
          columns: 160,
          env: cleanEnv({
            TERM: 'xterm-256color',
            NX_TASK_TARGET_PROJECT: 'docs',
            NX_STREAM_OUTPUT: 'true',
            FORCE_COLOR: 'true',
          }),
          python: pty.python,
        });
        expect(result.exit).toBe(0);
        expect(result.output).not.toContain('\x1b[2K');
        const pane = render(result.output, 40, 46).transcript().split('\n');
        const logical = render(result.output, 40, 400).transcript().split('\n').filter(Boolean);
        expect(logical.every((line) => withoutColour(line).startsWith('NgDoc: '))).toBe(true);
        // Every wrapped row belongs to exactly one logical line: nothing piled up.
        expect(pane.filter(Boolean).length).toBe(
          logical.reduce((rows, line) => rows + Math.ceil([...withoutColour(line)].length / 46), 0),
        );
      });

      it('Ctrl-C while the live line shows: the line is cleared and the process still ends by SIGINT', async () => {
        const result = await runInPty(child, ['cold-build', 'real', '1'], {
          rows: 30,
          columns: 120,
          env: cleanEnv({ TERM: 'xterm-256color' }),
          python: pty.python,
          ctrlCOn: 'NgDoc',
        });
        expect(result.timeout).toBe(false);
        expect(result.signal).toBe(2);
        expect(result.output).toContain('NgDoc');
        // The terminal echoes `^C` after the live text; clearing the line removes both.
        expect(render(result.output, 30, 120).transcript()).toBe('');
      });

      it.each([
        ['SIGTERM', 'TERM', 15],
        ['SIGHUP', 'HUP', 1],
      ] as const)(
        '%s while the live line shows: the line is cleared and the process ends by it (shell exit 128 + n)',
        async (_name, signal, number) => {
          const result = await runInPty(child, ['cold-build', 'real', '1'], {
            rows: 30,
            columns: 120,
            env: cleanEnv({ TERM: 'xterm-256color' }),
            python: pty.python,
            killOn: { text: 'NgDoc', signal },
          });
          expect(result.timeout).toBe(false);
          expect(result.signal).toBe(number);
          expect(result.output).toContain('NgDoc');
          expect(render(result.output, 30, 120).transcript()).toBe('');
        },
      );

      it('Ctrl-C with a host SIGINT handler: the line is cleared and the host decides', async () => {
        const result = await runInPty(child, ['cold-build', 'real', '1', 'host-sigint'], {
          rows: 30,
          columns: 120,
          env: cleanEnv({ TERM: 'xterm-256color' }),
          python: pty.python,
          ctrlCOn: 'NgDoc',
        });
        expect(result.timeout).toBe(false);
        expect(result.signal).toBeNull();
        expect(result.exit).toBe(7);
        expect(render(result.output, 30, 120).transcript()).toBe('host: stopped');
      });

      it('single Nx task in a terminal: live, short, no bar', async () => {
        const result = await runInPty(child, ['cold-build', 'real', '0.1'], {
          rows: 30,
          columns: 160,
          env: cleanEnv({ TERM: 'xterm-256color', NX_TASK_TARGET_PROJECT: 'docs' }),
          python: pty.python,
        });
        const frames = result.output
          .split('\r\x1b[2K')
          .slice(1)
          .map((frame) => withoutColour(frame.split('\n')[0]))
          .filter((frame) => frame && !frame.startsWith('NgDoc:'));
        expect(frames.length).toBeGreaterThanOrEqual(2);
        expect(frames.every((frame) => [...frame].length <= 55 && !/[━─]/.test(frame))).toBe(true);
      });
    },
  );
});

describe('PTY support probe', () => {
  it('explains why it is unavailable', () => {
    expect(ptySupport('win32')).toEqual({
      available: false,
      reason: 'Windows has no POSIX pseudo-terminal',
    });
    const here = ptySupport();
    expect(here.available ? here.python : here.reason).toBeTruthy();
  });
});
