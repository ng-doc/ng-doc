import { compareText } from '../../helpers/text-order';
import {
  type GeneratorContentCompiler,
  type PreparedLink,
  keywordBindings,
  linkedKeywordDigest,
} from '../content/content-compiler';
import type {
  ContentIR,
  Dependency,
  Diagnostic,
  DiscoverySnapshot,
  KeywordExport,
  LinkedContent,
  PageArtifact,
  ServiceResult,
} from '../contracts';
import { compareCodeUnits, sha256Hex as sha256 } from '../kernel/canonical';
import { type Unit, diagnostic, hash, sameStrings, stable, unitExports } from './common';
import type { MemoState } from './memo';
import type { GenerationPlan } from './plan';
import type { ReplayScope } from './targeted';

/** The keyword set every link of this generation reads. */
export interface KeywordPlan {
  keywords: KeywordExport[];
  keywordSetDigest: string;
}

/** What the link phase leaves for assembly. */
export interface LinkOutcome {
  linkedByUnit: Map<Unit, PageArtifact['content']>;
  keywordDependenciesByUnit: Map<Unit, Dependency[]>;
}

/**
 * Keywords phase: the combined keyword set (remote, configured, then local exports) and the
 * index completeness check: every current descriptor must have its IR, or the generation fails
 * (`undefined`).
 */
export function combineUnitKeywords(plan: GenerationPlan, units: Unit[]): KeywordPlan | undefined {
  const { records } = plan;
  const duplicates: Diagnostic[] = [];
  const keywords = combineKeywords(plan.found, units, duplicates);
  records.global('keywords', { diagnostics: duplicates, dependencies: [] });
  // Every link of this compile reads the same keyword set; freezing it lets the
  // content compiler build its lookup once instead of once per linked document.
  Object.freeze(keywords);
  // Keywords stay in output order; the digest uses code-unit order so it doesn't depend on the locale.
  const keywordSetDigest = hash([...keywords].sort((a, b) => compareCodeUnits(a.key, b.key)));
  if (
    units.some((unit) =>
      unit.descriptors.some(
        (descriptor) => !unit.ir.some((candidate) => candidate.id === descriptor.id),
      ),
    )
  ) {
    records.global('keywords', {
      diagnostics: [
        diagnostic(
          'COMPILATION_CONTENT_INDEX_INCOMPLETE',
          'A complete content index requires every current descriptor to be ready.',
        ),
      ],
      dependencies: [],
    });
    return undefined;
  }
  return { keywords, keywordSetDigest };
}

/**
 * Link phase: per unit its keyword dependencies, then each IR linked against the keyword set,
 * or reused when linking again provably yields the previous document (see `createLinkReuse`).
 *
 * On the targeted path (`scope`), a replayed unit outside the link set keeps its previous linked
 * content and its retained link record: none of the keys it uses changed binding, and linking
 * reads nothing else, so linking it again would yield exactly those.
 *
 * `done`, when progress is reported, hears how many units are done: the kept ones at once, then
 * each linked unit.
 *
 * With render threads (`content/html-pool`), the back half of each link that will not be reused is
 * dispatched a window of units ahead (`prepareLink`); the loop below still takes every result,
 * records it and reports it in unit order, exactly as when it links each one in its turn. Linking
 * is a pure function of the IR and the keyword set, so the result does not depend on when or where
 * it ran.
 */
