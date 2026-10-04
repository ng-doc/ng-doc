import { ts } from 'ts-morph';

/**
 * TypeScript caches the documentation of a symbol on the symbol object (`documentationComment`,
 * `tags` and the contextual accessor variants), including documentation it inherited from base
 * types in other files. A patched program reuses the unchanged files' source files, and with them
 * the symbols their binder created, so after a base file is patched a reused symbol would keep
 * answering with the documentation of the old base, where a cold program computes the new one.
 *
 * The readers below remember, per symbol, the checker its cached answers were computed with, and
 * drop the cache when another checker asks (a patched program's, or the language service's, which
 * sees the same files and computes the same answer). A cache found without a remembered checker
 * (computed before these readers were installed) is dropped once as well. Signatures are created by
 * the checker, so each program has its own.
 */

/** The symbol methods that cache documentation, with the position of their checker argument. */
export const CACHED_DOCUMENTATION_METHODS: ReadonlyArray<readonly [string, number]> = [
  ['getDocumentationComment', 0],
  ['getContextualDocumentationComment', 1],
  ['getJsDocTags', 0],
  ['getContextualJsDocTags', 1],
];

/** The fields TypeScript caches those answers in. */
export const CACHED_DOCUMENTATION_FIELDS: readonly string[] = [
  'documentationComment',
  'contextualGetAccessorDocumentationComment',
  'contextualSetAccessorDocumentationComment',
  'tags',
  'contextualGetAccessorTags',
  'contextualSetAccessorTags',
];

const computedWith = new WeakMap<object, unknown>();
let installed = false;

/**
 * Installs the checker-aware documentation readers on TypeScript's symbol prototype, once per
 * process. Throws when a pinned-version assumption does not hold (a method is missing), which the
 * caller treats as a patch it cannot make.
 */
export function installDocumentationFreshness(): void {
  if (installed) return;
  const prototype = (
    ts as unknown as {
      objectAllocator: { getSymbolConstructor(): { prototype: Record<string, unknown> } };
    }
  ).objectAllocator.getSymbolConstructor().prototype;
  for (const [name] of CACHED_DOCUMENTATION_METHODS)
    if (typeof prototype[name] !== 'function')
      throw new Error(`TypeScript SymbolObject.${name} is missing`);
  installed = true;
  for (const [name, position] of CACHED_DOCUMENTATION_METHODS) {
    const descriptor = Object.getOwnPropertyDescriptor(prototype, name)!;
    const original = descriptor.value as (...values: unknown[]) => unknown;
    Object.defineProperty(prototype, name, {
      ...descriptor,
      value: function freshDocumentation(this: Record<string, unknown>) {
        // eslint-disable-next-line prefer-rest-params
        const checker = arguments[position];
        if (checker !== undefined && computedWith.get(this) !== checker) {
          for (const field of CACHED_DOCUMENTATION_FIELDS) delete this[field];
          computedWith.set(this, checker);
        }
        // eslint-disable-next-line prefer-rest-params
        return original.apply(this, arguments as never);
      },
    });
  }
}
