import type { Element, ElementContent, Root } from 'hast';
import { toString } from 'hast-util-to-string';
import { visit } from 'unist-util-visit';

/**
 * Everything a highlighted code block depends on, apart from the installed Shiki release. A cache
 * keys a block by it (plus that release) with {@link NgDocHighlightCache.key}.
 */
export interface NgDocHighlightBlock {
  /** The plugin's format and the fixed Shiki options it highlights with. */
  readonly options: Readonly<Record<string, string | number | boolean>>;
  /** The theme names. NgDoc's own theme (`css-variables`) is not a Shiki theme. */
  readonly themes: { readonly light: string; readonly dark: string };
  /** The identity of the extra languages (`processHtml`'s `langs`); absent without any. */
  readonly languages?: string;
  /** The language of the block's class, or the default language: before the fallback. */
  readonly lang: string;
  /** The raw meta string, before it is parsed. */
  readonly meta: string;
  /** The block's text. */
  readonly code: string;
}

/**
 * A cache of highlighted code blocks for `processHtml`. Values are the JSON of the HAST nodes that
 * replace a block's `pre` element: `@shikijs/rehype` replaces it with the root of the highlighted
 * fragment, which holds the new `pre` element. A value that is not a JSON array of HAST elements or
 * such roots is a miss. The cache only ever receives values of blocks that were highlighted without
 * an error.
 */
export interface NgDocHighlightCache {
  /** The key of a block. It must change whenever anything in the block or the Shiki release does. */
  key(block: NgDocHighlightBlock): string;
  get(key: string): string | undefined;
  set(key: string, value: string): void;
  /**
   * Whether these themes are known to load, because the cache holds a block highlighted with them.
   * Without that, a document is processed only after Shiki has loaded them, as without a cache, so
   * that a theme that cannot load fails every document, even one without code.
   */
  loads?(themes: NgDocHighlightBlock['themes']): boolean;
  /** Highlights every hit again, uses the fresh value and reports each difference. */
  readonly verify?: boolean;
  /** A hit whose fresh value differs (with `verify`). */
  mismatch?(key: string): void;
}

/** The options of {@link cachedShikiPlugin}. */
export interface CachedShikiOptions {
  cache: NgDocHighlightCache;
  themes: NgDocHighlightBlock['themes'];
  /** The identity of the extra languages the transformer highlights with; absent without any. */
  languages?: string;
  /**
   * `used` when the transformer loads only the grammars blocks use. It gives the same result, so
   * it is not part of a key; it only selects the transformer.
   */
  grammars?: 'used';
  /** What the options stand for in a key: change it whenever the options or this plugin change. */
  identity: NgDocHighlightBlock['options'];
  /** The language of a block without a `language-*` class (the options' `defaultLanguage`). */
  defaultLanguage: string;
  /**
   * Creates the `@shikijs/rehype` transformer that highlights a miss, with the plugin's options;
   * called once per thread, theme pair and languages.
   */
  transformer: () => Highlighter;
}

type Highlighter = (tree: Root) => Promise<void> | void;

interface Block {
  node: Element;
  parent: Root | Element;
  key: string;
}

const languagePrefix = 'language-';

/**
 * One `@shikijs/rehype` transformer per theme pair and languages in this thread. It loads its
 * highlighter once (every bundled language, the extra ones, the themes and the WASM), where the plain plugin, created again for
 * every document, asks for the highlighter and loads every language and theme into it again on
 * each call. A transformer whose highlighter failed to load is forgotten, so the next document
 * tries again and fails with the same error, as the plain plugin does.
 */
const highlighters = new Map<string, Promise<Highlighter>>();

/**
 * The plain `@shikijs/rehype` plugin, with a cache of its results per block.
 *
 * It selects the blocks exactly as the plugin does (`pre` elements whose first child is a `code`
 * element with properties, with the language of its `language-*` class or the default language)
 * and leaves the tree unchanged while it keys them. A miss is highlighted by the plugin's own
 * transformer, on a tree that holds only that block, so it gets exactly the plugin's options,
 * language fallback, meta parsing and transformers. A failing block throws the plugin's error at
 * the same block, since a hit cannot fail (the cache holds only blocks that were highlighted), and
 * nothing is stored for it. Every value is serialized before the tree is changed, and every block
 * is replaced with nodes parsed from it, so later plugins, which change the tree, never change a
 * value or a node another block shares. A document whose blocks all hit (or that has none) never
 * loads Shiki once the cache shows that its themes load.
 */
