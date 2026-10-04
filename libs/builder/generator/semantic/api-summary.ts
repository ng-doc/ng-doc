import {
  type ClassDeclaration,
  type EnumDeclaration,
  type FunctionDeclaration,
  type InterfaceDeclaration,
  type JSDocableNode,
  type ParameterDeclaration,
  type TypeParameteredNode,
  Node,
} from 'ts-morph';

import type { SupportedDeclaration } from './program-state';

/**
 * The summary of an API declaration that the search palette and the API index show: a short
 * signature and a one-line description.
 *
 * Both are read from the declaration's own syntax (its header and its doc comment), never from
 * the type checker, so they depend only on the text of the declaring file, which the enumeration
 * that calls this has already read. A type the declaration only refers to is printed as written.
 */
export interface ApiSummary {
  /** The declaration header, for example `export class Name<T> extends Base`; a line per decorator. */
  signature: string;
  /**
   * The first paragraph of the doc comment as plain text: its first sentence when the paragraph is
   * longer than {@link API_DESCRIPTION_LIMIT} characters, cut at a word when that is still longer.
   */
  description?: string;
}

/** The longest description kept: one line in the palette preview and the index. */
export const API_DESCRIPTION_LIMIT = 160;

/** The longest written type kept in a type alias signature; a longer one prints as `…`. */
const TYPE_LIMIT = 80;

/**
 * The summary of a declaration.
 * @param node - The declaration.
 * @param doc - The node that holds its doc comment (a variable's statement).
 */
export function apiSummary(node: SupportedDeclaration, doc: JSDocableNode | undefined): ApiSummary {
  const description = doc ? plainDescription(doc) : undefined;
  return { signature: signature(node), ...(description ? { description } : {}) };
}

/**
 * The signature of a declaration by its kind.
 * @param node - The declaration.
 */
function signature(node: SupportedDeclaration): string {
  const name = node.getName() ?? 'default';
  if (Node.isClassDeclaration(node)) return classSignature(node, name);
  if (Node.isInterfaceDeclaration(node))
    return `${words(modifiers(node), 'interface', name + typeParameters(node), heritage(node))} { … }`;
  if (Node.isEnumDeclaration(node)) return `${words(modifiers(node), 'enum', name)} { … }`;
  if (Node.isTypeAliasDeclaration(node)) {
    const written = flat(node.getTypeNode()?.getText() ?? '');
    const type = written && written.length <= TYPE_LIMIT ? written : '…';
    return words(modifiers(node), 'type', name + typeParameters(node), '=', type);
  }
  if (Node.isFunctionDeclaration(node)) return functionSignature(node, name);
  const statement = node.getVariableStatement();
  const type = node.getTypeNode();
  return words(
    statement ? modifiers(statement) : [],
    statement?.getDeclarationKind() ?? 'const',
    name + (type ? `: ${flat(type.getText())}` : node.hasInitializer() ? ' = …' : ''),
  );
}

/** The longest single-line header the declaration panel keeps; a longer one breaks its clauses. */
const DECLARATION_LINE = 72;

/**
 * The declaration panel of a class, an interface or an enum page: its signature with an elided
 * body, and each heritage clause on its own indented line when the header does not fit on one line.
 * @param node - The class, interface or enum.
 */
export function apiDeclaration(
  node: ClassDeclaration | InterfaceDeclaration | EnumDeclaration,
): string {
  const name = node.getName() ?? 'default';
  if (Node.isEnumDeclaration(node)) return `${words(modifiers(node), 'enum', name)} { … }`;
  const head = words(
    modifiers(node),
    Node.isClassDeclaration(node) ? 'class' : 'interface',
    name + typeParameters(node),
  );
  const clauses = node.getHeritageClauses().map((clause) => flat(clause.getText()));
  const line = words(head, clauses);
  const header = line.length <= DECLARATION_LINE ? line : [head, ...clauses].join('\n  ');
  const decorators = Node.isClassDeclaration(node) ? decoratorLines(node) : [];
  return [...decorators, `${header} { … }`].join('\n');
}

/**
 * A line per decorator of a class, with its arguments elided.
 * @param node - The class.
 */
