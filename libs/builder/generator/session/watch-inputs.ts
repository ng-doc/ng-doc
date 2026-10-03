import { compareText } from '../../helpers/text-order';
import type { WatchInputs } from '../contracts';

/** Avoid accepting an unbounded host-facing DTO from an injected compiler port. */
const MAX_ARRAY_ITEMS = 100_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  return actual.length === keys.length && actual.every((key, index) => key === keys[index]);
}

function string(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.includes('\0')) throw new Error(`Invalid ${name}`);
  return value;
}

/** DTO paths are absolute normalized host paths using forward slashes. This does not touch disk. */
function path(value: unknown, name: string): string {
  const result = string(value, name);
  const isPosix = result.startsWith('/') && !result.startsWith('//');
  const isDrive = /^[A-Za-z]:\//.test(result);
  const unc = result.match(/^\/\/([^/]+)\/([^/]+)(?:\/|$)/);
  const isUnc = unc !== null;
  const invalidUncRoot =
    isUnc && (unc![1] === '.' || unc![1] === '..' || unc![2] === '.' || unc![2] === '..');
  const pathAfterRoot = isUnc ? result.slice(`//${unc![1]}/${unc![2]}`.length) : result;
  const root =
    result === '/' || /^[A-Za-z]:\/$/.test(result) || /^\/\/[^/]+\/[^/]+\/$/.test(result);
  if (
    (!isPosix && !isDrive && !isUnc) ||
    invalidUncRoot ||
    result.includes('\\') ||
    pathAfterRoot.includes('//') ||
    (!root && result.endsWith('/')) ||
    pathAfterRoot.split('/').some((segment) => segment === '.' || segment === '..')
  ) {
    // The value is named so that a report from another OS shows which spelling was refused.
    throw new Error(`Invalid normalized absolute ${name}: ${JSON.stringify(result)}`);
  }
  return result;
}

function strings(value: unknown, name: string): string[] {
  if (!Array.isArray(value) || value.length > MAX_ARRAY_ITEMS) throw new Error(`Invalid ${name}`);
  return Array.from(value, (item, index) => string(item, `${name}[${index}]`));
}

function paths(value: unknown, name: string): string[] {
  if (!Array.isArray(value) || value.length > MAX_ARRAY_ITEMS) throw new Error(`Invalid ${name}`);
  return Array.from(value, (item, index) => path(item, `${name}[${index}]`));
}

interface SemanticScope {
  digest: string;
}

/**
 * Projects a complete compiler dependency DTO into host-facing filesystem inputs.
 * It is intentionally pure: session ownership ends at observation, not watching.
 */
export function projectWatchInputs(dependencies: unknown): WatchInputs {
  if (!Array.isArray(dependencies) || dependencies.length > MAX_ARRAY_ITEMS)
    throw new Error('Invalid compilation dependencies');

  const files = new Set<string>();
  const globs = new Map<string, WatchInputs['globs'][number]>();
  const scopes = new Map<string, SemanticScope[]>();
  const references: Array<{ scopeId: string; digest: string }> = [];

  for (const dependency of dependencies) {
    if (!isRecord(dependency) || typeof dependency.kind !== 'string')
      throw new Error('Invalid dependency');
    switch (dependency.kind) {
      case 'content': {
        if (!hasExactKeys(dependency, ['digest', 'kind', 'path']))
          throw new Error('Invalid content dependency');
        files.add(path(dependency.path, 'content path'));
        string(dependency.digest, 'content digest');
        break;
      }
      case 'existence': {
        if (
          !hasExactKeys(dependency, ['exists', 'kind', 'path']) ||
          typeof dependency.exists !== 'boolean'
        )
          throw new Error('Invalid existence dependency');
        files.add(path(dependency.path, 'existence path'));
        break;
      }
      case 'glob': {
        if (!hasExactKeys(dependency, ['exclude', 'include', 'kind', 'members', 'root']))
          throw new Error('Invalid glob dependency');
        const root = path(dependency.root, 'glob root');
        const include = strings(dependency.include, 'glob include');
        const exclude = strings(dependency.exclude, 'glob exclude');
        paths(dependency.members, 'glob members').forEach((member) => files.add(member));
        const glob = { root, include, exclude };
        globs.set(JSON.stringify(glob), glob);
        break;
      }
      case 'semantic': {
        if (!hasExactKeys(dependency, ['digest', 'files', 'kind', 'reason', 'scopeId']))
          throw new Error('Invalid semantic dependency');
        const scopeId = string(dependency.scopeId, 'semantic scope ID');
        const digest = string(dependency.digest, 'semantic digest');
        string(dependency.reason, 'semantic reason');
        const scopeFiles = paths(dependency.files, 'semantic files');
        scopeFiles.forEach((file) => files.add(file));
        const registered = scopes.get(scopeId) ?? [];
        registered.push({ digest });
        scopes.set(scopeId, registered);
        break;
      }
      case 'semantic-reference': {
        if (!hasExactKeys(dependency, ['digest', 'kind', 'reason', 'scopeId']))
          throw new Error('Invalid semantic-reference dependency');
        references.push({
          scopeId: string(dependency.scopeId, 'semantic-reference scope ID'),
          digest: string(dependency.digest, 'semantic-reference digest'),
        });
        string(dependency.reason, 'semantic-reference reason');
        break;
      }
      case 'keyword': {
        if (!hasExactKeys(dependency, ['digest', 'key', 'kind']))
          throw new Error('Invalid keyword dependency');
        string(dependency.key, 'keyword key');
        string(dependency.digest, 'keyword digest');
        break;
      }
      // The non-physical kinds are validated but are never watch inputs: they name no path, and
      // the files a semantic closure covers are recorded beside it as `content` dependencies.
      case 'semantic-closure': {
        if (!hasExactKeys(dependency, ['digest', 'key', 'kind', 'scopeId']))
          throw new Error('Invalid semantic-closure dependency');
        string(dependency.scopeId, 'semantic-closure scope ID');
        string(dependency.key, 'semantic-closure key');
        string(dependency.digest, 'semantic-closure digest');
        break;
      }
      case 'evaluated': {
        if (!hasExactKeys(dependency, ['digest', 'entryId', 'kind']))
          throw new Error('Invalid evaluated dependency');
        string(dependency.entryId, 'evaluated entry ID');
        string(dependency.digest, 'evaluated digest');
        break;
      }
      default:
        throw new Error('Unknown dependency kind');
    }
  }

  for (const reference of references) {
    if (!scopes.get(reference.scopeId)?.some((scope) => scope.digest === reference.digest))
      throw new Error(`Incomplete semantic scope ${reference.scopeId}`);
  }
  return {
    files: [...files].sort(),
    globs: [...globs.values()].sort((left, right) =>
      compareText(JSON.stringify(left), JSON.stringify(right)),
    ),
  };
}
