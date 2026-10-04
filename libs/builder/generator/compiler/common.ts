import type {
  ArtifactIdentity,
  ContentDescriptor,
  ContentIR,
  DeclarationDescriptor,
  DeferredContentRequest,
  Dependency,
  Diagnostic,
  EntryDescriptor,
  GuideSemantics,
  KeywordExport,
  PageArtifact,
  RouteRecord,
} from '../contracts';
import { canonicalJson, compareCodeUnits, dependencyIdentity, digestOf } from '../kernel/canonical';
import type { UnitRecord } from './fold';

/** One page shell, category or API declaration of the current discovery. */
export interface Unit {
  id: string;
  identity: ArtifactIdentity;
  entry: EntryDescriptor;
  declaration?: DeclarationDescriptor;
  requests: DeferredContentRequest[];
  descriptors: ContentDescriptor[];
  dependencies: Dependency[];
  ir: ContentIR[];
  previous?: PageArtifact;
  inputDigest: string;
  ownerInputDigest: string;
  metadata?: RouteRecord['metadata'];
  semantics?: GuideSemantics;
  /** What this unit's phases emitted, replayed by `fold`. */
  record: UnitRecord;
}

/** Canonical JSON (`kernel/canonical.ts`): code-unit key order, `undefined` members omitted. */
export const stable = canonicalJson;
/** The one value digest: `sha256` of the canonical JSON. */
export const hash = digestOf;
export const diagnostic = (
  code: string,
  message: string,
  severity: Diagnostic['severity'] = 'error',
): Diagnostic => ({ code, message, severity, stage: 'aggregate' });
export const dependencyKey = dependencyIdentity;
export const uniqueDependencies = (values: Dependency[]): Dependency[] =>
  [...new Map(values.map((item) => [dependencyKey(item), item])).entries()]
    .sort(([a], [b]) => compareCodeUnits(a, b))
    .map(([, item]) => item);

export function sameValue(left: unknown, right: unknown): boolean {
  return stable(left) === stable(right);
}

export function inputDigest(unit: Unit, dependencies: Dependency[]): string {
  const { dependencies: _dependencies, ...entry } = unit.entry;
  return hash({
    // Names the digest formulas: a cache written with other formulas never matches an input digest.
    dependencyRepresentation: 'semantic-references-search-breadcrumbs-canonical-stable-types-v4',
    entry,
    declaration: unit.declaration ?? null,
    dependencies: uniqueDependencies(dependencies.filter((item) => item.kind !== 'keyword')),
  });
}

export function unitExports(unit: Unit): KeywordExport[] {
  if (unit.declaration) return [];
  return unit.entry.kind === 'api' && unit.entry.keyword
    ? [
        {
          key: `*${unit.entry.keyword}`,
          title: unit.entry.title,
          path: unit.entry.absoluteRoute,
          type: 'link',
        },
      ]
    : [];
}

export function sameStrings(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}
