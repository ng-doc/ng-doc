/**
 * Resolves custom-property values the way a browser computes them, so the contract can compare the
 * values users actually see: `var()` with fallbacks, `color-mix()` in `srgb` and `oklab`, and alpha
 * compositing for contrast.
 *
 * Only what the NgDoc stylesheets use is supported: hex, `rgb()`/`rgba()` (comma or space syntax),
 * `transparent`, `white` and `black`. Out-of-gamut `oklab` results are clamped to sRGB.
 */

/** Custom-property declarations in cascade order (later entries win). */
export type Scope = Map<string, string>;

/** An sRGB colour with channels in 0..255 and alpha in 0..1. */
export interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

/**
 * Resolves a custom property: substitutes `var()` recursively (a missing name uses its fallback),
 * evaluates `color-mix()` and normalizes every colour to lowercase hex. Returns `undefined` when the
 * value is invalid at computed-value time (a missing name without fallback, or a cycle).
 * @param name - Custom property to resolve.
 * @param scope - Declarations to resolve against.
 */
export function resolveVariable(name: string, scope: Scope): string | undefined {
  return resolveName(name, scope, new Set());
}

/**
 * Resolves a CSS value that may contain `var()` and `color-mix()`, as {@link resolveVariable} does.
 * @param value - CSS value.
 * @param scope - Declarations to resolve against.
 */
export function resolveValue(value: string, scope: Scope): string | undefined {
  const substituted = substituteVars(value, scope, new Set());

  return substituted === undefined ? undefined : normalizeColors(evaluateColorMix(substituted));
}

/**
 * Parses one colour.
 * @param text - A hex colour, `rgb()`/`rgba()`, `transparent`, `white` or `black`.
 */
export function parseColor(text: string): Rgba | undefined {
  const value = text.trim().toLowerCase();

  if (value === 'transparent') {
    return { r: 0, g: 0, b: 0, a: 0 };
  }

  if (value === 'white') {
    return { r: 255, g: 255, b: 255, a: 1 };
  }

  if (value === 'black') {
    return { r: 0, g: 0, b: 0, a: 1 };
  }

  const hex = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/.exec(value);

  if (hex) {
    const digits =
      hex[1].length <= 4
        ? hex[1]
            .split('')
            .map((digit) => digit + digit)
            .join('')
        : hex[1];
    const channel = (index: number): number => parseInt(digits.slice(index, index + 2), 16);

    return {
      r: channel(0),
      g: channel(2),
      b: channel(4),
      a: digits.length === 8 ? channel(6) / 255 : 1,
    };
  }

  const rgb = /^rgba?\((.*)\)$/.exec(value);

  if (rgb) {
    const parts = rgb[1].split(/[\s,/]+/).filter(Boolean);

    if (parts.length < 3 || parts.length > 4) {
      return undefined;
    }

    const number = (part: string, scale: number): number =>
      part.endsWith('%') ? (parseFloat(part) / 100) * scale : parseFloat(part);
    const [r, g, b] = parts.slice(0, 3).map((part) => number(part, 255));
    const a = parts[3] === undefined ? 1 : number(parts[3], 1);

    return [r, g, b, a].some(Number.isNaN) ? undefined : { r, g, b, a };
  }

  return undefined;
}

/**
 * Formats a colour as lowercase hex, with an alpha byte only when it is not opaque.
 * @param color - Colour to format.
 */
export function toHex(color: Rgba): string {
  const byte = (value: number): string =>
    Math.round(Math.min(255, Math.max(0, value)))
      .toString(16)
      .padStart(2, '0');
  const alpha = Math.round(color.a * 255);

  return `#${byte(color.r)}${byte(color.g)}${byte(color.b)}${alpha === 255 ? '' : byte(alpha)}`;
}

/**
 * Paints a translucent colour over an opaque background.
 * @param color - Foreground colour.
 * @param background - Opaque background.
 */
export function composite(color: Rgba, background: Rgba): Rgba {
  const over = (top: number, bottom: number): number => top * color.a + bottom * (1 - color.a);

  return {
    r: over(color.r, background.r),
    g: over(color.g, background.g),
    b: over(color.b, background.b),
    a: 1,
  };
}

/**
 * WCAG 2.x contrast ratio. A translucent foreground is composited over the background first.
 * @param foreground - Text or UI colour.
 * @param background - Opaque background.
 */