function decoratorLines(node: ClassDeclaration): string[] {
  return node.getDecorators().map((decorator) => {
    const [first, ...rest] = decorator.getArguments();
    const argument = !first
      ? ''
      : Node.isObjectLiteralExpression(first) && !rest.length
        ? '{ … }'
        : '…';
    return `@${decorator.getName()}${decorator.isDecoratorFactory() ? `(${argument})` : ''}`;
  });
}

/**
 * A class header, after a line per decorator (its arguments elided).
 * @param node - The class.
 * @param name - Its name.
 */
function classSignature(node: ClassDeclaration, name: string): string {
  return [
    ...decoratorLines(node),
    words(modifiers(node), 'class', name + typeParameters(node), heritage(node)),
  ].join('\n');
}

/**
 * A function header: its first overload, or the implementation without overloads.
 * @param node - The function.
 * @param name - Its name.
 */
function functionSignature(node: FunctionDeclaration, name: string): string {
  // Overloads document the public signatures; the implementation is only the last resort.
  const declaration = node.getOverloads()[0] ?? node;
  const parameters = declaration.getParameters().map(parameter).join(', ');
  const returns = declaration.getReturnTypeNode();
  return words(
    modifiers(node),
    'function',
    `${name}${typeParameters(declaration)}(${parameters})${returns ? `: ${flat(returns.getText())}` : ''}`,
  );
}

/**
 * A parameter as `name?: type`, without its default value.
 * @param node - The parameter.
 */
function parameter(node: ParameterDeclaration): string {
  const type = node.getTypeNode();
  return (
    (node.isRestParameter() ? '...' : '') +
    node.getName() +
    (node.hasQuestionToken() || node.hasInitializer() ? '?' : '') +
    (type ? `: ${flat(type.getText())}` : '')
  );
}

/**
 * The modifier keywords of a node, without its decorators.
 * @param node - The node.
 */
function modifiers(node: Node): string[] {
  return Node.isModifierable(node)
    ? node
        .getModifiers()
        .filter((modifier) => !Node.isDecorator(modifier))
        .map((modifier) => modifier.getText())
    : [];
}

/**
 * The type parameter list of a node, or an empty string.
 * @param node - The node.
 */
function typeParameters(node: TypeParameteredNode): string {
  const parameters = node.getTypeParameters().map((item) => flat(item.getText()));
  return parameters.length ? `<${parameters.join(', ')}>` : '';
}

/**
 * The `extends` and `implements` clauses of a node, as written.
 * @param node - The node.
 */
function heritage(node: Node): string {
  return Node.isHeritageClauseable(node)
    ? node
        .getHeritageClauses()
        .map((clause) => flat(clause.getText()))
        .join(' ')
    : '';
}

/**
 * Joins the non-empty parts with spaces.
 * @param parts - Words and lists of words.
 */
function words(...parts: Array<string | string[]>): string {
  return parts.flat().filter(Boolean).join(' ');
}

/**
 * Collapses whitespace, including line breaks, to single spaces.
 * @param text - The text.
 */
function flat(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * The first paragraph of the last doc comment as one line of plain text: inline links become
 * their label, Markdown links their text, and code spans and emphasis lose their markers.
 * @param doc - The node that holds the doc comment.
 */
function plainDescription(doc: JSDocableNode): string | undefined {
  const paragraph = (doc.getJsDocs().at(-1)?.getDescription() ?? '').trim().split(/\n\s*\n/)[0];
  const text = flat(
    paragraph
      .replace(
        /\{@link(?:code|plain)?\s+([^\s}|]+)(?:\s*\|\s*|\s+)?([^}]*)\}/g,
        (_, target, label) => String(label).trim() || String(target),
      )
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/(\*\*|__)(.+?)\1/g, '$2')
      .replace(/`/g, ''),
  );
  if (!text) return undefined;
  if (text.length <= API_DESCRIPTION_LIMIT) return text;
  const sentence = /^(.+?[.!?])(?=\s)/.exec(text)?.[1];
  if (sentence && sentence.length <= API_DESCRIPTION_LIMIT) return sentence;
  return `${text.slice(0, API_DESCRIPTION_LIMIT - 1).replace(/\s+\S*$/, '')}…`;
}
