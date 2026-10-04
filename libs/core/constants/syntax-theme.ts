/**
 * The name of NgDoc's syntax highlighting theme. Set it as `shiki.themes.light` and
 * `shiki.themes.dark` in the NgDoc configuration to colour code with the `--ng-doc-syntax-*` CSS
 * variables of the current theme. The new engine uses it when `shiki.themes` is not set.
 */
export const NG_DOC_SYNTAX_THEME_NAME = 'css-variables';

/** A TextMate token colour rule of a syntax highlighting theme. */
export interface NgDocSyntaxThemeRule {
  /** The TextMate scopes the rule colours. */
  scope: string | string[];
  /** The colour and font style of the tokens. */
  settings: {
    /** A CSS colour. */
    foreground?: string;
    /** `italic`, `bold`, `underline` or a space-separated combination. */
    fontStyle?: string;
  };
}

/** A Shiki (TextMate) syntax highlighting theme. */
export interface NgDocSyntaxTheme {
  /** The theme name. */
  name: string;
  /** Whether the theme is meant for a light or a dark background. */
  type: 'light' | 'dark';
  /** Editor colours, such as `editor.foreground`. */
  colors: Record<string, string>;
  /** Token colour rules. */
  tokenColors: NgDocSyntaxThemeRule[];
}

const syntax = (token: string): string => `var(--ng-doc-syntax-${token})`;

/**
 * Creates NgDoc's syntax highlighting theme: every token colour is a `--ng-doc-syntax-*` CSS
 * variable, so highlighted code follows the light, dark and user themes without being highlighted
 * again. Shiki changes the theme object it loads, so every highlighter needs a new one.
 * @returns A new theme object named {@link NG_DOC_SYNTAX_THEME_NAME}.
 */
export function ngDocSyntaxTheme(): NgDocSyntaxTheme {
  return {
    name: NG_DOC_SYNTAX_THEME_NAME,
    type: 'light',
    colors: {
      'editor.foreground': syntax('plain'),
      'editor.background': 'var(--ng-doc-code-background)',
    },
    // A more specific scope wins over a shorter one, so the order below does not matter.
    tokenColors: [
      {
        scope: ['comment', 'punctuation.definition.comment', 'string.quoted.docstring'],
        settings: { foreground: syntax('comment'), fontStyle: 'italic' },
      },
      {
        scope: [
          'punctuation',
          'meta.brace',
          'keyword.operator',
          'punctuation.definition.tag',
          'punctuation.definition.template-expression',
          'punctuation.section.embedded',
        ],
        settings: { foreground: syntax('punctuation') },
      },
      {
        scope: [
          'keyword',
          'storage',
          'keyword.operator.new',
          'keyword.operator.expression',
          'keyword.operator.word',
          'variable.language',
          'markup.heading',
        ],
        settings: { foreground: syntax('keyword') },
      },
      {
        scope: [
          'entity.name.type',
          'entity.name.class',
          'entity.name.namespace',
          'entity.other.inherited-class',
          'support.type',
          'support.class',
          'markup.underline.link',
        ],
        settings: { foreground: syntax('type') },
      },
      {
        scope: [
          'entity.name.function',
          'support.function',
          'variable.function',
          'entity.other.attribute-name',
        ],
        settings: { foreground: syntax('function') },
      },
      {
        scope: [
          'string',
          'punctuation.definition.string',
          'markup.inline.raw',
          'markup.fenced_code',
        ],
        settings: { foreground: syntax('string') },
      },
      {
        // Code embedded in a string, such as a template literal's `${…}`.
        scope: ['meta.template.expression', 'meta.embedded'],
        settings: { foreground: syntax('plain') },
      },
      {
        scope: [
          'constant.numeric',
          'constant.language',
          'constant.character',
          'constant.other',
          'keyword.other.unit',
        ],
        settings: { foreground: syntax('number') },
      },
      {
        scope: ['entity.name.tag', 'support.class.component'],
        settings: { foreground: syntax('tag') },
      },
      {
        // The `@` and the decorator name; its arguments keep their own colours.
        scope: ['punctuation.decorator', 'meta.decorator entity.name.function'],
        settings: { foreground: syntax('decorator') },
      },
      { scope: ['markup.bold', 'markup.heading'], settings: { fontStyle: 'bold' } },
      { scope: ['markup.italic'], settings: { fontStyle: 'italic' } },
    ],
  };
}