export async function linkUnits(
  plan: GenerationPlan,
  units: Unit[],
  keywordPlan: KeywordPlan,
  scope?: ReplayScope,
  done?: (count: number) => void,
): Promise<LinkOutcome> {
  const { options, records, refresher, compiler, signal } = plan;
  const { keywords, keywordSetDigest } = keywordPlan;
  const linkedByUnit = new Map<Unit, PageArtifact['content']>();
  const keywordDependenciesByUnit = new Map<Unit, Dependency[]>();
  const kept = scope ? units.filter((unit) => scope.keepsLink(unit)) : [];
  for (const unit of kept) {
    const retained = scope!.retained(unit)!;
    unit.record.link.push(...retained.unit.record.link);
    linkedByUnit.set(unit, unit.previous!.content);
    keywordDependenciesByUnit.set(unit, retained.unit.record.link[0]?.dependencies ?? []);
  }
  if (kept.length) units = units.filter((unit) => !linkedByUnit.has(unit));
  if (kept.length) done?.(kept.length);
  // A keyword refresh digests the whole keyword set before it resolves any key, so
  // refresh the keys of all units at once. Each unit takes its own keys from that
  // canonical list; a sorted subset equals what a refresh of those keys alone returns.
  const unitKeywords = new Map(
    units.map((unit) => [unit, new Set(unit.ir.flatMap((ir) => ir.usedKeywords))]),
  );
  const allKeywordDependencies = (
    await refresher.refresh(
      [...new Set([...unitKeywords.values()].flatMap((keys) => [...keys]))]
        .sort()
        .map((key) => ({ kind: 'keyword' as const, key, digest: '' })),
      keywords,
    )
  ).dependencies;
  const linkReuse = createLinkReuse({
    enabled: plan.sessionPrevious,
    memo: plan.memo,
    keywords,
    keywordSetDigest,
    previous: plan.previous,
  });
  /** The unit's previous linked content by IR id. */
  const previousLinkedOf = (unit: Unit): Map<string, LinkedContent> => {
    // Linking reads no configuration, so a previous artifact of the same compiler and
    // toolchain serves even when the configuration digest (executable inputs) changed.
    const linkPrevious = plan.sessionPrevious ? plan.previousById.get(unit.id) : undefined;
    return new Map(
      (linkPrevious &&
      linkPrevious.fingerprint.compilerVersion === options.compilerVersion &&
      linkPrevious.fingerprint.toolchainDigest === options.toolchainDigest
        ? linkPrevious.content
        : []
      ).map((item) => [item.ir.id, item]),
    );
  };
  const linkRequestOf = (unit: Unit, ir: ContentIR): LinkRequest => ({
    ir,
    keywords,
    breadcrumbs: ir.searchBreadcrumbs ?? unit.declaration?.breadcrumbs ?? unit.entry.breadcrumbs,
    pageType: unit.entry.kind === 'guide' ? 'guide' : 'api',
  });
  // Links dispatched ahead of their turn, by IR, while render threads take them.
  const ahead = plan.back?.parallel ? plan.back.window() : 0;
  const prepared = new Map<ContentIR, PreparedLink>();
  let preparedUnits = 0;
  const prepareUntil = (end: number): void => {
    for (; preparedUnits < Math.min(end, units.length); preparedUnits += 1) {
      const unit = units[preparedUnits]!;
      const previousLinked = previousLinkedOf(unit);
      for (const ir of unit.ir) {
        const request = linkRequestOf(unit, ir);
        if (!linkReuse.reusable(request, previousLinked.get(ir.id)))
          prepared.set(ir, compiler.prepareLink(request, signal));
      }
    }
  };
  for (const [index, unit] of units.entries()) {
    if (ahead && !signal.aborted) prepareUntil(index + 1 + ahead);
    const content: PageArtifact['content'] = [];
    const usedKeywords = unitKeywords.get(unit)!;
    const previousLinked = previousLinkedOf(unit);
    const keywordDependencies = allKeywordDependencies
      .filter((dependency) => dependency.kind === 'keyword' && usedKeywords.has(dependency.key))
      .map((dependency) => ({ ...dependency }));
    keywordDependenciesByUnit.set(unit, keywordDependencies);
    records.link(unit.record, { diagnostics: [], dependencies: keywordDependencies });
    for (const ir of unit.ir) {
      const linkRequest = linkRequestOf(unit, ir);
      const ready = prepared.get(ir);
      prepared.delete(ir);
      const linked = explainFilteredKeywords(
        (signal.aborted ? undefined : linkReuse.reuse(linkRequest, previousLinked.get(ir.id))) ??
          (await linkReuse.link(linkRequest, (consulted) =>
            compiler.link(linkRequest, signal, consulted, ready),
          )),
        plan.found,
      );
      records.link(unit.record, linked);
      if (linked.value) content.push(linked.value);
    }
    linkedByUnit.set(unit, content);
    done?.(1);
  }
  return { linkedByUnit, keywordDependenciesByUnit };
}

const MISSING_KEYWORD = /Route with keyword "(\*[^"#]+)[^"]*" is missing/;

/**
 * A link to the guide keyword of an entry that `onlyForTags` left out of this build fails like
 * any missing keyword. Name that entry and the filter, so the cause is visible: the entry exists
 * in the sources, just not in a build with these tags. A pure function of the diagnostic and the
 * discovery snapshot, so incremental, reference and cold results stay identical.
 */
