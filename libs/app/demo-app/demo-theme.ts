/** The fragment parameter that sets the theme of a demo page; an input name never starts with `~`. */
const THEME = '~theme';

/**
 * The theme that the URL fragment of a demo page sets, or `undefined` when it sets none and the
 * page follows the theme of the site.
 * @param fragment - The fragment, with or without the leading `#`.
 * @internal
 */
export function ɵdemoThemeFromFragment(fragment: string): string | undefined {
  for (const parameter of fragment.replace(/^#/, '').split('&')) {
    if (!parameter.startsWith(`${THEME}=`)) continue;
    try {
      return decodeURIComponent(parameter.slice(THEME.length + 1)) || undefined;
    } catch {
      return undefined;
    }
  }
  return undefined;
}

/**
 * A fragment (without `#`) with the theme parameter set, after the other parameters, or without it
 * when there is no theme. `undefined` when nothing is left.
 * @param fragment - The fragment without the theme, or none.
 * @param theme - The theme of the demo page, or none to follow the site.
 * @internal
 */
export function ɵwithDemoTheme(
  fragment: string | undefined,
  theme: string | undefined,
): string | undefined {
  const parameters = (fragment ?? '')
    .split('&')
    .filter((parameter) => parameter && !parameter.startsWith(`${THEME}=`));

  if (theme) parameters.push(`${THEME}=${encodeURIComponent(theme)}`);
  return parameters.length ? parameters.join('&') : undefined;
}

/**
 * Whether a parameter of a fragment is the theme of the demo page, which the state of a
 * playground leaves to the demo application.
 * @param name - The decoded name of the parameter.
 * @internal
 */
export function ɵisDemoThemeParameter(name: string): boolean {
  return name === THEME;
}
