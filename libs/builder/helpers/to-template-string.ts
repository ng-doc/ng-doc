/**
 * Escapes text for the body of a template literal, so the literal evaluates to the text itself.
 *
 * The backslash is escaped first: otherwise `\d` would evaluate to `d`, `\n` to a line break and
 * `\203A` would fail to compile (octal escapes are not allowed in template literals), and the
 * escapes added for `` ` `` and `${` must not be escaped again.
 * @param content - The text to embed.
 */
export function toTemplateString(content: string): string {
  return (
    content
      ?.replace(/\\/g, '\\\\')
      .replace(/`/g, '\\`')
      .replace(/\${/g, '\\${')
      .replace(/{/g, '\\{')
      .replace(/}/g, '\\}') ?? ''
  );
}
