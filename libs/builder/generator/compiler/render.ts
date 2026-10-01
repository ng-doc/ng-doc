import type { ContentDescriptor, ContentIR, Dependency, PageArtifact } from '../contracts';
import { GENERATOR_SCHEMA_VERSION } from '../contracts';
import { type Unit, diagnostic, inputDigest, sameValue, uniqueDependencies } from './common';
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
 * `rendered`, when progress is reported, hears of each unit as it finishes, and whether all of its
 * content was reused.
 */
export async function renderUnits(
  plan: GenerationPlan,
  units: Unit[],
  scope?: ReplayScope,
  rendered?: (reused: boolean) => void,
): Promise<void> {
  const { records, refresher, compiler, compact, signal } = plan;
  const none = { diagnostics: [], dependencies: [] };
  for (const unit of units) {
    const replayed = scope?.retained(unit) !== undefined;
    if (replayed && unit.record.rendered) {
      rendered?.(true);
      continue;
    }
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
    const oldDescriptors = new Map(
      (unit.previous?.contentDescriptors ?? []).map((descriptor) => [descriptor.id, descriptor]),
    );
    const oldLinked = new Map(
      (unit.previous?.content ?? []).map((content) => [content.ir.id, content]),
    );
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
        const unitDependencies = compact(reusable.ir.dependencies);
        unit.ir.push(reusable.ir);
        unit.dependencies.push(...unitDependencies);
        records.settle(step, 'reuse', none, unitDependencies);
        continue;
      }
      const contentRequest = unit.requests[descriptor.ordinal];
      if (!contentRequest || contentRequest.id !== descriptor.id) {
        records.settle(step, 'none', {
          diagnostics: [
            diagnostic(
              'COMPILATION_CONTENT_DESCRIPTOR_REQUEST',
              `Descriptor ${descriptor.id} has no current request at ordinal ${descriptor.ordinal}.`,
            ),
          ],
          dependencies: [],
        });
        continue;
      }
      const compiled = verified ?? (await compiler.compile(contentRequest, signal, descriptor));
      const unitDependencies = compact(compiled.dependencies);
      records.settle(step, 'fresh', compiled, unitDependencies);
      unit.dependencies.push(...unitDependencies);
      if (compiled.value) {
        unit.ir.push({
          ...compiled.value,
          dependencies: compact(compiled.value.dependencies),
        });
      }
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
          const unitDependencies = compact(reusableDemo.ir.dependencies);
          unit.ir.push(reusableDemo.ir);
          unit.dependencies.push(...unitDependencies);
          records.settle(step, 'reuse', none, unitDependencies);
        } else {
          const assets = await compiler.compile(
            { kind: 'demo-assets', id: demoId, entry: unit.entry, semantics },
            signal,
          );
          const unitDependencies = compact(assets.dependencies);
          records.settle(step, 'fresh', assets, unitDependencies);
          const ir = assets.value;
          unit.dependencies.push(...unitDependencies);
          if (ir) unit.ir.push({ ...ir, dependencies: compact(ir.dependencies) });
        }
      }
    }
    unit.inputDigest = inputDigest(unit, unit.dependencies);
    records.rendered(unit.record, unit.dependencies);
    rendered?.(unit.record.render.every((step) => step.projection !== 'fresh'));
  }
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
