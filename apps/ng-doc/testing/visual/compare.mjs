/**
 * Pixel comparison of two PNG screenshots, done in a blank browser page with canvas so the harness
 * needs no image library. Images of different heights are compared over their common rows; the
 * rows only one image has count as different in the full-page metric.
 *
 * Per-pixel difference follows the YIQ colour distance used by pixelmatch: a pixel differs when
 * its distance exceeds `threshold` (0..1) of the maximum distance.
 */

/**
 * Compares two PNG screenshots.
 * @param {import('@playwright/test').Page} page - A blank page used as the canvas host.
 * @param {Buffer} actual - The implemented page's screenshot.
 * @param {Buffer} reference - The reference screenshot.
 * @param {{threshold?: number, foldHeight?: number, diffMaxHeight?: number}} [options] - Options.
 * @returns {Promise<{actualSize: number[], referenceSize: number[], foldRatio: number,
 *   fullRatio: number, diff: Buffer}>} Mismatch ratios (0..1) and a diff image.
 */
export async function compareImages(page, actual, reference, options = {}) {
  const result = await page.evaluate(
    async ({ actualUrl, referenceUrl, threshold, foldHeight, diffMaxHeight }) => {
      const load = (url) =>
        new Promise((resolve, reject) => {
          const image = new Image();

          image.onload = () => resolve(image);
          image.onerror = () => reject(new Error('Cannot decode screenshot'));
          image.src = url;
        });
      const pixels = (image, width, height) => {
        const canvas = document.createElement('canvas');

        canvas.width = width;
        canvas.height = height;

        const context = canvas.getContext('2d', { willReadFrequently: true });

        context.drawImage(image, 0, 0);

        return context.getImageData(0, 0, width, height).data;
      };
      const [a, r] = await Promise.all([load(actualUrl), load(referenceUrl)]);
      const width = Math.min(a.naturalWidth, r.naturalWidth);
      const height = Math.min(a.naturalHeight, r.naturalHeight);
      const actualPixels = pixels(a, width, height);
      const referencePixels = pixels(r, width, height);
      const maxDelta = 35215 * threshold * threshold;
      const fold = Math.min(foldHeight, height);
      const diffHeight = Math.min(diffMaxHeight, height);
      const diffCanvas = document.createElement('canvas');

      diffCanvas.width = width;
      diffCanvas.height = diffHeight;

      const diffContext = diffCanvas.getContext('2d');
      const diffImage = diffContext.createImageData(width, diffHeight);
      const yiq = (r1, g1, b1) => [
        r1 * 0.29889531 + g1 * 0.58662247 + b1 * 0.11448223,
        r1 * 0.59597799 - g1 * 0.2741761 - b1 * 0.32180189,
        r1 * 0.21147017 - g1 * 0.52261711 + b1 * 0.31114694,
      ];
      let different = 0;
      let foldDifferent = 0;

      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const i = (y * width + x) * 4;
          const [y1, i1, q1] = yiq(actualPixels[i], actualPixels[i + 1], actualPixels[i + 2]);
          const [y2, i2, q2] = yiq(
            referencePixels[i],
            referencePixels[i + 1],
            referencePixels[i + 2],
          );
          const delta = 0.5053 * (y1 - y2) ** 2 + 0.299 * (i1 - i2) ** 2 + 0.1957 * (q1 - q2) ** 2;
          const differs = delta > maxDelta;

          if (differs) {
            different++;

            if (y < fold) {
              foldDifferent++;
            }
          }

          if (y < diffHeight) {
            // Faded actual image, with differing pixels in red.
            const grey = 255 - (255 - y1) * 0.25;

            diffImage.data[i] = differs ? 230 : grey;
            diffImage.data[i + 1] = differs ? 40 : grey;
            diffImage.data[i + 2] = differs ? 60 : grey;
            diffImage.data[i + 3] = 255;
          }
        }
      }

      diffContext.putImageData(diffImage, 0, 0);

      const fullWidth = Math.max(a.naturalWidth, r.naturalWidth);
      const fullHeight = Math.max(a.naturalHeight, r.naturalHeight);
      const overlap = width * height;
      const unmatched = fullWidth * fullHeight - overlap;

      return {
        actualSize: [a.naturalWidth, a.naturalHeight],
        referenceSize: [r.naturalWidth, r.naturalHeight],
        foldRatio: foldDifferent / (width * fold),
        fullRatio: (different + unmatched) / (fullWidth * fullHeight),
        diffUrl: diffCanvas.toDataURL('image/png'),
      };
    },
    {
      actualUrl: `data:image/png;base64,${actual.toString('base64')}`,
      referenceUrl: `data:image/png;base64,${reference.toString('base64')}`,
      threshold: options.threshold ?? 0.1,
      foldHeight: options.foldHeight ?? 900,
      diffMaxHeight: options.diffMaxHeight ?? 2400,
    },
  );

  return {
    actualSize: result.actualSize,
    referenceSize: result.referenceSize,
    foldRatio: result.foldRatio,
    fullRatio: result.fullRatio,
    diff: Buffer.from(result.diffUrl.replace(/^data:image\/png;base64,/, ''), 'base64'),
  };
}
