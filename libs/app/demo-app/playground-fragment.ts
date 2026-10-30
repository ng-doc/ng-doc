import {
  ɵdecodePlaygroundValue,
  ɵencodePlaygroundValue,
  ɵNG_DOC_PLAYGROUND_STATE_URL_LIMIT,
  ɵNgDocPlaygroundEncodedValue,
  ɵplaygroundStateFromUrl,
  ɵplaygroundStateToUrl,
} from './playground-value';

/**
 * The state of an isolated playground that its documentation page passes to the frame.
 * @internal
 */
export interface ɵNgDocPlaygroundState {
  /** The names of the target's inputs, in order: a pipe's parameters are positional. */
  readonly inputs: readonly string[];
  /** The value of each input, by name. */
  readonly properties: Readonly<Record<string, unknown>>;
  /** The content slots that are shown. */
  readonly content: readonly string[];
  /** Whether the frame creates the target again for this state. */
  readonly recreate: boolean;
}

/**
 * A state written as a URL fragment, or why it can't be: the input whose value can't be encoded,
 * or an empty `path` when the fragment would be too long.
 * @internal
 */
export type ɵNgDocPlaygroundFragment =
  | { readonly ok: true; readonly fragment: string }
  | { readonly ok: false; readonly path: string; readonly reason: string };

/** Fragment parameters of the playground itself; an input name never starts with `~`. */
const INPUTS = '~inputs';
const CONTENT = '~content';
const RECREATE = '~recreate';
const VALUES = '~v';

/** The text JSON gives a number, which a readable string value must not look like. */
const NUMBER = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/;

/**
 * Writes a state as a URL fragment (without `#`). A string, a finite number or a boolean is its
 * own readable parameter (`label=Save&size=2&disabled=true`; a string that would read as another
 * type is quoted as JSON). Every other value goes into one `~v` parameter, encoded by
 * {@link ɵencodePlaygroundValue}. The frame reads the fragment with
 * {@link ɵplaygroundStateFromFragment}, and the same fragment opens the page in a new tab.
 * @param state - The state of the playground.
 * @internal
 */
export function ɵplaygroundStateToFragment(state: ɵNgDocPlaygroundState): ɵNgDocPlaygroundFragment {
  const parameters: string[] = [`${INPUTS}=${state.inputs.map(encodeURIComponent).join(',')}`];
  const encoded: Record<string, ɵNgDocPlaygroundEncodedValue> = {};

  for (const [name, value] of Object.entries(state.properties)) {
    const readable = readableText(value);

    if (readable !== undefined) {
      parameters.push(`${encodeURIComponent(name)}=${encodeURIComponent(readable)}`);
      continue;
    }
    const result = ɵencodePlaygroundValue(value);

    if (!result.ok) {
      return {
        ok: false,
        path: result.path ? `${name}.${result.path}` : name,
        reason: result.reason,
      };
    }
    encoded[name] = result.value;
  }
  if (Object.keys(encoded).length) {
    const text = ɵplaygroundStateToUrl(encoded);

    if (text === undefined) return tooLong();
    parameters.push(`${VALUES}=${text}`);
  }
  if (state.content.length) {
    parameters.push(`${CONTENT}=${state.content.map(encodeURIComponent).join(',')}`);
  }
  if (state.recreate) parameters.push(`${RECREATE}=1`);
  const fragment = parameters.join('&');

  return fragment.length > ɵNG_DOC_PLAYGROUND_STATE_URL_LIMIT ? tooLong() : { ok: true, fragment };
}

/**
 * Reads a state that {@link ɵplaygroundStateToFragment} wrote. Throws on a fragment it can't
 * have written, so a malformed URL never reaches the target half-read.
 * @param fragment - The fragment, with or without the leading `#`.
 * @internal
 */
export function ɵplaygroundStateFromFragment(fragment: string): ɵNgDocPlaygroundState {
  const text = fragment.replace(/^#/, '');
  const properties: Record<string, unknown> = {};
  let inputs: string[] | undefined;
  let content: string[] = [];
  let recreate = false;

  if (text.length > ɵNG_DOC_PLAYGROUND_STATE_URL_LIMIT) throw new Error('The state is too long.');
  for (const parameter of text ? text.split('&') : []) {
    const separator = parameter.indexOf('=');

    if (separator < 1) throw new Error(`Malformed parameter: ${parameter}`);
    const name = decodeURIComponent(parameter.slice(0, separator));
    const value = parameter.slice(separator + 1);

    if (name === INPUTS) inputs = list(value);
    else if (name === CONTENT) content = list(value);
    else if (name === RECREATE) recreate = value === '1';
    else if (name === VALUES) {
      const values = ɵplaygroundStateFromUrl(value);

      if (!values) throw new Error('Malformed encoded values.');
      for (const [key, item] of Object.entries(values))
        properties[key] = ɵdecodePlaygroundValue(item);
    } else if (name.startsWith('~')) {
      throw new Error(`Unknown parameter: ${name}`);
    } else {
      properties[name] = readValue(decodeURIComponent(value));
    }
  }
  if (!inputs) throw new Error('The state names no inputs.');
  return { inputs, properties, content, recreate };
}

/**
 *
 */
function tooLong(): ɵNgDocPlaygroundFragment {
  return { ok: false, path: '', reason: 'the values are too long for the URL of the frame' };
}

/**
 *
 * @param value
 */
function list(value: string): string[] {
  return value ? value.split(',').map(decodeURIComponent) : [];
}

/**
 * The readable text of a value, or `undefined` when it goes into the encoded parameter.
 * @param value
 */
function readableText(value: unknown): string | undefined {
  if (typeof value === 'boolean') return String(value);
  if (typeof value === 'number') {
    return Number.isFinite(value) && !Object.is(value, -0) ? JSON.stringify(value) : undefined;
  }
  if (typeof value !== 'string') return undefined;
  return value === 'true' || value === 'false' || NUMBER.test(value) || value.startsWith('"')
    ? JSON.stringify(value)
    : value;
}

/**
 *
 * @param text
 */
function readValue(text: string): unknown {
  if (text === 'true') return true;
  if (text === 'false') return false;
  if (NUMBER.test(text)) return Number(text);
  if (text.startsWith('"')) {
    const parsed: unknown = JSON.parse(text);

    if (typeof parsed !== 'string') throw new Error(`Malformed string: ${text}`);
    return parsed;
  }
  return text;
}