export default function cachedShikiPlugin(settings: CachedShikiOptions) {
  const { cache, themes, languages, identity, defaultLanguage } = settings;
  const id = `${themes.light}\n${themes.dark}\n${languages ?? ''}\n${settings.grammars ?? 'all'}`;
  return async (tree: Root): Promise<void> => {
    const blocks: Block[] = [];
    visit(tree, 'element', (node, index, parent) => {
      if (!parent || index == null || node.tagName !== 'pre') return;
      const head = node.children[0];
      if (!head || head.type !== 'element' || head.tagName !== 'code' || !head.properties) return;
      const classes = head.properties['className'];
      const languageClass = Array.isArray(classes)
        ? classes.find((item) => typeof item === 'string' && item.startsWith(languagePrefix))
        : undefined;
      const lang =
        typeof languageClass === 'string'
          ? languageClass.slice(languagePrefix.length)
          : defaultLanguage;
      if (!lang) return;
      const data = head.data as { meta?: string | null } | undefined;
      const meta = data?.meta ?? head.properties['metastring']?.toString() ?? '';
      const code = toString(head);
      blocks.push({
        node,
        parent,
        key: cache.key({
          options: identity,
          themes,
          ...(languages === undefined ? {} : { languages }),
          lang,
          meta,
          code,
        }),
      });
    });
    let highlighter: Highlighter | undefined;
    const load = async (): Promise<Highlighter> =>
      (highlighter ??= await highlighterFor(id, settings.transformer));
    if (cache.loads?.(themes) !== true) await load();
    const values: ElementContent[][] = [];
    for (const block of blocks) {
      const cached = cache.get(block.key);
      const hit = cached === undefined ? undefined : fragment(cached);
      if (hit && !cache.verify) {
        values.push(hit);
        continue;
      }
      const fresh = await highlight(await load(), block.node);
      if (hit && fresh !== cached) cache.mismatch?.(block.key);
      if (fresh !== cached) cache.set(block.key, fresh);
      values.push(JSON.parse(fresh) as ElementContent[]);
    }
    blocks.forEach((block, position) => {
      const index = block.parent.children.indexOf(block.node);
      // A block nested in another block's `pre` was replaced inside that detached element.
      if (index >= 0) block.parent.children.splice(index, 1, ...values[position]!);
    });
  };
}

function highlighterFor(id: string, transformer: () => Highlighter): Promise<Highlighter> {
  const known = highlighters.get(id);
  if (known) return known;
  const created = (async (): Promise<Highlighter> => {
    const transform = transformer();
    // An empty tree makes the transformer load its highlighter, so that a failure to load is told
    // apart from a block's own failure.
    await transform({ type: 'root', children: [] });
    return transform;
  })();
  highlighters.set(id, created);
  created.catch(() => {
    if (highlighters.get(id) === created) highlighters.delete(id);
  });
  return created;
}

/** The JSON of the nodes the plugin replaces `node` with. */
async function highlight(transform: Highlighter, node: Element): Promise<string> {
  const root: Root = { type: 'root', children: [node] };
  await transform(root);
  return JSON.stringify(root.children);
}

/**
 * A cached value as fresh nodes, or undefined when it is not a JSON array of HAST elements or of
 * roots of elements (what `@shikijs/rehype` puts in place of a block).
 */
function fragment(value: string): ElementContent[] | undefined {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) && parsed.length > 0 && parsed.every(isReplacement)
      ? (parsed as ElementContent[])
      : undefined;
  } catch {
    return undefined;
  }
}

function isReplacement(value: unknown): boolean {
  if (isNode(value)) return value.type === 'element';
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const node = value as Record<string, unknown>;
  const children = node['children'];
  return (
    node['type'] === 'root' &&
    Array.isArray(children) &&
    children.length > 0 &&
    children.every((child) => isNode(child) && child.type === 'element')
  );
}

function isNode(value: unknown): value is ElementContent {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const node = value as Record<string, unknown>;
  if (node['type'] === 'text') return typeof node['value'] === 'string';
  const properties = node['properties'];
  const children = node['children'];
  return (
    node['type'] === 'element' &&
    typeof node['tagName'] === 'string' &&
    !!properties &&
    typeof properties === 'object' &&
    !Array.isArray(properties) &&
    Array.isArray(children) &&
    children.every(isNode)
  );
}
