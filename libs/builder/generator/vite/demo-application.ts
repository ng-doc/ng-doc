import { readFile } from 'node:fs/promises';
import path from 'node:path';

/** The generated module of the demo application, in the output root (`demo-app.ts.nunj`). */
export const DEMO_APPLICATION_MODULE = 'demo-app.ts';

/**
 * The demo application of a generation: its generated module and the URL path of its pages.
 * The NgDoc plugin publishes it to the application plugin (`NgDocDemoApplicationApi`).
 */
export interface NgDocDemoApplication {
  /** The generated module (absolute), which exports the routes and the providers import. */
  readonly module: string;
  /** The URL path of the demo pages, relative to the base href, without slashes around it. */
  readonly path: string;
  /** Every demo page, relative to the base href (`<path>/<page route>/<demo name>`). */
  readonly pages: readonly string[];
}

/**
 * What the NgDoc plugin offers the application plugin through `api.ngDocDemoApplication`.
 * @internal
 */
export interface NgDocDemoApplicationApi {
  readonly schemaVersion: 1;
  /**
   * The demo application of the build's generation, generating first if the build has not yet: a
   * build adds the demo page's input before it starts, when there is one.
   */
  resolve(): Promise<NgDocDemoApplication | undefined>;
  /** The demo application of the current generation of the development server, if any. */
  current(): Promise<NgDocDemoApplication | undefined>;
}

const DEMO_PATH = /^export const NG_DOC_DEMO_PATH = '([^'\\\n]*)';$/m;
const DEMO_PAGES = /^export const NG_DOC_DEMO_PAGES: string\[\] = (.*);$/m;

/**
 * Reads the demo application from a committed output root: a generation writes `demo-app.ts`
 * only when a guide has demo pages, and that module names the URL path of the pages.
 * @param outputRoot - The output root of the published generation.
 */
export async function readDemoApplication(
  outputRoot: string,
): Promise<NgDocDemoApplication | undefined> {
  const module = path.join(outputRoot, DEMO_APPLICATION_MODULE);
  const source = await readFile(module, 'utf8').catch(() => undefined);
  const demoPath = source === undefined ? undefined : DEMO_PATH.exec(source)?.[1];
  const pages = source === undefined ? undefined : demoPages(DEMO_PAGES.exec(source)?.[1]);
  return demoPath && pages ? { module, path: demoPath, pages } : undefined;
}

function demoPages(json: string | undefined): string[] | undefined {
  try {
    const value: unknown = json === undefined ? undefined : JSON.parse(json);
    return Array.isArray(value) && value.every((item) => typeof item === 'string')
      ? value
      : undefined;
  } catch {
    return undefined;
  }
}
