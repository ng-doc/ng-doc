import type {
  ContentDescriptor,
  ContentIR,
  ContentRequest,
  Dependency,
  PageArtifact,
  ServiceResult,
} from '../contracts';
import { GENERATOR_SCHEMA_VERSION } from '../contracts';
import { type Unit, diagnostic, inputDigest, sameValue, uniqueDependencies } from './common';
import type { RenderStep } from './fold';
import type { GenerationPlan } from './plan';
import { verifyClosureReuse } from './semantic-closure';
import type { ReplayScope } from './targeted';

/**
 * Render phase: per unit, each descriptor reuses the previous IR when the full path's predicate
 * holds (equal descriptor, matching IR, refreshed dependencies unchanged) and is rendered
 * otherwise; a guide with demos then reuses or compiles its demo-assets IR (reused
 * only for an unchanged descriptor plan). Each step records its projection on the unit's record.
 *
 * On the targeted path (`scope`), a unit it replays keeps its retained render record when that
 * record already holds the reuse projection, and otherwise runs the same predicate without
 * refreshing its dependencies: the classifier and the sweep established that none of its paths
 * changed, and the admission that none of its non-physical dependencies did, which is what the
 * refresh would find.
 *
 * Each unit has a front (`renderFront`: the reuse predicates and the fronts of its compiles, which
 * read files, evaluate templates and query the program) and a settle (its records, IRs,
 * dependencies, input digest and progress). Fronts run strictly one after the other in plan order,
 * so the semantic queries and their order are those of a sequential render. Settles run in plan
 * order too, each once its unit's back halves are done. With render threads
 * (`content/html-pool`), up to `window()` units may wait for their back halves while the next
 * fronts run; without them, each unit settles before the next front starts, as it always did.
 *
 * `rendered`, when progress is reported, hears of each unit as it finishes, and whether all of its
 * content was reused.
 */
export async function renderUnits(
  plan: GenerationPlan,
  units: Unit[],
  scope?: ReplayScope,
  rendered?: (reused: boolean) => void,
): Promise<void> {
  /** Settles of the units whose fronts are done, chained in plan order. */
  const settling: Array<Promise<void>> = [];
  try {
    for (const unit of units) {
      const settle = await renderFront(plan, unit, scope, rendered);
      const previous = settling[settling.length - 1];
      settling.push(previous ? previous.then(settle) : settle());
      while (settling.length > (plan.back?.window() ?? 0)) await settling.shift();
    }
    while (settling.length) await settling.shift();
  } finally {
    // After a failure, no settle is left running or rejecting unobserved.
    await Promise.allSettled(settling);
  }
}

