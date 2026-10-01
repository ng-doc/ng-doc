import { afterEach, describe, expect, it, vi } from 'vitest';

import { detectCi, detectProgressEnvironment, NX_TASK_COLUMNS } from '../detect';
import {
  activeEngineSwitches,
  isProgressSetting,
  NGDOC_PROGRESS_VALUE,
  parseProgressSetting,
  PROGRESS_SETTINGS,
  resetProgressWarnings,
  resolveProgressSetting,
  sectionsEnabled,
} from '../settings';
import { CI_MATRIX } from './harness/ci-matrix';

afterEach(() => resetProgressWarnings());

describe('settings', () => {
  it('parses the seven values, case- and space-insensitively', () => {
    expect(PROGRESS_SETTINGS).toEqual([
      'auto',
      'live',
      'plain',
      'summary',
      'off',
      'json',
      'verbose',
    ]);
    expect(parseProgressSetting(' Plain ')).toBe('plain');
    expect(parseProgressSetting('lines')).toBeUndefined();
    expect(parseProgressSetting(undefined)).toBeUndefined();
    expect(isProgressSetting('json')).toBe(true);
    expect(isProgressSetting(3)).toBe(false);
  });

  it('precedence: CLI > NGDOC_PROGRESS > option > host quiet > auto', () => {
    const env = { NGDOC_PROGRESS: 'plain' };
    expect(
      resolveProgressSetting({ cli: 'json', env, option: 'off', host: { viteLogLevel: 'silent' } }),
    ).toEqual({ setting: 'json', source: 'cli' });
    expect(
      resolveProgressSetting({ env, option: 'off', host: { viteLogLevel: 'silent' } }),
    ).toEqual({ setting: 'plain', source: 'env' });
    expect(
      resolveProgressSetting({ env: {}, option: 'live', host: { viteLogLevel: 'silent' } }),
    ).toEqual({ setting: 'live', source: 'option' });
    expect(
      resolveProgressSetting({ env: { NGDOC_PROGRESS: ' ' }, host: { viteLogLevel: 'warn' } }),
    ).toEqual({ setting: 'off', source: 'host' });
    expect(resolveProgressSetting({ env: {}, host: { viteLogLevel: 'error' } }).setting).toBe(
      'off',
    );
    expect(
      resolveProgressSetting({ env: {}, host: { viteLogLevel: 'info', angularProgress: false } }),
    ).toEqual({ setting: 'summary', source: 'host' });
    expect(resolveProgressSetting({ env: {}, host: { angularProgress: true } })).toEqual({
      setting: 'auto',
      source: 'default',
    });
    // Options never take `json`, even if a caller passes it untyped.
    expect(resolveProgressSetting({ env: {}, option: 'json' as 'off' })).toEqual({
      setting: 'auto',
      source: 'default',
    });
    expect(resolveProgressSetting({ env: {}, option: 'bogus' as 'off' }).source).toBe('default');
    // An explicit `auto` is "decide for me": host quietness still applies, at every level.
    const warn = { viteLogLevel: 'warn' } as const;
    expect(resolveProgressSetting({ cli: 'auto', env, host: warn })).toEqual({
      setting: 'off',
      source: 'host',
    });
    expect(resolveProgressSetting({ env: { NGDOC_PROGRESS: 'auto' }, host: warn }).setting).toBe(
      'off',
    );
    expect(
      resolveProgressSetting({ env: {}, option: 'auto', host: { angularProgress: false } }),
    ).toEqual({ setting: 'summary', source: 'host' });
    expect(resolveProgressSetting({ env: {}, option: 'auto' })).toEqual({
      setting: 'auto',
      source: 'option',
    });
    expect(resolveProgressSetting({ cli: 'auto', env })).toEqual({
      setting: 'auto',
      source: 'cli',
    });
  });

  it('an unknown NGDOC_PROGRESS warns once per process (NGDOC_PROGRESS_VALUE) and falls back', () => {
    const warn = vi.fn();
    expect(
      resolveProgressSetting({ env: { NGDOC_PROGRESS: 'loud' }, option: 'summary', warn }),
    ).toEqual({ setting: 'summary', source: 'option' });
    expect(resolveProgressSetting({ env: { NGDOC_PROGRESS: 'louder' }, warn }).setting).toBe(
      'auto',
    );
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toMatch(
      /Unrecognised NGDOC_PROGRESS="loud"; use one of auto, live/,
    );
    expect(warn.mock.calls[0][1]).toBe(NGDOC_PROGRESS_VALUE);
  });

  it('warns through process.emitWarning by default, never as an error', () => {
    const emit = vi.spyOn(process, 'emitWarning').mockImplementation(() => {});
    try {
      resolveProgressSetting({ env: { NGDOC_PROGRESS: '??' } });
      expect(emit).toHaveBeenCalledWith(expect.stringContaining('NGDOC_PROGRESS'), {
        code: 'NGDOC_PROGRESS_VALUE',
      });
    } finally {
      emit.mockRestore();
    }
    const previous = process.env['NGDOC_PROGRESS'];
    delete process.env['NGDOC_PROGRESS'];
    try {
      expect(resolveProgressSetting()).toEqual({ setting: 'auto', source: 'default' });
    } finally {
      if (previous !== undefined) process.env['NGDOC_PROGRESS'] = previous;
    }
  });

  it('sections are opt-in', () => {
    expect(sectionsEnabled({})).toBe(false);
    expect(sectionsEnabled({ NGDOC_PROGRESS_SECTIONS: 'Yes' })).toBe(true);
    expect(sectionsEnabled({ NGDOC_PROGRESS_SECTIONS: '0' })).toBe(false);
    expect(typeof sectionsEnabled()).toBe('boolean');
  });

  it('names the engine switches that are set', () => {
    expect(activeEngineSwitches({})).toEqual([]);
    expect(
      activeEngineSwitches({
        NGDOC_TARGETED_REBUILD: 'verify',
        NGDOC_PERSISTENT_WORKER: 'off',
        NGDOC_DELTA_TRANSPORT: '1',
        NGDOC_INCREMENTAL_SKIP: ' 0 ',
      }),
    ).toEqual([
      'NGDOC_PERSISTENT_WORKER=off (a new worker for every generation)',
      'NGDOC_TARGETED_REBUILD=verify (extra verification)',
      'NGDOC_INCREMENTAL_SKIP=0 (TypeScript is analyzed from scratch)',
    ]);
    expect(Array.isArray(activeEngineSwitches())).toBe(true);
  });
});

