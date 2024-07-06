/**
 *
 * @param value
 */
export function escapeAngular(value: string): string {
  return value
    .replace(/{/g, '&#123;')
    .replace(/}/g, '&#125;')
    .replace(/@/g, '&#64;')
}
