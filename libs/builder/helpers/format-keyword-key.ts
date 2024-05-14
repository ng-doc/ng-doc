/**
 *
 * @param name
 */
export function formatKeywordKey(name: string): string {
  return name
    .split('#')
    .map((part: string, index: number) => (index === 1 ? part.toLowerCase() : part))
    .join('#');
}
