import { readFileSync } from 'node:fs';
import path from 'node:path';

/** One Vite alias: a module specifier pattern and its replacement. */
export interface WorkspaceAlias {
  find: RegExp;
  replacement: string;
}

const escape = (value: string): string => value.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');

/**
 * The `@ng-doc/*` path mappings of `tsconfig.base.json` as Vite aliases, so the Node suites load
 * the library sources the way TypeScript resolves them, not the built packages that
 * `node_modules/@ng-doc` links to.
 * @param workspace - The workspace root.
 * @returns One alias per mapping; `*` mappings keep the subpath.
 */
export function workspaceAliases(workspace: string): WorkspaceAlias[] {
  const config = JSON.parse(readFileSync(path.join(workspace, 'tsconfig.base.json'), 'utf8')) as {
    compilerOptions: { paths: Record<string, string[]> };
  };

  return Object.entries(config.compilerOptions.paths).map(([specifier, [target]]) =>
    specifier.endsWith('/*')
      ? {
          find: new RegExp(`^${escape(specifier.slice(0, -2))}/(.+)$`),
          replacement: `${path.join(workspace, target.slice(0, -2))}/$1`,
        }
      : { find: new RegExp(`^${escape(specifier)}$`), replacement: path.join(workspace, target) },
  );
}
