import type {
  ArtifactIdentity,
  DeclarationDescriptor,
  DeferredContentRequest,
  EntryDescriptor,
  RouteRecord,
  ServiceResult,
} from '../contracts';
import { type Unit, hash, inputDigest } from './common';
import type { UnitRecord } from './fold';
import type { GenerationPlan } from './plan';

/** How the targeted path has an API entry described (`TargetedGeneration.describing`). */
export interface DescribePlan {
  /** The entry's enumeration of this generation, used instead of enumerating it again. */
  enumerated: ServiceResult<DeclarationDescriptor[]>;
  /**
   * Appends the retained unit of `declaration` (undefined: the entry's own unit) instead of
   * describing it, and says whether it did. The entry's own unit holds the enumeration's record.
   */
  replay?(declaration: DeclarationDescriptor | undefined): boolean;
}

/**
 * Describe phase of one discovered entry: its page shell or category unit and, for an API entry,
 * one unit per declaration, each with its content requests, descriptors and dependencies. Every
 * completed unit is appended to `units`; what each step emits is recorded on the unit's record
 * (the entry's `enumerateApi` on its first unit). With `described` (the targeted path), an API
 * entry takes the given enumeration, and the units it replays are appended in their place.
 */
export async function describeEntry(
  plan: GenerationPlan,
  entry: EntryDescriptor,
  units: Unit[],
  described?: DescribePlan,
): Promise<void> {
  const { options, semantic, compiler, records, signal, compact, configuration } = plan;
  let record: UnitRecord | undefined;
  const accept = <T>(value: ServiceResult<T>): T | undefined => {
    records.describe(record!, value);
    return value.value;
  };
  let declarations: DeclarationDescriptor[] = [];
  let replayedShell = false;
  if (entry.kind === 'api') {
    const enumerated = described?.enumerated ?? semantic.enumerateApi(entry.id);
    replayedShell = described?.replay?.(undefined) ?? false;
    if (replayedShell) declarations = enumerated.value ?? [];
    else {
      record = records.unit();
      declarations = accept(enumerated) ?? [];
    }
  }
  const descriptors: Array<DeclarationDescriptor | undefined> = [undefined, ...declarations];
  for (const declaration of descriptors) {
    signal.throwIfAborted();
    if (declaration ? described?.replay?.(declaration) : replayedShell) continue;
    record ??= records.unit();
    const identity: ArtifactIdentity = {
      projectId: options.projectId,
      entryId: entry.id,
      ...(declaration ? { declarationId: declaration.id } : {}),
      role: entry.kind === 'category' ? 'category' : 'page-shell',
    };
    const id = hash(identity);
    const requests: DeferredContentRequest[] = [];
    if (entry.kind !== 'category') {
      requests.push({ kind: 'header', id: `${id}:header`, entry: declaration ?? entry });
      if (declaration) requests.push({ kind: 'api-tab', id: `${id}:api`, declaration });
      else if (entry.kind === 'guide') {
        for (const markdown of entry.markdown)
          requests.push({
            kind: 'guide-tab',
            id: `${id}:tab:${hash(markdown)}`,
            entry,
            markdown,
          });
      }
    }
    const metadataResult = declaration
      ? undefined
      : semantic.renderFragment({ kind: 'entry-doc', entryId: entry.id });
    const metadataValue = metadataResult ? accept(metadataResult) : undefined;
    const unit: Unit = {
      id,
      identity,
      entry,
      ...(declaration ? { declaration } : {}),
      requests,
      descriptors: [],
      dependencies: compact([
        ...entry.dependencies,
        ...(metadataResult?.dependencies ?? []),
        ...plan.semanticReferences,
        ...plan.outputDependencies,
      ]),
      ir: [],
      inputDigest: '',
      ownerInputDigest: '',
      ...(metadataValue?.value &&
      typeof metadataValue.value === 'object' &&
      !Array.isArray(metadataValue.value)
        ? { metadata: metadataValue.value as RouteRecord['metadata'] }
        : {}),
      record,
    };
    if (entry.kind === 'guide') {
      const described = semantic.describeGuide(entry.id);
      unit.semantics = accept(described);
      unit.dependencies.push(...compact(described.dependencies));
    }
    unit.ownerInputDigest = inputDigest(unit, unit.dependencies);
    for (const [ordinal, contentRequest] of requests.entries()) {
      const described = await compiler.describe(
        contentRequest,
        {
          ownerId: id,
          ordinal,
          ownerInputDigest: unit.ownerInputDigest,
          compilerVersion: options.compilerVersion,
          toolchainDigest: options.toolchainDigest,
          configurationDigest: configuration.digest,
          closureIds: contentRequest.kind === 'header' ? [] : [`${id}:header`],
        },
        signal,
      );
      const descriptor = accept(described);
      unit.dependencies.push(...compact(described.dependencies));
      if (descriptor) unit.descriptors.push(descriptor);
    }
    const old = plan.previousById.get(id);
    if (
      old &&
      old.fingerprint.compilerVersion === options.compilerVersion &&
      old.fingerprint.toolchainDigest === options.toolchainDigest &&
      old.fingerprint.configurationDigest === configuration.digest
    ) {
      unit.previous = old;
    }
    unit.inputDigest = inputDigest(unit, unit.dependencies);
    records.described(record, unit.dependencies);
    units.push(unit);
    record = undefined;
  }
}
