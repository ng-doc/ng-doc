import type { Plugin } from 'vite';

import type { NgDocVitePluginOptions } from './options';
import { createPlugin } from './plugin';

export type { NgDocVitePluginOptions } from './options';

/** Physical-output Vite integration which owns the supplied complete Analog Angular plugin array. */
export function createNgDocVitePlugin(options: NgDocVitePluginOptions): Plugin[] {
  return createPlugin(options);
}

export type { NgDocViteApplicationOptions, NgDocViteAssetPattern } from './application';
export {
  createNgDocApplicationPlugin,
  NG_DOC_BROWSER_ENTRY,
  NG_DOC_SERVER_ENTRY,
} from './application';
export type {
  NgDocExcludedRoute,
  NgDocPrerenderOptions,
  NgDocPrerenderReport,
  NgDocPrerenderRoute,
} from './prerender';
export { prerenderNgDoc } from './prerender';
export type { NgDocViteBuildOptions, NgDocViteBuildResult } from './production';
export { buildNgDocViteApplication } from './production';
export type { NgDocSsrJsonValue, NgDocSsrRequest, NgDocViteSsrRenderer } from './ssr-renderer';
export { getNgDocViteSsrRenderer } from './ssr-renderer';
