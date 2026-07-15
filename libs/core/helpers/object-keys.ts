/**
 *
 * @param object
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export function objectKeys<T extends {}, K extends keyof T>(object: T): K[] {
  return Object.keys(object) as K[];
}