function explainFilteredKeywords<T>(
  result: ServiceResult<T>,
  found: DiscoverySnapshot,
): ServiceResult<T> {
  if (!found.filtered?.length) return result;
  let changed = false;
  const diagnostics = result.diagnostics.map((item) => {
    const key = item.code === 'CONTENT_LINK' ? MISSING_KEYWORD.exec(item.message)?.[1] : undefined;
    const entry = key && found.filtered!.find((filtered) => filtered.keywords?.includes(key));
    if (!entry) return item;
    changed = true;
    const by = entry.filteredBy;
    const category =
      by.source === entry.source ? '' : ` of its category "${by.title}" (${by.source})`;
    const tags = found.configuration.tags ?? [];
    return {
      ...item,
      code: 'CONTENT_KEYWORD_FILTERED',
      message:
        `${item.message.replace(/^Error: /, '')} Keyword ${key} belongs to "${entry.title}" ` +
        `(${entry.source}), which onlyForTags [${by.onlyForTags.join(', ')}]${category} leaves ` +
        `out of this build (build tags: [${tags.join(', ')}]).`,
    };
  });
  return changed ? { ...result, diagnostics } : result;
}

/** A url with a scheme (`https:`, `mailto:`) or protocol-relative: not a route of this site. */
const EXTERNAL_URL = /^(?:[a-z][a-z\d+.-]*:|\/\/)/i;

