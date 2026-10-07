import { describe, expect, it } from 'vitest';

import {
  DELTA_TRANSPORT_FLAG,
  flagOff,
  FLAGS,
  FORMAT_CACHE_FLAG,
  HIGHLIGHT_CACHE_FLAG,
  INCREMENTAL_PROGRAM_FLAG,
  INCREMENTAL_SKIP_FLAG,
  PARALLEL_RENDER_FLAG,
  PERSISTENT_WORKER_FLAG,
  readFlag,
  SCOPED_SEMANTIC_FLAG,
  SEMANTIC_RECORDER_FLAG,
  SHAPE_CLOSURE_FLAG,
} from '../../kernel/flags';
import { recorderMode, SEMANTIC_RECORDER_ENV } from '../../kernel/footprint';
import { ENGINE_SWITCHES } from '../../progress/settings';

describe('the engine switch registry', () => {
  it('registers every switch once, on by default', () => {
    const names = FLAGS.map((flag) => flag.name);
    expect(new Set(names).size).toBe(names.length);
    for (const flag of FLAGS) {
      expect(flag.default).toBe('on');
      expect(flag.description).not.toBe('');
      expect(Object.isFrozen(flag)).toBe(true);
    }
    expect(Object.isFrozen(FLAGS)).toBe(true);
  });

  it('agrees with the switches the progress notice reports, value for value', () => {
    for (const engine of ENGINE_SWITCHES) {
      const flag = FLAGS.find((item) => item.name === engine.name);
      expect(flag, engine.name).toBeDefined();
      expect(engine.values.test('verify'), engine.name).toBe(flag!.verify);
      for (const value of ['0', 'false', 'OFF', 'no']) {
        expect(engine.values.test(value)).toBe(
          readFlag(engine.name, { [engine.name]: value }).value === 'off',
        );
      }
    }
  });

  it('registers the scoped semantic, incremental program, shape closure, highlight cache, format cache and parallel render switches with their effects', () => {
    for (const name of [
      SCOPED_SEMANTIC_FLAG,
      INCREMENTAL_PROGRAM_FLAG,
      SHAPE_CLOSURE_FLAG,
      HIGHLIGHT_CACHE_FLAG,
      FORMAT_CACHE_FLAG,
      PARALLEL_RENDER_FLAG,
    ]) {
      const flag = FLAGS.find((item) => item.name === name)!;
      expect(flag.verify).toBe(true);
      expect(readFlag(name, {})).toEqual({ value: 'on' });
      expect(readFlag(name, { [name]: 'verify' })).toEqual({ value: 'verify' });
      expect(readFlag(name, { [name]: '0' })).toEqual({ value: 'off' });
    }
    // Only a switch that does something is reported.
    expect(ENGINE_SWITCHES.some((engine) => engine.name === SCOPED_SEMANTIC_FLAG)).toBe(true);
    expect(ENGINE_SWITCHES.some((engine) => engine.name === INCREMENTAL_PROGRAM_FLAG)).toBe(true);
    expect(ENGINE_SWITCHES.some((engine) => engine.name === SHAPE_CLOSURE_FLAG)).toBe(true);
    expect(ENGINE_SWITCHES.some((engine) => engine.name === HIGHLIGHT_CACHE_FLAG)).toBe(true);
    expect(ENGINE_SWITCHES.some((engine) => engine.name === FORMAT_CACHE_FLAG)).toBe(true);
    expect(ENGINE_SWITCHES.some((engine) => engine.name === PARALLEL_RENDER_FLAG)).toBe(true);
  });

  it.each([
    [undefined, { value: 'on' }],
    ['', { value: 'on' }],
    ['   ', { value: 'on' }],
    ['1', { value: 'on' }],
    [' TRUE ', { value: 'on' }],
    ['yes', { value: 'on' }],
    ['On', { value: 'on' }],
    ['0', { value: 'off' }],
    [' false', { value: 'off' }],
    ['OFF', { value: 'off' }],
    ['no', { value: 'off' }],
    ['Verify', { value: 'verify' }],
    ['disable', { value: 'on', unrecognised: 'disable' }],
  ] as const)('reads %j for a switch that accepts verify', (raw, expected) => {
    expect(readFlag(DELTA_TRANSPORT_FLAG, { [DELTA_TRANSPORT_FLAG]: raw })).toEqual(expected);
  });

  it('treats verify as unrecognised where a switch does not accept it', () => {
    expect(readFlag(PERSISTENT_WORKER_FLAG, { [PERSISTENT_WORKER_FLAG]: ' verify ' })).toEqual({
      value: 'on',
      unrecognised: 'verify',
    });
  });

  it('reads the process environment by default and tells whether a switch is off', () => {
    const saved = process.env[INCREMENTAL_SKIP_FLAG];
    try {
      process.env[INCREMENTAL_SKIP_FLAG] = 'off';
      expect(flagOff(INCREMENTAL_SKIP_FLAG)).toBe(true);
      process.env[INCREMENTAL_SKIP_FLAG] = 'disable';
      expect(flagOff(INCREMENTAL_SKIP_FLAG)).toBe(false);
      expect(readFlag(INCREMENTAL_SKIP_FLAG).unrecognised).toBe('disable');
    } finally {
      if (saved === undefined) delete process.env[INCREMENTAL_SKIP_FLAG];
      else process.env[INCREMENTAL_SKIP_FLAG] = saved;
    }
    expect(flagOff(INCREMENTAL_SKIP_FLAG, { [INCREMENTAL_SKIP_FLAG]: 'no' })).toBe(true);
  });

  it('rejects a switch that is not registered', () => {
    expect(() => readFlag('NGDOC_NOT_A_SWITCH', {})).toThrow('Unregistered engine switch');
  });

  it('keeps the recorder mode mapping of its switch', () => {
    expect(SEMANTIC_RECORDER_ENV).toBe(SEMANTIC_RECORDER_FLAG);
    expect(
      [undefined, '', 'on', '1', 'verify', ' VERIFY ', '0', 'off', 'False', 'no', 'other'].map(
        (value) => recorderMode(value),
      ),
    ).toEqual(['on', 'on', 'on', 'on', 'verify', 'verify', 'off', 'off', 'off', 'off', 'on']);
  });
});