export function contrastRatio(foreground: Rgba, background: Rgba): number {
  const luminance = (color: Rgba): number => {
    const [r, g, b] = [color.r, color.g, color.b].map((channel) => {
      const value = channel / 255;

      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });

    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const light = luminance(composite(foreground, background));
  const dark = luminance(background);

  return (Math.max(light, dark) + 0.05) / (Math.min(light, dark) + 0.05);
}

/**
 * Resolves one name, detecting cycles along the expansion path.
 * @param name - Custom property to resolve.
 * @param scope - Declarations to resolve against.
 * @param seen - Names already on the expansion path.
 */
function resolveName(name: string, scope: Scope, seen: Set<string>): string | undefined {
  const raw = scope.get(name);

  if (raw === undefined || seen.has(name)) {
    return undefined;
  }

  const substituted = substituteVars(raw, scope, new Set([...seen, name]));

  return substituted === undefined ? undefined : normalizeColors(evaluateColorMix(substituted));
}

/**
 * Replaces every `var()` in a value, innermost fallbacks included.
 * @param value - CSS value.
 * @param scope - Declarations to resolve against.
 * @param seen - Names already on the expansion path.
 */
function substituteVars(value: string, scope: Scope, seen: Set<string>): string | undefined {
  let result = value;

  for (let start = result.indexOf('var('); start >= 0; start = result.indexOf('var(')) {
    const end = matchingParen(result, start + 3);

    if (end < 0) {
      return undefined;
    }

    const [name, ...fallback] = splitTopLevel(result.slice(start + 4, end), ',');
    const resolved =
      resolveName(name.trim(), scope, seen) ??
      (fallback.length ? substituteVars(fallback.join(',').trim(), scope, seen) : undefined);

    if (resolved === undefined) {
      return undefined;
    }

    result = result.slice(0, start) + resolved + result.slice(end + 1);
  }

  return result;
}

/**
 * Evaluates `color-mix()` from the innermost call outwards.
 * @param value - A value without `var()`.
 */
function evaluateColorMix(value: string): string {
  let result = value;

  for (let start = result.lastIndexOf('color-mix('); start >= 0; ) {
    const end = matchingParen(result, start + 9);
    const mixed = mix(result.slice(start + 10, end));

    result = result.slice(0, start) + (mixed ? toHex(mixed) : 'invalid') + result.slice(end + 1);
    start = result.lastIndexOf('color-mix(');
  }

  return result;
}

/**
 * Mixes two colours per CSS Color 5: premultiplied alpha, percentages normalized to 100%, and a sum
 * below 100% scaling the resulting alpha.
 * @param args - The arguments of `color-mix()`.
 */
function mix(args: string): Rgba | undefined {
  const [method, first, second] = splitTopLevel(args, ',').map((part) => part.trim());
  const space = /^in\s+(srgb|oklab)$/.exec(method ?? '')?.[1];
  const parse = (part: string | undefined): { color?: Rgba; weight?: number } => {
    const match = /^(.*?)(?:\s+([\d.]+)%)?$/.exec(part ?? '');

    return {
      color: match ? parseColor(match[1]) : undefined,
      weight: match?.[2] === undefined ? undefined : Number(match[2]) / 100,
    };
  };
  const a = parse(first);
  const b = parse(second);

  if (!space || !a.color || !b.color) {
    return undefined;
  }

  let wa = a.weight ?? (b.weight === undefined ? 0.5 : 1 - b.weight);
  let wb = b.weight ?? 1 - wa;
  const sum = wa + wb;

  if (sum <= 0) {
    return undefined;
  }

  wa /= sum;
  wb /= sum;

  const toSpace = space === 'oklab' ? rgbToOklab : rgbToUnit;
  const fromSpace = space === 'oklab' ? oklabToRgb : unitToRgb;
  const alphaA = a.color.a;
  const alphaB = b.color.a;
  const ca = toSpace(a.color);
  const cb = toSpace(b.color);
  const alpha = alphaA * wa + alphaB * wb;
  const channels = [0, 1, 2].map((index) =>
    alpha === 0 ? 0 : (ca[index] * alphaA * wa + cb[index] * alphaB * wb) / alpha,
  ) as [number, number, number];

  return { ...fromSpace(channels), a: alpha * Math.min(1, sum) };
}

/**
 * Rewrites every colour literal as lowercase hex, so equal colours compare equal.
 * @param value - A value without `var()` or `color-mix()`.
 */
function normalizeColors(value: string): string {
  return value
    .replace(/rgba?\([^()]*\)/gi, (match) => {
      const color = parseColor(match);

      return color ? toHex(color) : match;
    })
    .replace(/#[0-9a-fA-F]{3,8}\b/g, (match) => {
      const color = parseColor(match);

      return color ? toHex(color) : match;
    });
}

/**
 * sRGB channels in 0..1.
 * @param color - Colour to convert.
 */
function rgbToUnit(color: Rgba): [number, number, number] {
  return [color.r / 255, color.g / 255, color.b / 255];
}

/**
 * The inverse of {@link rgbToUnit}.
 * @param channels - sRGB channels in 0..1.
 */
function unitToRgb(channels: [number, number, number]): Omit<Rgba, 'a'> {
  const [r, g, b] = channels;

  return { r: r * 255, g: g * 255, b: b * 255 };
}

/**
 * Converts sRGB to OKLab.
 * @param color - Colour to convert.
 */
function rgbToOklab(color: Rgba): [number, number, number] {
  const [r, g, b] = rgbToUnit(color).map((value) =>
    value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4,
  );
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);

  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

/**
 * Converts OKLab to sRGB, clamping out-of-gamut channels.
 * @param channels - OKLab L, a and b.
 */
function oklabToRgb(channels: [number, number, number]): Omit<Rgba, 'a'> {
  const [lightness, a, b] = channels;
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const encode = (value: number): number => {
    const clamped = Math.min(1, Math.max(0, value));

    return clamped <= 0.0031308 ? 12.92 * clamped : 1.055 * clamped ** (1 / 2.4) - 0.055;
  };

  return unitToRgb([
    encode(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    encode(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    encode(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ]);
}

/**
 * Index of the parenthesis that closes the one at `open`, or -1.
 * @param text - Text to scan.
 * @param open - Index of an opening parenthesis.
 */
function matchingParen(text: string, open: number): number {
  let depth = 0;

  for (let index = open; index < text.length; index++) {
    if (text[index] === '(') {
      depth++;
    } else if (text[index] === ')' && --depth === 0) {
      return index;
    }
  }

  return -1;
}

/**
 * Splits at a separator that is not nested in parentheses.
 * @param text - Text to split.
 * @param separator - One-character separator.
 */
function splitTopLevel(text: string, separator: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';

  for (const character of text) {
    depth += character === '(' ? 1 : character === ')' ? -1 : 0;

    if (character === separator && depth === 0) {
      parts.push(current);
      current = '';
    } else {
      current += character;
    }
  }

  return [...parts, current];
}
