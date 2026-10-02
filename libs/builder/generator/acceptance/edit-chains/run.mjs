import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  absent,
  assertComplete,
  fileState,
  provenance,
  startProject,
  success,
  waitAfter,
} from '../native/support.mjs';

const evidence = path.resolve(
  process.env.NGDOC_EDIT_CHAIN_EVIDENCE ??
    fileURLToPath(new URL('../../../../../tmp/acceptance/edit-chains', import.meta.url)),
);
const root = await mkdtemp(path.join(os.tmpdir(), 'ng-doc-edit-chains-'));
const workspace = path.join(root, 'edit-chains.project');
const docs = path.join(workspace, 'docs');
const primary = path.join(docs, 'primary');
const secondary = path.join(docs, 'secondary');
const target = path.join(primary, 'target');
const consumer = path.join(primary, 'consumer');
const secondaryGuide = path.join(secondary, 'guide');
const paths = {
  workspace,
  projectId: 'edit-chains',
  docs,
  config: path.join(workspace, 'ng-doc.config.mjs'),
  configValues: path.join(workspace, 'config-values.mjs'),
  tsconfig: path.join(workspace, 'tsconfig.json'),
  output: path.join(workspace, 'generated'),
  cache: path.join(workspace, '.cache'),
  header: path.join(docs, 'header.html.nunj'),
  primaryCategory: path.join(primary, 'ng-doc.category.ts'),
  secondaryCategory: path.join(secondary, 'ng-doc.category.ts'),
  targetPage: path.join(target, 'ng-doc.page.ts'),
  targetMarkdown: path.join(target, 'index.md'),
  consumerPage: path.join(consumer, 'ng-doc.page.ts'),
  consumerMarkdown: path.join(consumer, 'index.md'),
  secondaryPage: path.join(secondaryGuide, 'ng-doc.page.ts'),
  secondaryMarkdown: path.join(secondaryGuide, 'index.md'),
};
const trace = [];
const summary = {
  status: 'failure',
  node: process.version,
  pid: process.pid,
  root,
  startedAt: new Date().toISOString(),
  provenance: await provenance(),
  checks: {},
};
if (process.env.NGDOC_EXPECTED_SOURCE_DIGEST) {
  assert.equal(
    summary.provenance.sourceDigest,
    process.env.NGDOC_EXPECTED_SOURCE_DIGEST,
    'Edit-chain runtime does not match NGDOC_EXPECTED_SOURCE_DIGEST',
  );
}

let handle;
let error;