function combineKeywords(
  found: DiscoverySnapshot,
  units: Unit[],
  diagnostics: Diagnostic[],
): KeywordExport[] {
  const result = new Map<string, KeywordExport>();
  // A keyword defined in `keywords.keywords` is the author's explicit choice for its name:
  // - when its url is the route of a local export of that name (a page or an API declaration),
  //   that export wins over every other export of the name (the last one, if several share the
  //   route), without a duplicate warning;
  // - otherwise it replaces the loader keywords of that name without a warning, and a local export
  //   still wins over it, reported as before. When it replaces a loader keyword with an internal
  //   url that no page, category or API declaration of this build has (a pin whose export was
  //   removed or renamed), the link would be dead: that is `KEYWORD_PIN_UNRESOLVED`.
  const configured = new Map(found.globalKeywords.map((item) => [item.key, item]));
  const remote = found.remoteKeywords.flatMap((loader) => loader.keywords);
  const local = units.flatMap((unit) => [
    ...unitExports(unit),
    ...unit.ir.flatMap((ir) => ir.exportedKeywords),
  ]);
  const route = (item: Pick<KeywordExport, 'path'>): string => item.path.replace(/^\//, '');
  const pinned = new Map<string, KeywordExport>();
  for (const item of local) {
    const choice = configured.get(item.key);
    if (choice && route(choice) === route(item)) pinned.set(item.key, item);
  }
  const remoteKeys = new Set(remote.map((item) => item.key));
  const localKeys = new Set(local.map((item) => item.key));
  const routes = new Set([
    ...found.entries.map((entry) => route({ path: entry.absoluteRoute })),
    ...local.map(route),
  ]);
  for (const choice of found.globalKeywords) {
    const target = route(choice).replace(/[?#].*$/, '');
    if (
      remoteKeys.has(choice.key) &&
      !localKeys.has(choice.key) &&
      !EXTERNAL_URL.test(choice.path) &&
      !routes.has(target)
    )
      diagnostics.push(
        diagnostic(
          'KEYWORD_PIN_UNRESOLVED',
          `Keyword ${choice.key} of keywords.keywords replaces a keyword loader's link with ${choice.path}, but no page or API declaration of this build has that route.`,
          'warning',
        ),
      );
  }
  const beforeLocal = remote.length + found.globalKeywords.length;
  // Explicit deterministic precedence: remote, configured, then local documentation exports.
  for (const [index, item] of [...remote, ...found.globalKeywords, ...local].entries()) {
    const previous = result.get(item.key);
    const choice = pinned.get(item.key);
    const settled = choice !== undefined || (index < beforeLocal && configured.has(item.key));
    if (previous && !settled && stable(previous) !== stable(item))
      diagnostics.push(
        diagnostic(
          'KEYWORD_DUPLICATE',
          `Keyword ${item.key} has multiple exports; the last export in deterministic discovery order wins (${item.path}).`,
          'warning',
        ),
      );
    result.set(item.key, choice ?? item);
  }
  return [...result.values()].sort((a, b) => compareText(a.key, b.key));
}

type LinkRequest = Parameters<GeneratorContentCompiler['link']>[0];

/**
 * Reuses a previous linked document when linking again provably yields it: the IR HTML,
 * title and absolute route are equal, the search-record parameters are equal (records carry
 * them; with no record they have no effect), and either the whole keyword set of the previous
 * snapshot is unchanged or every key the recorded link pass consulted still has the same binding.
 */
function createLinkReuse(input: {
  enabled: boolean;
  memo: MemoState;
  keywords: KeywordExport[];
  keywordSetDigest: string;
  previous: PageArtifact[];
}): {
  /** Whether `reuse` would reuse `previous`; records nothing. */
  reusable(request: LinkRequest, previous: LinkedContent | undefined): boolean;
  reuse(
    request: LinkRequest,
    previous: LinkedContent | undefined,
  ): ServiceResult<LinkedContent> | undefined;
  link(
    request: LinkRequest,
    run: (consulted: Set<string> | undefined) => Promise<ServiceResult<LinkedContent>>,
  ): Promise<ServiceResult<LinkedContent>>;
} {
  const aggregates = input.enabled
    ? input.previous.filter((artifact) => artifact.identity.role === 'aggregate')
    : [];
  const sameKeywordSet =
    aggregates.length === 1 && aggregates[0].fingerprint.keywordDigest === input.keywordSetDigest;
  const bindings = keywordBindings(input.keywords);
  const bindingTexts = new Map<string, string>();
  const bindingsDigest = (keys: string[]): string =>
    sha256(
      JSON.stringify(
        keys.map((key) => {
          let text = bindingTexts.get(key);
          if (text === undefined) {
            text = stable(bindings.get(key) ?? null);
            bindingTexts.set(key, text);
          }
          return [key, text];
        }),
      ),
    );
  /** The recorded link facts that prove `previous` is linking again's result, if it is. */
  const proof = (
    request: LinkRequest,
    previous: LinkedContent | undefined,
  ): { recorded: ReturnType<MemoState['link']> } | undefined => {
    if (!input.enabled || !previous) return undefined;
    const { ir } = request;
    if (
      previous.ir.html !== ir.html ||
      previous.ir.title !== ir.title ||
      previous.ir.absoluteRoute !== ir.absoluteRoute ||
      !previous.searchRecords.every(
        (record) =>
          record.pageType === request.pageType &&
          sameStrings(record.breadcrumbs, request.breadcrumbs),
      )
    )
      return undefined;
    const recorded = input.memo.link(ir.id);
    const proven =
      sameKeywordSet ||
      (!!recorded &&
        recorded.input === sha256(ir.html) &&
        recorded.output === sha256(previous.html) &&
        recorded.bindings === bindingsDigest(recorded.keys));
    return proven ? { recorded } : undefined;
  };
  return {
    reusable: (request, previous) => proof(request, previous) !== undefined,
    reuse(request: LinkRequest, previous: LinkedContent | undefined) {
      const proved = proof(request, previous);
      if (!proved || !previous) return undefined;
      const { ir } = request;
      input.memo.recordLink(ir.id, proved.recorded);
      return {
        dependencies: ir.dependencies,
        diagnostics: ir.diagnostics,
        value: {
          ir,
          html: previous.html,
          searchRecords: previous.searchRecords,
          keywordDigest: linkedKeywordDigest(ir, input.keywords),
        },
      };
    },
    async link(
      request: {
        ir: ContentIR;
        keywords: KeywordExport[];
        breadcrumbs: string[];
        pageType: 'guide' | 'api';
      },
      run: (consulted: Set<string> | undefined) => Promise<ServiceResult<LinkedContent>>,
    ) {
      if (!input.memo.enabled) return run(undefined);
      const consulted = new Set<string>();
      const linked = await run(consulted);
      if (linked.value) {
        const keys = [...consulted].sort();
        input.memo.recordLink(request.ir.id, {
          input: sha256(request.ir.html),
          output: sha256(linked.value.html),
          keys,
          bindings: bindingsDigest(keys),
        });
      }
      return linked;
    },
  };
}
