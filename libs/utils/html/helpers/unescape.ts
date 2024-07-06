
/**
 * `rehype-stringify` escapes HTML symbols, so we need to unescape them back.
 * @param value
 */
export function unescape(value: string): string {
  return value
    .replace(/&#x26;#x26;/g, '&#x26;')
    .replace(/&#x26;#38;/g, '&#38;')
    .replace(/&#x26;#123;/g, '&#123;')
    .replace(/&#x26;#125;/g, '&#125;')
    .replace(/&#x26;#64;/g, '&#64;')
}