/** A unit's front; resolves with its settle. */
async function renderFront(
  plan: GenerationPlan,
  unit: Unit,
  scope: ReplayScope | undefined,
  rendered: ((reused: boolean) => void) | undefined,
): Promise<() => Promise<void>> {
  const { records, refresher, compiler, compact, signal } = plan;
  const none = { diagnostics: [], dependencies: [] };
  const replayed = scope?.retained(unit) !== undefined;
  if (replayed && unit.record.rendered) return async () => rendered?.(true);
  /** The full path's refresh check; a replayed unit's dependencies are known unchanged. */
  const unchanged = async (dependencies: Dependency[]) => {
    if (replayed) return { held: true };
    const refreshed = await refresher.refresh(dependencies, []);
    return {
      held:
        !refreshed.diagnostics.some((item) => item.severity === 'error') &&
        sameValue(uniqueDependencies(refreshed.dependencies), uniqueDependencies(dependencies)),
    };
  };
  /** A compile's result, once its back half is done. */
  const staged = async (
    request: ContentRequest,
    descriptor?: ContentDescriptor,
  ): Promise<{ finish: Promise<ServiceResult<ContentIR>> }> => {
    // Without render threads a compile ends before the next one starts, as it always did.
    if (!plan.back?.window())
      return { finish: Promise.resolve(await compiler.compile(request, signal, descriptor)) };
    const { finish } = await compiler.compileStaged(request, signal, descriptor);
    // Awaited by the settle; this only keeps an early rejection from going unhandled.
    finish.catch(() => undefined);
    // Wrapped: an async function that returned the promise itself would wait for the back half.
    return { finish };
  };
  /** A fresh step's record, IR and dependencies. */
  const fresh = (step: RenderStep, compiled: ServiceResult<ContentIR>) => {
    const unitDependencies = compact(compiled.dependencies);
    records.settle(step, 'fresh', compiled, unitDependencies);
    unit.dependencies.push(...unitDependencies);
    if (compiled.value)
      unit.ir.push({ ...compiled.value, dependencies: compact(compiled.value.dependencies) });
  };
  const reuse = (step: RenderStep, ir: ContentIR) => {
    const unitDependencies = compact(ir.dependencies);
    unit.ir.push(ir);
    unit.dependencies.push(...unitDependencies);
    records.settle(step, 'reuse', none, unitDependencies);
  };
  const oldDescriptors = new Map(
    (unit.previous?.contentDescriptors ?? []).map((descriptor) => [descriptor.id, descriptor]),
  );
  const oldLinked = new Map(
    (unit.previous?.content ?? []).map((content) => [content.ir.id, content]),
  );
  /** The unit's settle steps, in the order a sequential render took them. */
  const steps: Array<() => void | Promise<void>> = [];
  for (const descriptor of unit.descriptors) {
    const step = records.renderStep(unit.record, descriptor.id);
    const previousDescriptor = oldDescriptors.get(descriptor.id);
    const previousContent = oldLinked.get(descriptor.id);
    let reusable: PageArtifact['content'][number] | undefined;
    if (
      previousDescriptor &&
      previousContent &&
      (previousDescriptor === descriptor || sameValue(previousDescriptor, descriptor)) &&
      matchesDescriptorContent(descriptor, previousContent.ir)
    ) {
      const refreshed = await unchanged(
        previousContent.ir.dependencies.filter((item) => item.kind !== 'keyword'),
      );
      if (refreshed.held) reusable = previousContent;
    }
    // `verify`: an IR reused on its recorded semantic closure is rendered again and compared.
    const verified = reusable
      ? await verifyClosureReuse(plan, unit, descriptor, reusable.ir)
      : undefined;
    if (verified) reusable = undefined;
    if (reusable) {
      const ir = reusable.ir;
      steps.push(() => reuse(step, ir));
      continue;
    }
    const contentRequest = unit.requests[descriptor.ordinal];
    if (!contentRequest || contentRequest.id !== descriptor.id) {
      steps.push(() =>
        records.settle(step, 'none', {
          diagnostics: [
            diagnostic(
              'COMPILATION_CONTENT_DESCRIPTOR_REQUEST',
              `Descriptor ${descriptor.id} has no current request at ordinal ${descriptor.ordinal}.`,
            ),
          ],
          dependencies: [],
        }),
      );
      continue;
    }
    const compiled = verified
      ? { finish: Promise.resolve(verified) }
      : await staged(contentRequest, descriptor);
    steps.push(async () => fresh(step, await compiled.finish));
  }

  if (unit.entry.kind === 'guide') {
    const semantics = unit.semantics;
    if (semantics && Object.keys(semantics.demos).length) {
      const demoId = `${unit.id}:demos`;
      const step = records.renderStep(unit.record, demoId);
      const oldDemo = oldLinked.get(demoId);
      let reusableDemo: PageArtifact['content'][number] | undefined;
      if (oldDemo && sameDescriptorPlan(unit.previous?.contentDescriptors, unit.descriptors)) {
        if ((await unchanged(oldDemo.ir.dependencies)).held) reusableDemo = oldDemo;
      }
      if (reusableDemo) {
        const ir = reusableDemo.ir;
        steps.push(() => reuse(step, ir));
      } else {
        const assets = await staged({
          kind: 'demo-assets',
          id: demoId,
          entry: unit.entry,
          semantics,
        });
        steps.push(async () => fresh(step, await assets.finish));
      }
    }
  }
  return async () => {
    for (const step of steps) await step();
    unit.inputDigest = inputDigest(unit, unit.dependencies);
    records.rendered(unit.record, unit.dependencies);
    rendered?.(unit.record.render.every((step) => step.projection !== 'fresh'));
  };
}

function matchesDescriptorContent(descriptor: ContentDescriptor, ir: ContentIR): boolean {
  return (
    ir.schemaVersion === GENERATOR_SCHEMA_VERSION &&
    ir.id === descriptor.id &&
    ir.role === descriptor.role &&
    ir.title === descriptor.title &&
    ir.route === descriptor.route &&
    ir.absoluteRoute === descriptor.absoluteRoute &&
    sameValue(ir.searchBreadcrumbs ?? [], descriptor.searchBreadcrumbs) &&
    ir.icon === descriptor.icon
  );
}

function sameDescriptorPlan(
  previous: ContentDescriptor[] | undefined,
  current: ContentDescriptor[],
): boolean {
  return !!previous && sameValue(previous, current);
}
