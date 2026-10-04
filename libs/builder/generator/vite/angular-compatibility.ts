import type { Plugin } from 'vite';

export const ANGULAR_COMPATIBILITY_FORMAT = 'ng-doc-analog-2.8.0-resources-v1';
export const ANGULAR_COMPILER_NAME = '@analogjs/vite-plugin-angular';

/** Compatibility assertion for the tested compiler implementation; not an authenticity signature. */
export function qualifyAngularPlugins(plugins: Plugin[]): Plugin[] {
  const compilers = plugins.filter((plugin) => plugin.name === ANGULAR_COMPILER_NAME);
  if (compilers.length !== 1) {
    throw new Error('[NGDOC_VITE_ANGULAR_FACTORY] Expected exactly one pinned Angular compiler.');
  }
  const compiler = compilers[0]!;
  compiler.api = {
    ...compiler.api,
    ngDocAngularCompatibility: Object.freeze({
      format: ANGULAR_COMPATIBILITY_FORMAT,
      plugins: Object.freeze([...plugins]),
    }),
  };
  return plugins;
}

export function assertAngularCompatibility(plugins: readonly Plugin[]): void {
  const compilers = plugins.filter((plugin) => plugin.name === ANGULAR_COMPILER_NAME);
  const descriptor = compilers[0]?.api?.ngDocAngularCompatibility;
  if (
    compilers.length !== 1 ||
    descriptor?.format !== ANGULAR_COMPATIBILITY_FORMAT ||
    !Array.isArray(descriptor.plugins) ||
    descriptor.plugins.length !== plugins.length ||
    !descriptor.plugins.every((original: Plugin, index: number) =>
      original.name === ANGULAR_COMPILER_NAME
        ? plugins[index] === compilers[0]
        : plugins[index] === original,
    )
  ) {
    throw new Error(
      '[NGDOC_VITE_ANGULAR_COMPATIBILITY] Use createNgDocAngularPlugins from ' +
        '@ng-doc/builder/generator/vite/angular/index.js. The stock Analog 2.8.0 factory ' +
        'does not preserve documentation resource invalidation and stylesheet ownership.',
    );
  }
}
