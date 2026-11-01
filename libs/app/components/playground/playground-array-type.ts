/**
 * Reading an input type as an array type, which the inspector uses to choose the control of an
 * array input and the property row to leave out the type chip of one. Shared inside the playground
 * entry point only; not public API.
 */

/**
 * The type that the control of array types without a control of their own is registered for.
 * NgDoc registers its JSON field for it, and `controls` can name it for an input.
 * @internal
 */
export const ARRAY_CONTROL_TYPE: string = 'NgDocArray';

/**
 * The type that the control of arrays of a union of literals (arrays whose `options` the builder
 * lists) is registered for. NgDoc registers its multi-select for it, as it registers the select
 * of a union for `NgDocTypeAlias`, and `controls` can name it for an input.
 * @internal
 */
export const UNION_ARRAY_CONTROL_TYPE: string = 'NgDocTypeAlias[]';

/** The item types whose arrays get the control registered for `<item>[]`, a chip field by default. */
const LIST_ITEM_TYPES: ReadonlySet<string> = new Set(['string', 'number']);

/** Keywords that make a type ending in `[]` another type than an array, as in `keyof Item[]`. */
const TYPE_OPERATOR: RegExp = /^(?:keyof|typeof|unique|infer|asserts|new)\s/;

/**
 * An input type that is an array or a tuple.
 * @internal
 */
export interface NgDocArrayType {
  /** `string[]` or `number[]` for an array of strings or numbers, whatever its spelling. */
  list?: string;
}

/**
 * Reads an input type as an array type: `T[]` (as both engines print an array), `Array<T>`,
 * `readonly T[]`, `ReadonlyArray<T>` or a tuple such as `[string, number]`, alone or in a union
 * with `undefined` or `null` (an optional or nullable input). An array of strings or numbers gets
 * the control of `string[]` or `number[]`, so a control registered for that type replaces the
 * built-in list for every spelling; any other array gets the control of `NgDocArray`, the JSON
 * field. A type alias of an array (`type Tags = string[]`) is printed by its name and is not
 * recognized: register a control for the name.
 * @param type - The input type as the builder printed it.
 * @returns What the array type is, or `undefined` when the type is not one.
 * @internal
 */
export function arrayType(type: string): NgDocArrayType | undefined {
  const members: string[] = splitTopLevel(type);
  const rest: string[] = members.filter(
    (member: string) => member !== 'undefined' && member !== 'null',
  );

  if (rest.length !== 1) {
    return undefined;
  }

  const written: string = unwrapParentheses(rest[0]).replace(/^readonly\s+/, '');
  const item: string | undefined = arrayItem(written);

  if (item !== undefined) {
    return LIST_ITEM_TYPES.has(item) ? { list: `${item}[]` } : {};
  }

  return written.startsWith('[') && written.endsWith(']') && isBalanced(written.slice(1, -1))
    ? {}
    : undefined;
}

/**
 * The item type of `T[]`, `Array<T>` or `ReadonlyArray<T>`.
 * @param type - A type that is not a union.
 */
function arrayItem(type: string): string | undefined {
  const generic: RegExpExecArray | null = /^(?:Readonly)?Array<([\s\S]*)>$/.exec(type);

  if (generic) {
    return isBalanced(generic[1]) ? unwrapParentheses(generic[1].trim()) : undefined;
  }

  if (!type.endsWith('[]') || TYPE_OPERATOR.test(type)) {
    return undefined;
  }

  const item: string = type.slice(0, -2).trim();

  // `() => string[]` is a function, and `A extends B ? C[] : D[]` a conditional type.
  const text: string | undefined = item ? topLevelText(item) : undefined;

  return text !== undefined && !/=>|\?/.test(text) ? unwrapParentheses(item) : undefined;
}

/**
 * Splits a type at the `|` of its top-level union, outside brackets and string literals.
 * @param type - The type.
 */
function splitTopLevel(type: string): string[] {
  const text: string | undefined = topLevelText(type);

  if (text === undefined) {
    return [type.trim()];
  }

  const members: string[] = [];
  let start: number = 0;

  for (let index = 0; index < text.length; index++) {
    if (text[index] === '|') {
      members.push(type.slice(start, index).trim());
      start = index + 1;
    }
  }

  return [...members, type.slice(start).trim()];
}

/**
 * Removes the parentheses around a whole type, such as those of `(string | number)`.
 * @param type - The type.
 */
function unwrapParentheses(type: string): string {
  let result: string = type.trim();

  while (result.startsWith('(') && result.endsWith(')') && isBalanced(result.slice(1, -1))) {
    result = result.slice(1, -1).trim();
  }

  return result;
}

/**
 * Whether every bracket and string literal of a type is closed in it.
 * @param type - The type.
 */
function isBalanced(type: string): boolean {
  return topLevelText(type) !== undefined;
}

/**
 * The type with every character inside brackets or a string literal replaced by a space, so that
 * the operators of the type itself can be found by position; `undefined` when a bracket or a string
 * is not closed. The `>` of an arrow (`=>`) closes no bracket.
 * @param type - The type.
 */
function topLevelText(type: string): string | undefined {
  let depth: number = 0;
  let quote: string | undefined;
  let text: string = '';

  for (let index = 0; index < type.length; index++) {
    const char: string = type[index];

    if (quote) {
      if (char === '\\') {
        index++;
        text += '  ';
        continue;
      }
      if (char === quote) {
        quote = undefined;
      }
      text += ' ';
      continue;
    }

    if (char === "'" || char === '"' || char === '`') {
      quote = char;
      text += ' ';
    } else if ('([{<'.includes(char)) {
      depth++;
      text += ' ';
    } else if (char === '>' && type[index - 1] === '=') {
      text += depth ? ' ' : char;
    } else if (')]}>'.includes(char)) {
      depth--;
      text += ' ';

      if (depth < 0) {
        return undefined;
      }
    } else {
      text += depth ? ' ' : char;
    }
  }

  return depth === 0 && !quote ? text : undefined;
}
