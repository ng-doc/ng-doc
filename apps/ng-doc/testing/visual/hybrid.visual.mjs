import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test } from '@playwright/test';

import { cases, VIEWPORT_HEIGHT } from './cases.mjs';
import { compareImages } from './compare.mjs';

const FIXTURES = process.env.NGDOC_VISUAL_FIXTURES;
const OUT = process.env.NGDOC_VISUAL_OUT;
const TOLERANCE = Number(process.env.NGDOC_VISUAL_TOLERANCE ?? '0.02');
const STRICT = process.env.NGDOC_VISUAL_STRICT === '1';

// Screenshots must not depend on timing: no transitions, animations or caret blink.
const FREEZE_CSS = `*, *::before, *::after {
  transition: none !important;
  animation: none !important;
  caret-color: transparent !important;
}
html { scroll-behavior: auto !important; }`;

for (const visualCase of cases()) {
  test(visualCase.name, async ({ page, browser }, testInfo) => {
    const referencePath = join(FIXTURES, visualCase.reference);

    test.skip(!existsSync(referencePath), `no reference screenshot at ${referencePath}`);

    const reference = readFileSync(referencePath);
    const referenceHeight = reference.readUInt32BE(20);

    await page.setViewportSize({ width: visualCase.width, height: VIEWPORT_HEIGHT });
    await page.emulateMedia({ colorScheme: visualCase.theme, reducedMotion: 'reduce' });
    await page.addInitScript((theme) => {
      try {
        localStorage.setItem('ng-doc-theme-id', theme === 'dark' ? 'dark' : '');
      } catch {
        // Storage may be unavailable; the attribute below still selects the theme.
      }
    }, visualCase.theme);
    await page.goto(visualCase.route, { waitUntil: 'load' });
    await page.locator(visualCase.ready).first().waitFor({ state: 'visible', timeout: 60_000 });
    await page.evaluate((theme) => {
      if (theme === 'dark') {
        document.documentElement.setAttribute('data-theme', 'dark');
      } else {
        document.documentElement.removeAttribute('data-theme');
      }
    }, visualCase.theme);
    await page.addStyleTag({ content: FREEZE_CSS });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(500);

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    let actual;

    if (visualCase.kind === 'page') {
      actual = await page.screenshot({ fullPage: referenceHeight > VIEWPORT_HEIGHT });
    } else {
      const element = page.locator(visualCase.selector).first();

      await element.scrollIntoViewIfNeeded();
      actual = await element.screenshot();
    }

    const canvasPage = await browser.newPage();
    const comparison = await compareImages(canvasPage, actual, reference, {
      foldHeight: VIEWPORT_HEIGHT,
    });

    await canvasPage.close();

    const result = {
      name: visualCase.name,
      kind: visualCase.kind,
      route: visualCase.route,
      width: visualCase.width,
      theme: visualCase.theme,
      reference: visualCase.reference,
      actualSize: comparison.actualSize,
      referenceSize: comparison.referenceSize,
      foldRatio: comparison.foldRatio,
      fullRatio: comparison.fullRatio,
      horizontalOverflow: overflow,
      tolerance: TOLERANCE,
      withinTolerance: comparison.foldRatio <= TOLERANCE,
    };

    if (OUT) {
      const directory = join(OUT, 'results', visualCase.name);

      mkdirSync(directory, { recursive: true });
      writeFileSync(join(directory, 'actual.png'), actual);
      writeFileSync(join(directory, 'diff.png'), comparison.diff);
      writeFileSync(join(directory, 'result.json'), JSON.stringify(result, null, 2));
    }

    await testInfo.attach('actual', { body: actual, contentType: 'image/png' });
    await testInfo.attach('diff', { body: comparison.diff, contentType: 'image/png' });
    testInfo.annotations.push({
      type: 'mismatch',
      description: `fold ${(result.foldRatio * 100).toFixed(1)}%, full ${(result.fullRatio * 100).toFixed(1)}%`,
    });

    if (STRICT) {
      expect(
        result.foldRatio,
        `${visualCase.name} differs from ${visualCase.reference}`,
      ).toBeLessThanOrEqual(TOLERANCE);
    }
  });
}