describe('detection', () => {
  const tty = { isTTY: true, columns: 120, hasColors: () => true };

  it('detects every CI vendor, and CI=false turns detection off', () => {
    expect(detectCi({ CI: 'false', GITHUB_ACTIONS: 'true' })).toBeUndefined();
    expect(detectCi({ TF_BUILD: 'true' })).toBe('azure');
    expect(detectCi({ HUDSON_URL: 'x' })).toBe('jenkins');
    expect(detectCi({ BUILD_ID: '1' })).toBe('generic');
    expect(detectCi({ CODEBUILD_BUILD_ID: '1' })).toBe('generic');
    expect(detectCi({})).toBeUndefined();
    for (const entry of CI_MATRIX) expect(detectCi(entry.env), entry.name).toBe(entry.expected.ci);
  });

  it('matrix: style, colour, unicode, CI assist, sections', () => {
    const table = [
      {
        name: 'terminal',
        env: {},
        stream: tty,
        setting: 'auto',
        style: 'live',
        color: true,
        unicode: true,
      },
      {
        name: 'pipe',
        env: {},
        stream: {},
        setting: 'auto',
        style: 'lines',
        color: false,
        unicode: false,
      },
      {
        name: 'dumb',
        env: { TERM: 'dumb' },
        stream: tty,
        setting: 'auto',
        style: 'lines',
        color: false,
        unicode: false,
      },
      {
        name: 'ci tty',
        env: { CI: '1' },
        stream: tty,
        setting: 'auto',
        style: 'lines',
        color: true,
        unicode: false,
      },
      {
        name: 'nx tui',
        env: { NX_TASK_TARGET_PROJECT: 'docs', NX_STREAM_OUTPUT: 'true' },
        stream: tty,
        setting: 'auto',
        style: 'lines',
        color: true,
        unicode: false,
      },
      {
        name: 'nx single task',
        env: { NX_TASK_TARGET_PROJECT: 'docs', FORCE_COLOR: 'true' },
        stream: tty,
        setting: 'auto',
        style: 'live',
        color: true,
        unicode: true,
      },
      {
        name: 'live forced on pipe',
        env: {},
        stream: {},
        setting: 'live',
        style: 'lines',
        color: false,
        unicode: false,
      },
      {
        name: 'live forced in CI tty',
        env: { CI: '1' },
        stream: tty,
        setting: 'live',
        style: 'live',
        color: true,
        unicode: true,
      },
      {
        name: 'plain',
        env: {},
        stream: tty,
        setting: 'plain',
        style: 'lines',
        color: true,
        unicode: false,
      },
      {
        name: 'verbose',
        env: {},
        stream: tty,
        setting: 'verbose',
        style: 'lines',
        color: true,
        unicode: false,
      },
      {
        name: 'summary',
        env: {},
        stream: tty,
        setting: 'summary',
        style: 'summary',
        color: true,
        unicode: false,
      },
      {
        name: 'json',
        env: {},
        stream: tty,
        setting: 'json',
        style: 'json',
        color: true,
        unicode: false,
      },
      {
        name: 'off',
        env: {},
        stream: tty,
        setting: 'off',
        style: 'off',
        color: true,
        unicode: false,
      },
      {
        name: 'no color wins',
        env: { NO_COLOR: '1', FORCE_COLOR: '1' },
        stream: tty,
        setting: 'auto',
        style: 'live',
        color: false,
        unicode: true,
      },
      {
        name: 'empty NO_COLOR ignored',
        env: { NO_COLOR: '' },
        stream: tty,
        setting: 'auto',
        style: 'live',
        color: true,
        unicode: true,
      },
      {
        name: 'FORCE_COLOR=0',
        env: { FORCE_COLOR: '0' },
        stream: tty,
        setting: 'auto',
        style: 'live',
        color: false,
        unicode: true,
      },
      {
        name: 'FORCE_COLOR=false',
        env: { FORCE_COLOR: 'false' },
        stream: {},
        setting: 'auto',
        style: 'lines',
        color: false,
        unicode: false,
      },
      {
        name: 'no hasColors',
        env: {},
        stream: { isTTY: true },
        setting: 'auto',
        style: 'live',
        color: true,
        unicode: true,
      },
      {
        name: 'hasColors false',
        env: {},
        stream: { isTTY: true, hasColors: () => false },
        setting: 'auto',
        style: 'live',
        color: false,
        unicode: true,
      },
    ] as const;
    for (const row of table) {
      const result = detectProgressEnvironment({
        setting: row.setting,
        env: row.env,
        stream: row.stream,
        platform: 'darwin',
      });
      expect({
        name: row.name,
        style: result.style,
        color: result.color,
        unicode: result.unicode,
      }).toEqual({
        name: row.name,
        style: row.style,
        color: row.color,
        unicode: row.unicode,
      });
    }
  });

  it('a foreign writer forbids redraw, even when forced', () => {
    expect(
      detectProgressEnvironment({ setting: 'auto', env: {}, stream: tty, foreign: true }).style,
    ).toBe('lines');
    expect(
      detectProgressEnvironment({ setting: 'live', env: {}, stream: tty, foreign: true }).style,
    ).toBe('lines');
  });

  it('Windows gets ASCII unless the terminal is known to render Unicode', () => {
    expect(
      detectProgressEnvironment({ setting: 'auto', env: {}, stream: tty, platform: 'win32' })
        .unicode,
    ).toBe(false);
    expect(
      detectProgressEnvironment({
        setting: 'auto',
        env: { WT_SESSION: '1' },
        stream: tty,
        platform: 'win32',
      }).unicode,
    ).toBe(true);
    expect(
      detectProgressEnvironment({
        setting: 'auto',
        env: { TERM_PROGRAM: 'vscode' },
        stream: tty,
        platform: 'win32',
      }).unicode,
    ).toBe(true);
  });

  it('columns: stream width, 80 by default, capped under an Nx task', () => {
    expect(detectProgressEnvironment({ setting: 'auto', env: {}, stream: tty }).columns).toBe(120);
    expect(
      detectProgressEnvironment({ setting: 'auto', env: {}, stream: { isTTY: true, columns: 0 } })
        .columns,
    ).toBe(80);
    expect(
      detectProgressEnvironment({
        setting: 'auto',
        env: { NX_TASK_TARGET_PROJECT: 'p' },
        stream: { isTTY: true, columns: 160 },
      }).columns,
    ).toBe(NX_TASK_COLUMNS);
  });

  it('CI assist and sections follow the vendor, Nx prefixes and the setting', () => {
    const azure = detectProgressEnvironment({ setting: 'auto', env: { TF_BUILD: 'True' } });
    expect([azure.ciAssist, azure.heartbeatMs]).toEqual([true, 15_000]);
    expect(
      detectProgressEnvironment({ setting: 'plain', env: { TF_BUILD: 'True' } }).ciAssist,
    ).toBe(false);
    expect(
      detectProgressEnvironment({
        setting: 'auto',
        env: { TEAMCITY_VERSION: '1', NX_PREFIX_OUTPUT: 'true' },
      }).ciAssist,
    ).toBe(false);
    expect(
      detectProgressEnvironment({ setting: 'summary', env: { TF_BUILD: 'True' } }).ciAssist,
    ).toBe(false);
    expect(
      detectProgressEnvironment({
        setting: 'auto',
        env: { GITHUB_ACTIONS: 'true', NGDOC_PROGRESS_SECTIONS: '1' },
      }).sections,
    ).toBe(true);
    expect(
      detectProgressEnvironment({
        setting: 'json',
        env: { GITHUB_ACTIONS: 'true', NGDOC_PROGRESS_SECTIONS: '1' },
      }).sections,
    ).toBe(false);
    expect(
      detectProgressEnvironment({
        setting: 'auto',
        env: { TF_BUILD: 'True', NGDOC_PROGRESS_SECTIONS: '1' },
      }).sections,
    ).toBe(false);
    expect(
      detectProgressEnvironment({
        setting: 'auto',
        env: { NX_TASK_TARGET_PROJECT: 'p', NX_STREAM_OUTPUT: 'true' },
      }).heartbeatMs,
    ).toBe(5_000);
    expect(detectProgressEnvironment({ setting: 'auto', env: {} }).heartbeatMs).toBe(10_000);
    expect(detectProgressEnvironment({ setting: 'verbose', env: {} }).verbose).toBe(true);
  });

  it('defaults to the process environment and stream-less detection', () => {
    expect(['live', 'lines']).toContain(detectProgressEnvironment({ setting: 'auto' }).style);
  });
});