try {
  await fixture();
  handle = await startProject(paths, trace, { resultHistoryLimit: 4 });
  let current = success(handle.reconciled);

  let products = await productsFor(current);
  assertInitial(products);
  summary.checks.initialProducts = productSummary(products);

  const categoryPending = waitAfter(
    handle,
    current.generation,
    (result) =>
      result.status === 'success' &&
      result.snapshot.artifacts
        .flatMap((artifact) => artifact.searchRecords)
        .some(
          (record) =>
            record.route === 'primary-new/target' && record.breadcrumbs[0] === 'Primary V2',
        ),
    trace,
    'category-title-order-route',
  );
  await writeCategory(paths.primaryCategory, 'Primary V2', 'primary-new', 0);
  current = success(await categoryPending);
  products = await productsFor(current);
  assertCategoryEdit(products);
  summary.checks.categoryTitleOrderRoute = productSummary(products);

  const renamePending = waitAfter(
    handle,
    current.generation,
    (result) =>
      result.status === 'success' &&
      hasSearchFragment(result, 'new-anchor') &&
      guideHtml(result, '/consumer').includes('primary-new/target#new-anchor'),
    trace,
    'anchor-renamed',
  );
  await Promise.all([
    writeTarget('# New Anchor\n\nTarget body after rename.'),
    writeConsumer('*TargetPage#New-Anchor', 'external'),
  ]);
  current = success(await renamePending);
  products = await productsFor(current);
  assertAnchorState(products, 'new-anchor', ['old-anchor']);
  summary.checks.anchorRenamed = productSummary(products);

  const beforeDanglingAnchor = await fileState(products.outputRoot);
  const danglingPending = waitAfter(
    handle,
    current.generation,
    (result) => result.status === 'failure',
    trace,
    'dangling-anchor-rejected',
  );
  await writeTarget('# Unrelated Section\n\nThe linked anchor was deleted.');
  const dangling = await danglingPending;
  assert.equal(dangling.status, 'failure');
  assert.equal(dangling.lastGoodRevision, current.snapshot.revision);
  assert(
    dangling.diagnostics.some(
      (diagnostic) =>
        diagnostic.code === 'CONTENT_LINK' &&
        diagnostic.severity === 'error' &&
        diagnostic.message.includes('*TargetPage#New-Anchor'),
    ),
  );
  assert.deepEqual(await fileState(products.outputRoot), beforeDanglingAnchor);
  summary.checks.danglingAnchorRejected = {
    code: 'CONTENT_LINK',
    lastGoodRevision: dangling.lastGoodRevision,
    outputTreeUnchanged: true,
  };

  const deletePending = waitAfter(
    handle,
    dangling.generation,
    (result) =>
      result.status === 'success' &&
      !hasSearchFragment(result, 'new-anchor') &&
      !guideHtml(result, '/consumer').includes('/target#'),
    trace,
    'anchor-deleted',
  );
  await writeConsumerWithoutTarget('external');
  current = success(await deletePending);
  products = await productsFor(current);
  assert.equal(hasFragment(products.search, 'new-anchor'), false);
  assert.equal(hasFragment(products.search, 'unrelated-section'), true);
  assert.doesNotMatch(products.consumerHtml, /href="[^"]*\/target#/);
  assert.doesNotMatch(products.consumerHtml, /\*TargetPage#New-Anchor/);
  assert.doesNotMatch(products.keywordsText, /\*TargetPage#new-anchor/);
  assert.doesNotMatch(products.physicalText, /href="[^"]*\/target#new-anchor"/);
  summary.checks.anchorDeleted = productSummary(products);

  const recreatePending = waitAfter(
    handle,
    current.generation,
    (result) =>
      result.status === 'success' &&
      hasSearchFragment(result, 'new-anchor') &&
      guideHtml(result, '/consumer').includes('primary-new/target#new-anchor'),
    trace,
    'anchor-recreated',
  );
  await Promise.all([
    writeTarget('# New Anchor\n\nTarget body after recreation.'),
    writeConsumer('*TargetPage#New-Anchor', 'external'),
  ]);
  current = success(await recreatePending);
  products = await productsFor(current);
  assertAnchorState(products, 'new-anchor', ['old-anchor']);
  summary.checks.anchorRecreated = productSummary(products);

  const headerPending = waitAfter(
    handle,
    current.generation,
    (result) => result.status === 'success' && guideHtml(result, '/target').includes('Header V2'),
    trace,
    'header-edited',
  );
  await writeHeader('v2', 'Header V2');
  current = success(await headerPending);
  products = await productsFor(current);
  assert.match(products.targetHtml, /Header V2/);
  assert.match(products.physicalText, /Header V2/);
  assert.doesNotMatch(products.physicalText, /Header V1/);
  assert(products.search.some((record) => record.content.includes('Header V2')));
  assert.equal(
    products.search.some((record) => record.content.includes('Header V1')),
    false,
  );
  summary.checks.headerEdit = productSummary(products);

  const configImportPending = waitAfter(
    handle,
    current.generation,
    (result) =>
      result.status === 'success' &&
      guideHtml(result, '/consumer').includes('https://two.example/reference'),
    trace,
    'imported-config-edited',
  );
  await writeConfigValues('https://two.example/reference');
  current = success(await configImportPending);
  products = await productsFor(current);
  assert.match(products.consumerHtml, /href="https:\/\/two\.example\/reference"/);
  assert.match(products.physicalText, /href="https:\/\/two\.example\/reference"/);
  assert.match(products.keywordsText, /https:\/\/two\.example\/reference/);
  assert.doesNotMatch(products.physicalText, /https:\/\/one\.example\/reference/);
  assert.doesNotMatch(products.keywordsText, /https:\/\/one\.example\/reference/);
  summary.checks.importedConfigEdit = productSummary(products);

  const beforeRestartRequired = await fileState(products.outputRoot);
  const failurePending = waitAfter(
    handle,
    current.generation,
    (result) =>
      result.status === 'failure' &&
      result.diagnostics.some((diagnostic) => diagnostic.code === 'BOOTSTRAP_RESTART_REQUIRED'),
    trace,
    'root-change-restart-required',
  );
  await writeConfigValues('https://two.example/reference', 'moved-output');
  const failed = await failurePending;
  assert.equal(failed.status, 'failure');
  assert.equal(failed.lastGoodRevision, current.snapshot.revision);
  assert(
    failed.diagnostics.some(
      (diagnostic) =>
        diagnostic.code === 'BOOTSTRAP_RESTART_REQUIRED' &&
        diagnostic.severity === 'error' &&
        diagnostic.message.includes('outputRoot'),
    ),
  );
  assert.deepEqual(await fileState(products.outputRoot), beforeRestartRequired);
  const rejectedRoot = path.join(workspace, 'moved-output', 'ng-doc', paths.projectId);
  assert.equal(await absent(rejectedRoot), true);
  summary.checks.rootChangeRestartRequired = {
    code: 'BOOTSTRAP_RESTART_REQUIRED',
    lastGoodRevision: failed.lastGoodRevision,
    outputTreeUnchanged: true,
    rejectedRootAbsent: true,
  };

  const recoveryPending = waitAfter(
    handle,
    failed.generation,
    (result) =>
      result.status === 'success' &&
      result.snapshot.configuration.outputRoot === products.outputRoot &&
      guideHtml(result, '/consumer').includes('https://two.example/reference'),
    trace,
    'root-change-reverted',
  );
  await writeConfigValues('https://two.example/reference');
  current = success(await recoveryPending);
  products = await productsFor(current);
  assertAnchorState(products, 'new-anchor', ['old-anchor']);
  assert.match(products.physicalText, /Header V2/);
  summary.checks.rootChangeRecovery = productSummary(products);

  summary.status = 'passed';
  summary.final = {
    generation: current.generation,
    revision: current.snapshot.revision,
    manifestFiles: current.manifest.files.length,
    observer: handle.observer.state(),
  };
} catch (caught) {
  error = caught;
  summary.error =
    caught instanceof Error ? { message: caught.message, stack: caught.stack } : caught;
  process.exitCode = 1;
} finally {
  if (handle) {
    try {
      await handle.stop();
      summary.cleanup = { status: 'fulfilled' };
    } catch (cleanupError) {
      summary.cleanup = { status: 'rejected', reason: String(cleanupError) };
      error ??= cleanupError;
      process.exitCode = 1;
    }
  }
  summary.finishedAt = new Date().toISOString();
  summary.durationMs = Date.parse(summary.finishedAt) - Date.parse(summary.startedAt);
  await mkdir(evidence, { recursive: true });
  await Promise.all([
    writeFile(path.join(evidence, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`),
    writeFile(path.join(evidence, 'trace.json'), `${JSON.stringify(trace, null, 2)}\n`),
    writeFile(path.join(evidence, 'fixture-path.txt'), `${root}\n`),
  ]);
}

if (error) throw error;
console.log(
  JSON.stringify({
    status: summary.status,
    sourceDigest: summary.provenance.sourceDigest,
    checks: Object.keys(summary.checks),
    final: summary.final,
    cleanup: summary.cleanup,
    durationMs: summary.durationMs,
  }),
);

async function fixture() {
  await Promise.all([
    mkdir(target, { recursive: true }),
    mkdir(consumer, { recursive: true }),
    mkdir(secondaryGuide, { recursive: true }),
  ]);
  await Promise.all([
    writeFile(
      paths.tsconfig,
      `${JSON.stringify(
        {
          compilerOptions: {
            target: 'ES2022',
            module: 'ESNext',
            moduleResolution: 'bundler',
            strict: true,
            skipLibCheck: true,
            types: [],
          },
          include: ['docs/**/*.ts'],
        },
        null,
        2,
      )}\n`,
    ),
    writeFile(
      paths.config,
      `import { externalUrl, outDir } from './config-values.mjs';
export default {
  docsPath: 'docs',
  tsConfig: 'tsconfig.json',
  cache: true,
  ...(outDir ? { outDir } : {}),
  guide: { anchorHeadings: ['h1', 'h2'], headerTemplate: 'docs/header.html.nunj' },
  shiki: { themes: { light: 'github-light', dark: 'ayu-dark' } },
  keywords: { keywords: { external: { title: 'External reference', url: externalUrl } } },
};
`,
    ),
    writeConfigValues('https://one.example/reference'),
    writeHeader('v1', 'Header V1'),
    writeCategory(paths.primaryCategory, 'Primary V1', 'primary-old', 2),
    writeCategory(paths.secondaryCategory, 'Secondary V1', 'secondary', 1),
    writeFile(
      paths.targetPage,
      `import Category from '../ng-doc.category';
const Page = { title: 'Target', route: 'target', category: Category, mdFile: './index.md', order: 1 };
export default Page;
`,
    ),
    writeFile(
      paths.consumerPage,
      `import Category from '../ng-doc.category';
const Page = { title: 'Consumer', route: 'consumer', category: Category, mdFile: './index.md', order: 2 };
export default Page;
`,
    ),
    writeFile(
      paths.secondaryPage,
      `import Category from '../ng-doc.category';
const Page = { title: 'Secondary guide', route: 'guide', category: Category, mdFile: './index.md' };
export default Page;
`,
    ),
    writeTarget('# Old Anchor\n\nInitial target body.'),
    writeConsumer('*TargetPage#Old-Anchor', 'external'),
    writeFile(paths.secondaryMarkdown, '# Secondary Heading\n\nSecondary body.'),
  ]);
}

function writeConfigValues(externalUrl, outDir) {
  return writeFile(
    paths.configValues,
    `export const externalUrl = ${JSON.stringify(externalUrl)};\nexport const outDir = ${
      outDir === undefined ? 'undefined' : JSON.stringify(outDir)
    };\n`,
  );
}

function writeHeader(version, label) {
  return writeFile(
    paths.header,
    `<section data-header="${version}"><h1>{{ NgDocPage.title }}</h1><p>${label}</p></section>`,
  );
}

function writeCategory(filename, title, route, order) {
  return writeFile(
    filename,
    `/** ${title} category description. */
const Category = { title: ${JSON.stringify(title)}, route: ${JSON.stringify(route)}, order: ${order}, expanded: true };
export default Category;
`,
  );
}

function writeTarget(body) {
  return writeFile(paths.targetMarkdown, `---\nkeyword: TargetPage\n---\n${body}\n`);
}

function writeConsumer(targetKeyword, externalKeyword) {
  return writeFile(
    paths.consumerMarkdown,
    `# Consumer Heading\n\nTarget link: \`${targetKeyword}\`. External link: \`${externalKeyword}\`.\n`,
  );
}

function writeConsumerWithoutTarget(externalKeyword) {
  return writeFile(
    paths.consumerMarkdown,
    `# Consumer Heading\n\nTarget anchor intentionally absent. External link: \`${externalKeyword}\`.\n`,
  );
}

async function productsFor(result) {
  const complete = await assertComplete(result, { routes: ['primary', 'secondary'] });
  const physical = await Promise.all(
    complete.outputs.map(async (output) => ({
      output,
      text: await readFile(path.join(complete.outputRoot, output.path), 'utf8'),
    })),
  );
  const context = physical.find(({ output }) => output.path === 'context.ts');
  assert(context, 'Missing physical context.ts');
  return {
    result,
    ...complete,
    context: context.text,
    physicalText: physical.map(({ text }) => text).join('\n'),
    targetHtml: guideHtml(result, '/target'),
    consumerHtml: guideHtml(result, '/consumer'),
  };
}

function assertInitial(products) {
  assert.match(products.routesText, /path: 'primary-old'/);
  assert.match(products.context, /route: '\/primary-old'/);
  assert(products.context.indexOf('Secondary V1') < products.context.indexOf('Primary V1'));
  const targetRecord = products.search.find((record) => record.route === 'primary-old/target');
  assert.deepEqual(targetRecord?.breadcrumbs.slice(0, 2), ['Primary V1', 'Target']);
  assertAnchorState(products, 'old-anchor', [], 'primary-old');
  assert.match(products.consumerHtml, /href="primary-old\/target#old-anchor"/);
  assert.match(products.consumerHtml, /href="https:\/\/one\.example\/reference"/);
  assert.match(products.keywordsText, /primary-old\/target#old-anchor/);
  assert.match(products.targetHtml, /Header V1/);
  assert.match(products.physicalText, /Header V1/);
}

function assertCategoryEdit(products) {
  assert.match(products.routesText, /path: 'primary-new'/);
  assert.doesNotMatch(products.routesText, /path: 'primary-old'/);
  assert.match(products.context, /title: `Primary V2`/);
  assert.match(products.context, /route: '\/primary-new'/);
  assert.doesNotMatch(products.context, /Primary V1|\/primary-old/);
  assert(products.context.indexOf('Primary V2') < products.context.indexOf('Secondary V1'));
  const targetRecord = products.search.find((record) => record.route === 'primary-new/target');
  assert.deepEqual(targetRecord?.breadcrumbs.slice(0, 2), ['Primary V2', 'Target']);
  assert.equal(
    products.search.some((record) => record.route.startsWith('primary-old/')),
    false,
  );
  assert.match(products.consumerHtml, /href="primary-new\/target#old-anchor"/);
  assert.doesNotMatch(products.consumerHtml, /primary-old\/target/);
  assert.match(products.physicalText, /href="primary-new\/target#old-anchor"/);
  assert.match(products.keywordsText, /primary-new\/target#old-anchor/);
  assert.doesNotMatch(products.keywordsText, /primary-old\/target/);
}

function assertAnchorState(
  products,
  currentFragment,
  staleFragments,
  categoryRoute = 'primary-new',
) {
  assert.equal(hasFragment(products.search, currentFragment), true);
  assert.match(
    products.consumerHtml,
    new RegExp(`href="${categoryRoute}/target#${currentFragment}"`),
  );
  assert.match(
    products.physicalText,
    new RegExp(`href="${categoryRoute}/target#${currentFragment}"`),
  );
  assert.match(products.keywordsText, new RegExp(`${categoryRoute}/target#${currentFragment}`));
  for (const stale of staleFragments) {
    assert.equal(hasFragment(products.search, stale), false);
    assert.doesNotMatch(products.consumerHtml, new RegExp(`#${stale}"`));
    assert.doesNotMatch(products.keywordsText, new RegExp(`#${stale}"`));
  }
}

function productSummary(products) {
  return {
    outputRoot: products.outputRoot,
    outputCount: products.outputs.length,
    searchCount: products.search.length,
    routesDigest: products.outputs.find((output) => output.role === 'routes')?.digest,
    contextDigest: products.outputs.find((output) => output.path === 'context.ts')?.digest,
    searchDigest: products.outputs.find((output) => output.role === 'search')?.digest,
  };
}

function guideHtml(result, routeSuffix) {
  return result.status === 'success'
    ? result.snapshot.artifacts
        .flatMap((artifact) => artifact.content)
        .filter(
          (content) =>
            typeof content.ir?.absoluteRoute === 'string' &&
            content.ir.absoluteRoute.endsWith(routeSuffix),
        )
        .map((content) => content.html)
        .join('\n')
    : '';
}

function hasSearchFragment(result, fragment) {
  return (
    result.status === 'success' &&
    result.snapshot.artifacts
      .flatMap((artifact) => artifact.searchRecords)
      .some((record) => record.fragment === fragment)
  );
}

function hasFragment(search, fragment) {
  return search.some((record) => record.fragment === fragment);
}
