import type { Plugin } from 'vite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ANGULAR_COMPATIBILITY_FORMAT,
  ANGULAR_COMPILER_NAME,
  assertAngularCompatibility,
} from '../angular-compatibility';

const { upstream } = vi.hoisted(() => ({ upstream: vi.fn() }));
vi.mock('@analogjs/vite-plugin-angular', () => ({ default: upstream }));

import { createNgDocAngularPlugins } from '../angular';
import { NG_DOC_TSCONFIG_PATHS_PLUGIN } from '../tsconfig-paths';

beforeEach(() => {
  vi.stubGlobal('__NG_DOC_ANALOG_COMPATIBILITY__', ANGULAR_COMPATIBILITY_FORMAT);
  vi.stubEnv('NODE_ENV', 'development');
  vi.stubEnv('VITEST', '');
  upstream.mockReset();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('verified Angular factory boundary (mocked upstream; native acceptance is separate)', () => {
  it('preserves the complete array, original hooks, other API fields and supported options', () => {
    const hook = vi.fn();
    const compiler: Plugin = { name: ANGULAR_COMPILER_NAME, transform: hook, api: { existing: 7 } };
    const plugins: Plugin[] = [{ name: 'before' }, compiler, { name: 'after' }];
    upstream.mockReturnValue(plugins);
    const result = createNgDocAngularPlugins({ tsconfig: '/app/tsconfig.json' });
    // The upstream array in order, then the resolution of the tsconfig's `paths`.
    expect(result).toHaveLength(4);
    plugins.forEach((plugin, index) => expect(result[index]).toBe(plugin));
    expect(result[3]!.name).toBe(NG_DOC_TSCONFIG_PATHS_PLUGIN);
    expect(result[1]).toBe(compiler);
    expect(compiler.transform).toBe(hook);
    expect(compiler.api.existing).toBe(7);
    expect(compiler.api.ngDocAngularCompatibility.format).toBe(ANGULAR_COMPATIBILITY_FORMAT);
    expect(() => compiler.api.ngDocAngularCompatibility.plugins.splice(0, 1)).toThrow(TypeError);
    expect(() => {
      compiler.api.ngDocAngularCompatibility.format = 'changed';
    }).toThrow(TypeError);
    expect(upstream).toHaveBeenCalledExactlyOnceWith({
      tsconfig: '/app/tsconfig.json',
      liveReload: true,
      jit: false,
      disableTypeChecking: false,
      fastCompile: false,
    });
    expect(() => assertAngularCompatibility(result)).not.toThrow();
    expect(() => assertAngularCompatibility([compiler])).toThrow(
      'NGDOC_VITE_ANGULAR_COMPATIBILITY',
    );
    expect(() => assertAngularCompatibility([...result].reverse())).toThrow(
      'NGDOC_VITE_ANGULAR_COMPATIBILITY',
    );
    expect(() =>
      assertAngularCompatibility([result[0]!, { ...compiler }, result[2]!, result[3]!]),
    ).not.toThrow();
    expect(() =>
      assertAngularCompatibility([{ ...result[0]! }, compiler, result[2]!, result[3]!]),
    ).toThrow('NGDOC_VITE_ANGULAR_COMPATIBILITY');
    // The paths resolution is part of the complete array.
    expect(() => assertAngularCompatibility(result.slice(0, 3))).toThrow(
      'NGDOC_VITE_ANGULAR_COMPATIBILITY',
    );
  });

  it('provides safe defaults and accepts their explicit equivalent', () => {
    upstream.mockImplementation(() => [{ name: ANGULAR_COMPILER_NAME }]);
    const first = createNgDocAngularPlugins();
    const second = createNgDocAngularPlugins({
      liveReload: true,
      jit: false,
      disableTypeChecking: false,
      fastCompile: false,
    });
    expect(second).not.toBe(first);
    expect(second[0]).not.toBe(first[0]);
    expect(upstream.mock.calls[0]).toEqual(upstream.mock.calls[1]);
  });

  it.each([undefined, 'wrong-format'])('refuses an unverified build: %s', (format) => {
    vi.stubGlobal('__NG_DOC_ANALOG_COMPATIBILITY__', format);
    expect(() => createNgDocAngularPlugins()).toThrow('NGDOC_VITE_ANGULAR_BUILD');
    expect(upstream).not.toHaveBeenCalled();
  });

  it.each(['NODE_ENV', 'VITEST'])('refuses the upstream test-mode override: %s', (key) => {
    vi.stubEnv(key, key === 'NODE_ENV' ? 'test' : 'true');
    expect(() => createNgDocAngularPlugins()).toThrow('NGDOC_VITE_ANGULAR_MODE');
    expect(upstream).not.toHaveBeenCalled();
  });

  it.each([
    null,
    [],
    'invalid',
    { liveReload: false },
    { jit: true },
    { disableTypeChecking: true },
    { fastCompile: true },
    { experimental: {} },
  ])('rejects unsupported options %j', (options) => {
    expect(() => createNgDocAngularPlugins(options as never)).toThrow('NGDOC_VITE_ANGULAR_OPTIONS');
    expect(upstream).not.toHaveBeenCalled();
  });

  it.each([0, 2])('rejects an unexpected upstream compiler count %i', (count) => {
    upstream.mockReturnValue(
      Array.from({ length: count }, () => ({ name: ANGULAR_COMPILER_NAME })),
    );
    expect(() => createNgDocAngularPlugins()).toThrow('NGDOC_VITE_ANGULAR_FACTORY');
  });

  it.each([
    undefined,
    {},
    { ngDocAngularCompatibility: 'unknown' },
    { ngDocAngularCompatibility: { format: ANGULAR_COMPATIBILITY_FORMAT } },
  ])('rejects unqualified stock or unknown compilers', (api) => {
    expect(() => assertAngularCompatibility([{ name: ANGULAR_COMPILER_NAME, api }])).toThrow(
      'NGDOC_VITE_ANGULAR_COMPATIBILITY',
    );
  });
  it('rejects missing or duplicate compilers even if a copied marker is present', () => {
    upstream.mockReturnValue([{ name: ANGULAR_COMPILER_NAME }]);
    const plugins = createNgDocAngularPlugins();
    expect(() => assertAngularCompatibility([])).toThrow('NGDOC_VITE_ANGULAR_COMPATIBILITY');
    expect(() => assertAngularCompatibility([...plugins, ...plugins])).toThrow(
      'NGDOC_VITE_ANGULAR_COMPATIBILITY',
    );
  });
});
