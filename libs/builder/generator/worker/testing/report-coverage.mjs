import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { createCoverageMap } = require('istanbul-lib-coverage');
const { createContext } = require('istanbul-lib-report');
const reports = require('istanbul-reports');
// The worker group's evidence directory: coverage/ and entry-coverage/ in, combined-coverage/ out.
// NGDOC_TEST_EVIDENCE_DIR (the modernization runner's <log-dir>/worker), else the git-ignored
// coverage/builder-generator/worker-report. It never reads or writes tracked docs/ evidence.
const evidence = path.resolve(
  process.env.NGDOC_TEST_EVIDENCE_DIR ??
    path.resolve(import.meta.dirname, '../../../../../coverage/builder-generator/worker-report'),
);
const coverage = createCoverageMap({});
for (const directory of ['coverage', 'entry-coverage']) {
  coverage.merge(
    JSON.parse(await readFile(path.join(evidence, directory, 'coverage-final.json'), 'utf8')),
  );
}
const context = createContext({
  dir: path.join(evidence, 'combined-coverage'),
  coverageMap: coverage,
});
for (const reporter of ['json', 'json-summary', 'text']) reports.create(reporter).execute(context);
const summary = coverage.getCoverageSummary().toJSON();
for (const [metric, minimum] of Object.entries({
  lines: 90,
  statements: 90,
  functions: 90,
  branches: 85,
})) {
  if (summary[metric].pct < minimum) throw new Error(`${metric} coverage below ${minimum}%`);
}
