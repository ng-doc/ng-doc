import type { Element, Root } from 'hast';
import {
  type HighlighterGeneric,
  type LanguageRegistration,
  bundledLanguages,
  createHighlighter,
} from 'shiki';
import { visit } from 'unist-util-visit';

/**
 * Loading only the Shiki grammars that code blocks use, with the same result as loading every
 * bundled grammar.
 *
 * `@shikijs/rehype` sets its highlighter up with every bundled grammar, which takes seconds. A
 * grammar's highlighting depends only on the grammars it can reach: the languages it embeds
 * (`embeddedLangs`, and `embeddedLangsLazy`, which it uses once they are loaded), the scopes its
 * rules include, and the grammars that inject into its scopes (`injectTo`, matched by scope
 * prefix, in registration order). {@link ShikiGrammars.closure} is that set, closed under the
 * same rules, plus every grammar that shares an injection target with an injector in it, so the
 * injections of a scope are always registered together. Loaded in the order in which loading every
 * bundled grammar registers them (the first mention of each name), a closure gives the
 * highlighter the same grammars, injections and injection order for its languages as loading
 * everything, whatever else was loaded before: a highlighter only grows by whole closures, and
 * each scope's grammars are complete when the scope is first loaded.
 */
export class ShikiGrammars {
  private readonly byName = new Map<string, LanguageRegistration>();
  private readonly byScope = new Map<string, LanguageRegistration>();
  private readonly injectors = new Map<string, LanguageRegistration[]>();
  private readonly order = new Map<string, number>();
  private readonly closures = new Map<string, readonly LanguageRegistration[]>();
  private readonly loaded = new WeakMap<object, Set<string>>();

  private constructor(registrations: readonly LanguageRegistration[]) {
    const mention = (name: string) => {
      if (!this.order.has(name)) this.order.set(name, this.order.size);
    };
    for (const registration of registrations) {
      mention(registration.name);
      for (const embedded of registration.embeddedLangs ?? []) mention(embedded);
      if (this.byScope.has(registration.scopeName)) continue;
      this.byScope.set(registration.scopeName, registration);
      this.byName.set(registration.name, registration);
      for (const alias of registration.aliases ?? []) this.byName.set(alias, registration);
      for (const target of registration.injectTo ?? []) {
        const list = this.injectors.get(target) ?? [];
        list.push(registration);
        this.injectors.set(target, list);
      }
    }
  }

  /**
   * The bundled grammars, in the order `@shikijs/rehype` registers them: every bundled language
   * name, each with the registrations of its module.
   */
  static async create(): Promise<ShikiGrammars> {
    const modules = await Promise.all(
      Object.keys(bundledLanguages).map((name) =>
        bundledLanguages[name as keyof typeof bundledLanguages](),
      ),
    );
    return new ShikiGrammars(modules.flatMap((module) => module.default));
  }

  /**
   * The grammars that a block of `language` can reach, in registration order; empty for a
   * language that no bundled grammar names (it falls back to plain text, as before).
   * @param language
   */
  closure(language: string): readonly LanguageRegistration[] {
    const known = this.closures.get(language);
    if (known) return known;
    const set = new Set<LanguageRegistration>();
    const queue: Array<LanguageRegistration | undefined> = [this.byName.get(language)];
    while (queue.length) {
      const registration = queue.pop();
      if (!registration || set.has(registration)) continue;
      set.add(registration);
      for (const name of [
        ...(registration.embeddedLangs ?? []),
        ...(registration.embeddedLangsLazy ?? []),
      ])
        queue.push(this.byName.get(name));
      for (const scope of includedScopes(registration)) queue.push(this.byScope.get(scope));
      for (const prefix of prefixes(registration.scopeName))
        queue.push(...(this.injectors.get(prefix) ?? []));
      for (const target of registration.injectTo ?? [])
        queue.push(...(this.injectors.get(target) ?? []));
    }
    const closure = [...set].sort(
      (left, right) => this.order.get(left.name)! - this.order.get(right.name)!,
    );
    this.closures.set(language, closure);
    return closure;
  }

  /**
   * Loads the closures of `languages` that `highlighter` does not hold yet.
   * @param highlighter
   * @param languages
   */
  load(highlighter: HighlighterGeneric<string, string>, languages: Iterable<string>): void {
    let loaded = this.loaded.get(highlighter);
    if (!loaded) this.loaded.set(highlighter, (loaded = new Set()));
    const missing = new Set<LanguageRegistration>();
    for (const language of languages)
      for (const registration of this.closure(language))
        if (!loaded.has(registration.name)) missing.add(registration);
    if (!missing.size) return;
    const batch = [...missing].sort(
      (left, right) => this.order.get(left.name)! - this.order.get(right.name)!,
    );
    highlighter.loadLanguageSync(batch);
    for (const registration of batch) loaded.add(registration.name);
  }
}

let grammars: Promise<ShikiGrammars> | undefined;

/** The bundled grammars of this thread, read once. */
export function shikiGrammars(): Promise<ShikiGrammars> {
  grammars ??= ShikiGrammars.create().catch((error: unknown) => {
    grammars = undefined;
    throw error;
  });
  return grammars;
}

/**
 * A highlighter with the given themes and no language: {@link ShikiGrammars.load} adds them.
 * @param themes
 */
export function createGrammarlessHighlighter(
  themes: Parameters<typeof createHighlighter>[0]['themes'],
): Promise<HighlighterGeneric<string, string>> {
  return createHighlighter({ themes, langs: [] }) as Promise<HighlighterGeneric<string, string>>;
}

const languagePrefix = 'language-';

/**
 * The language of every block `@shikijs/rehype` highlights in `tree` (a `pre` whose first child is
 * a `code` element with properties): its `language-*` class, or `defaultLanguage`.
 * @param tree
 * @param defaultLanguage
 */
export function blockLanguages(tree: Root, defaultLanguage: string): Set<string> {
  const languages = new Set<string>();
  visit(tree, 'element', (node: Element) => {
    if (node.tagName !== 'pre') return;
    const head = node.children[0];
    if (!head || head.type !== 'element' || head.tagName !== 'code' || !head.properties) return;
    const classes = head.properties['className'];
    const languageClass = Array.isArray(classes)
      ? classes.find((item) => typeof item === 'string' && item.startsWith(languagePrefix))
      : undefined;
    languages.add(
      typeof languageClass === 'string'
        ? languageClass.slice(languagePrefix.length)
        : defaultLanguage,
    );
  });
  return languages;
}

/**
 * The scopes that a grammar's rules include from other grammars (`include: "source.x#rule"`).
 * @param registration
 */
function includedScopes(registration: LanguageRegistration): Set<string> {
  const scopes = new Set<string>();
  const walk = (value: unknown): void => {
    if (Array.isArray(value)) value.forEach(walk);
    else if (value && typeof value === 'object')
      for (const [key, item] of Object.entries(value)) {
        if (key === 'include' && typeof item === 'string') {
          if (!item.startsWith('#') && !item.startsWith('$')) scopes.add(item.split('#')[0]!);
        } else walk(item);
      }
  };
  walk(registration);
  return scopes;
}

/**
 * `a`, `a.b` and `a.b.c` for `a.b.c`: the scopes an injection target matches.
 * @param scope
 */
function prefixes(scope: string): string[] {
  const parts = scope.split('.');
  return parts.map((_, index) => parts.slice(0, index + 1).join('.'));
}
