/**
 * Stringify data to JSON. If data is undefined, return string 'undefined'; a value JSON has no
 * text for (a function, a symbol) is written with `String`.
 * @param data - Data to stringify.
 */
export function stringify<T>(data: T): string {
  // JSON.stringify returns undefined, despite its type, for a function or a symbol.
  const json: string | undefined = data === undefined ? 'undefined' : JSON.stringify(data, null, 2);

  return json ?? String(data);
}
