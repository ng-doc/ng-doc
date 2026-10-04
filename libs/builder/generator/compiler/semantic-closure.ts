import type {
  CompilationRequest,
  ContentDescriptor,
  ContentIR,
  Dependency,
  PageArtifact,
  RebuildReason,
  ServiceResult,
} from '../contracts';
import { readFlag, SCOPED_SEMANTIC_FLAG } from '../kernel/flags';
import { type Unit, diagnostic, sameValue } from './common';
import { firstDifference } from './dry-run';
import type { CompilationOptions } from './index';
import type { GenerationPlan } from './plan';

/**
 * Scoped semantic invalidation (`NGDOC_SCOPED_SEMANTIC`): in a development generation, units and
 * IRs record a `semantic-closure` per semantic query instead of the whole program's
 * `semantic-reference`, and keep the program files they read as ordinary dependencies. An API edit
 * then re-renders only the IRs whose recorded closure changed, on a FULL-synchronized program as
 * well. Production generations keep the global reference, so their artifacts are unchanged.
 *
 * `verify` also renders every IR that its closure let the generation reuse, publishes the fresh IR
 * and reports `COMPILATION_SCOPED_SEMANTIC_MISMATCH` when the two differ, and runs the recorder in
 * `verify` mode (a node read outside the footprint fails the generation).
 */
export type ScopedSemanticMode = 'off' | 'on' | 'verify';

export const SCOPED_SEMANTIC_ENV = SCOPED_SEMANTIC_FLAG;
export const SCOPED_SEMANTIC_MISMATCH = 'COMPILATION_SCOPED_SEMANTIC_MISMATCH';
/**
 * `NGDOC_SHAPE_CLOSURE=verify`: content reused on a closure that held only by its declaration
 * shapes differs from a fresh render.
 */
export const SHAPE_CLOSURE_MISMATCH = 'COMPILATION_SHAPE_CLOSURE_MISMATCH';

/** The switch as the process sets it: the option first, then `NGDOC_SCOPED_SEMANTIC`. */
export function scopedSemanticSwitch(options: CompilationOptions): ScopedSemanticMode {
  if (options.scopedSemantic === false) return 'off';
  const value = readFlag(SCOPED_SEMANTIC_ENV).value;
  return value === 'off' ? 'off' : options.scopedSemantic === 'verify' ? 'verify' : value;
}

/**
 * The mode of one generation: the switch, for development generations. A one-shot development
 * generation records closures too, so its artifacts equal a long-lived runtime's; with no records
 * to refresh from, it reuses a closure only while the program equals the previous candidate's.
 */
export function scopedSemanticMode(
  options: CompilationOptions,
  request: CompilationRequest,
): ScopedSemanticMode {
  return request.mode === 'development' ? scopedSemanticSwitch(options) : 'off';
}

/**
 * The `whyRebuilt` fallback of a rebuilt owner the dependency index cannot explain: the first
 * recorded closure (by key) whose digest changed, appeared or disappeared. It is derived from the
 * two artifacts alone, so every path that rebuilds the owner reports the same reason.
 */
export function closureRebuildReason(
  previous: PageArtifact,
  current: Pick<PageArtifact, 'id' | 'dependencies' | 'content'>,
): RebuildReason | undefined {
  const closures = (artifact: Pick<PageArtifact, 'dependencies' | 'content'>) => {
    const values = new Map<string, string>();
    for (const dependency of [
      ...artifact.dependencies,
      ...artifact.content.flatMap((content) => content.ir.dependencies),
    ])
      if (dependency.kind === 'semantic-closure') values.set(dependency.key, dependency.digest);
    return values;
  };
  const before = closures(previous);
  const after = closures(current);
  const key = [...new Set([...before.keys(), ...after.keys()])]
    .sort()
    .find((item) => before.get(item) !== after.get(item));
  return key === undefined
    ? undefined
    : { ownerId: current.id, reason: 'semantic', detail: `semantic closure changed: ${key}` };
}

/**
 * `verify`: renders an IR that the generation reuses on the strength of a recorded closure, and
 * compares it with the reused one. Returns the fresh result, with a mismatch warning, when they
 * differ (the caller publishes it); undefined when they are equal or there is nothing to check.
 * `NGDOC_SCOPED_SEMANTIC=verify` checks every such IR; `NGDOC_SHAPE_CLOSURE=verify` the IRs one of
 * whose closures held only by its declaration shapes, and reports them as
 * {@link SHAPE_CLOSURE_MISMATCH}.
 */
export async function verifyClosureReuse(
  plan: GenerationPlan,
  unit: Unit,
  descriptor: ContentDescriptor,
  reused: ContentIR,
): Promise<ServiceResult<ContentIR> | undefined> {
  if (plan.scopedSemantic === 'off') return undefined;
  const closures = reused.dependencies.filter(
    (dependency) => dependency.kind === 'semantic-closure',
  );
  const narrowed = closures.some((dependency) => plan.semantic.closureNarrowed(dependency));
  if (!closures.length || (plan.scopedSemantic !== 'verify' && !narrowed)) return undefined;
  const code = narrowed ? SHAPE_CLOSURE_MISMATCH : SCOPED_SEMANTIC_MISMATCH;
  const request = unit.requests[descriptor.ordinal];
  if (!request || request.id !== descriptor.id) return undefined;
  const fresh = await plan.compiler.compile(request, plan.signal, descriptor);
  const value = fresh.value && {
    ...fresh.value,
    dependencies: plan.compact(fresh.value.dependencies),
  };
  if (value && sameValue(value, reused)) return undefined;
  const at = value
    ? firstDifference(JSON.parse(JSON.stringify(reused)), value) ?? '$'
    : 'no fresh IR';
  const shown = (ir: ContentIR | undefined) =>
    JSON.stringify(
      valueAt(ir, at.replace(/ \(keys\)$/, ''))
        ?.toString()
        .slice(0, 160) ?? null,
    );
  const message = `Content ${descriptor.id} (${reused.title}) reused on its recorded semantic closure${narrowed ? ' (held by its declaration shapes only)' : ''} differs from a fresh render at ${at} (reused ${shown(reused)}, fresh ${shown(value)}); the fresh render is published.`;
  console.error(`[ng-doc] ${code}: ${message}`);
  return {
    ...fresh,
    diagnostics: [...fresh.diagnostics, diagnostic(code, message, 'warning')],
  };
}

/** The value at a `firstDifference` path (`$.a[0].b`) of a JSON value, stringified when an object. */
function valueAt(value: unknown, at: string): unknown {
  let current: unknown = value;
  for (const [, key, index] of at.matchAll(/\.([^.[]+)|\[(\d+)\]/g)) {
    if (current === null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[key ?? Number(index)];
  }
  return current !== null && typeof current === 'object' ? JSON.stringify(current) : current;
}
