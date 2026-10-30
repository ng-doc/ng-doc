/**
 * The URL segment of each target of a playground on its isolated pages: the selector (or the pipe
 * name) in lower case, every run of characters other than letters and digits replaced by `-`,
 * trimmed of `-` (`button[ngDocButton]` → `button-ngdocbutton`). A target whose segment would be
 * empty is `target`. Two targets with the same segment get `-2`, `-3`, … in the order given, so
 * the builder, which writes the routes, and the page, which builds the frame's URL, agree as long
 * as both pass the targets in the same order.
 * @param targets - The selectors of the playground, or its pipe name.
 * @internal
 */
export function ɵplaygroundTargetSlugs(targets: readonly string[]): string[] {
  const seen = new Map<string, number>();

  return targets.map((target) => {
    const base =
      target
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'target';
    const count = (seen.get(base) ?? 0) + 1;

    seen.set(base, count);
    return count === 1 ? base : `${base}-${count}`;
  });
}
