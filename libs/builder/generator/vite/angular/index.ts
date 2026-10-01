import angular, { type PluginOptions } from '@analogjs/vite-plugin-angular';
import type { Plugin } from 'vite';

import { ANGULAR_COMPATIBILITY_FORMAT, qualifyAngularPlugins } from '../angular-compatibility';

// Only the verified package build defines this constant while bundling patched upstream sources.
// Running this source file directly must never label an unpatched upstream factory as compatible.
declare const __NG_DOC_ANALOG_COMPATIBILITY__: string;

export type NgDocAngularPluginOptions = Omit<
  PluginOptions,
  'liveReload' | 'jit' | 'disableTypeChecking' | 'fastCompile' | 'experimental'
> & {
  liveReload?: true;
  jit?: false;
  disableTypeChecking?: false;
  fastCompile?: false;
  experimental?: never;
};

/** Complete pinned Analog plugin array, with the resource corrections required by NgDoc. */
export function createNgDocAngularPlugins(options: NgDocAngularPluginOptions = {}): Plugin[] {
  if (
    typeof __NG_DOC_ANALOG_COMPATIBILITY__ === 'undefined' ||
    __NG_DOC_ANALOG_COMPATIBILITY__ !== ANGULAR_COMPATIBILITY_FORMAT
  ) {
    throw new Error('[NGDOC_VITE_ANGULAR_BUILD] Use the verified built NgDoc Angular entry.');
  }
  if (process.env['NODE_ENV'] === 'test' || process.env['VITEST']) {
    throw new Error(
      '[NGDOC_VITE_ANGULAR_MODE] The NgDoc documentation host requires non-test AOT mode.',
    );
  }
  if (
    !options ||
    typeof options !== 'object' ||
    Array.isArray(options) ||
    (options.liveReload !== undefined && options.liveReload !== true) ||
    (options.jit !== undefined && options.jit !== false) ||
    (options.disableTypeChecking !== undefined && options.disableTypeChecking !== false) ||
    (options.fastCompile !== undefined && options.fastCompile !== false) ||
    options.experimental !== undefined
  ) {
    throw new Error(
      '[NGDOC_VITE_ANGULAR_OPTIONS] NgDoc requires liveReload:true, jit:false, ' +
        'disableTypeChecking:false, fastCompile:false and the default Angular compilation path.',
    );
  }
  const plugins = angular({
    ...options,
    liveReload: true,
    jit: false,
    disableTypeChecking: false,
    fastCompile: false,
  });
  return qualifyAngularPlugins(plugins);
}
