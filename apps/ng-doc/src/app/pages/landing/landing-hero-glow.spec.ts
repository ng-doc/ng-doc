/**
 * @vitest-environment node
 */
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import postcss, { AtRule, Declaration, Rule } from 'postcss';
import * as sass from 'sass';
import { describe, expect, it } from 'vitest';

/**
 * The hero glow is a pure CSS animation. jsdom runs no animations, so these checks read the
 * compiled stylesheet: the loops stay on compositor-only properties, start from the resting
 * gradient (the server-rendered frame), stop for reduced motion and stay clipped by the hero.
 */

/**
 * The workspace root: the nearest folder with `nx.json` at or above the working directory. The spec
 * is bundled before it runs, so its own location does not lead back to the sources.
 * @returns The workspace root.
 */
function workspaceRoot(): string {
  let folder = process.cwd();

  while (!existsSync(join(folder, 'nx.json'))) {
    if (dirname(folder) === folder) throw new Error(`No nx.json above ${process.cwd()}`);
    folder = dirname(folder);
  }

  return folder;
}

const STYLESHEET = join(
  workspaceRoot(),
  'apps/ng-doc/src/app/pages/landing/landing.component.scss',
);
const LAYERS = ['ng-doc-landing .hero::before', 'ng-doc-landing .hero::after'];

const root = postcss.parse(sass.compile(STYLESHEET, { logger: sass.Logger.silent }).css);

/**
 * The declarations of the rules whose selector list contains the selector.
 * @param selector - The selector to look for.
 * @param inReducedMotion - Whether to read the rules inside `prefers-reduced-motion: reduce`.
 * @returns The declarations, by property.
 */
function declarationsOf(selector: string, inReducedMotion: boolean = false): Map<string, string> {
  const declarations = new Map<string, string>();

  root.walkRules((rule: Rule) => {
    const media = rule.parent?.type === 'atrule' ? (rule.parent as AtRule) : undefined;
    const reduced =
      media?.name === 'media' && /prefers-reduced-motion:\s*reduce/.test(media.params);

    if (reduced === inReducedMotion && rule.selectors.includes(selector)) {
      rule.walkDecls((decl: Declaration) => void declarations.set(decl.prop, decl.value));
    }
  });

  return declarations;
}

const keyframes = new Map<string, AtRule>();

root.walkAtRules('keyframes', (rule) => {
  if (rule.params.startsWith('ng-doc-hero-glow-')) {
    keyframes.set(rule.params, rule);
  }
});

describe('Landing hero glow', () => {
  it('animates every layer with a hero glow loop', () => {
    const names = LAYERS.map((layer) => {
      const declarations = declarationsOf(layer);

      return declarations.get('animation-name') ?? declarations.get('animation')?.split(' ')[0];
    });

    expect(new Set(names).size).toBe(LAYERS.length);
    names.forEach((name) => expect(keyframes.has(name!)).toBe(true));
  });

  it('animates only transform and opacity, so nothing is repainted per frame', () => {
    expect(keyframes.size).toBeGreaterThan(0);

    keyframes.forEach((rule) =>
      rule.walkDecls((decl) => expect(['transform', 'opacity']).toContain(decl.prop)),
    );
  });

  it('starts every loop from the resting gradient', () => {
    keyframes.forEach((rule) =>
      rule.walkRules((frame) =>
        frame.selectors.forEach((offset) => expect(['from', '0%']).not.toContain(offset)),
      ),
    );
  });

  it('shows the static gradient for reduced motion', () => {
    LAYERS.forEach((layer) => expect(declarationsOf(layer, true).get('animation')).toBe('none'));
  });

  it('clips the drifting layers to the hero', () => {
    expect(declarationsOf('ng-doc-landing .hero').get('overflow')).toBe('hidden');
  });
});
