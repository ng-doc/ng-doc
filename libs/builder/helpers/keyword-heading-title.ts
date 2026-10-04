/**
 * A leading emoji (one pictograph with its modifiers and joined parts, or a flag) and the
 * whitespace after it, including the no-break space that keeps a heading's anchor unchanged.
 * `libs/utils/html/plugins/slugger.plugin.ts` matches the same emoji to hide it from assistive
 * technology; keep both patterns in step.
 */
const LEADING_EMOJI: RegExp =
  /^(?:\p{Regional_Indicator}{2}|(?:\p{Emoji_Presentation}|\p{Extended_Pictographic}️)(?:\p{Emoji_Modifier}|️|‍\p{Extended_Pictographic}️?)*)\s*/u;

/**
 * The title of a heading as a keyword shows it: without a decorative leading emoji, which would
 * otherwise appear in link titles and be read aloud. Both engines build heading keywords with it.
 * @param title - The heading text.
 * @returns The text without the leading emoji, or the text unchanged when nothing would remain.
 */
export function keywordHeadingTitle(title: string): string {
  const stripped = title.replace(LEADING_EMOJI, '');

  return stripped ? stripped : title;
}
