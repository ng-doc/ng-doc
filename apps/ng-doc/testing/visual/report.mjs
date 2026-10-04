import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * Global teardown: collects every `results/<case>/result.json` of the run into `report.json`,
 * a Markdown summary (`report.md`) and a side-by-side HTML page (`index.html`).
 */
export default function writeReport() {
  const out = process.env.NGDOC_VISUAL_OUT;
  const resultsDirectory = out && join(out, 'results');

  if (!resultsDirectory || !existsSync(resultsDirectory)) {
    return;
  }

  const fixtures = process.env.NGDOC_VISUAL_FIXTURES;
  const results = readdirSync(resultsDirectory)
    .filter((name) => existsSync(join(resultsDirectory, name, 'result.json')))
    .map((name) => JSON.parse(readFileSync(join(resultsDirectory, name, 'result.json'), 'utf8')))
    .sort((a, b) => a.name.localeCompare(b.name, 'en', { numeric: true }));
  const percent = (value) => `${(value * 100).toFixed(1)}%`;
  const within = results.filter((result) => result.withinTolerance).length;
  const summary = {
    baseUrl: process.env.NGDOC_VISUAL_BASE_URL,
    tolerance: results[0]?.tolerance,
    cases: results.length,
    withinTolerance: within,
    overflowing: results.filter((result) => result.horizontalOverflow > 0).map((r) => r.name),
    results,
  };

  writeFileSync(join(out, 'report.json'), JSON.stringify(summary, null, 2));

  const rows = results.map(
    (result) =>
      `| ${result.name} | ${result.route} | ${percent(result.foldRatio)} | ${percent(result.fullRatio)} | ` +
      `${result.actualSize.join('×')} | ${result.referenceSize.join('×')} | ` +
      `${result.horizontalOverflow > 0 ? `${result.horizontalOverflow}px` : 'none'} | ` +
      `${result.withinTolerance ? 'yes' : 'no'} |`,
  );

  writeFileSync(
    join(out, 'report.md'),
    [
      '# Visual comparison with the Hybrid prototypes',
      '',
      `Base URL: ${summary.baseUrl}. Tolerance: ${percent(summary.tolerance ?? 0)} of the fold ` +
        `(first 900 rows). Within tolerance: ${within} of ${results.length}.`,
      '',
      '"Fold" is the share of differing pixels in the first 900 rows; "full" also counts the rows',
      'only one image has. Pixels differ when their YIQ distance exceeds 10% of the maximum.',
      '',
      '| Case | Route | Fold | Full | Actual | Reference | Horizontal overflow | Within tolerance |',
      '|---|---|---:|---:|---|---|---|---|',
      ...rows,
      '',
    ].join('\n'),
  );

  const cards = results
    .map((result) => {
      const reference = fixtures
        ? relative(out, join(fixtures, result.reference)).split('\\').join('/')
        : result.reference;

      return `<section>
  <h2>${result.name} <small>fold ${percent(result.foldRatio)} · full ${percent(result.fullRatio)}</small></h2>
  <div class="grid">
    <figure><figcaption>Reference</figcaption><img loading="lazy" src="${reference}"></figure>
    <figure><figcaption>Implemented (${result.route})</figcaption><img loading="lazy" src="results/${result.name}/actual.png"></figure>
    <figure><figcaption>Diff</figcaption><img loading="lazy" src="results/${result.name}/diff.png"></figure>
  </div>
</section>`;
    })
    .join('\n');

  writeFileSync(
    join(out, 'index.html'),
    `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Visual comparison</title>
<style>
  body { margin: 24px; font: 14px/1.5 system-ui, sans-serif; }
  .grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; align-items: start; }
  figure { margin: 0; } img { width: 100%; border: 1px solid #ccc; }
  small { font-weight: 400; color: #666; }
</style>
</head>
<body>
<h1>Visual comparison with the Hybrid prototypes</h1>
<p>Within tolerance: ${within} of ${results.length}.</p>
${cards}
</body>
</html>
`,
  );
}
