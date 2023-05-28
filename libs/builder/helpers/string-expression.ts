/**
 * Runs string expression and return result
 *
 * @param {string} expression - expression to run
 * @returns {T} result of expression
 * @template T
 */
export function stringExpression<T>(expression: string): T {
  return new Function('return ' + expression)();
}
