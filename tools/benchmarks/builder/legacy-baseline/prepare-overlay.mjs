import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const directory = path.dirname(fileURLToPath(import.meta.url));
const repository = path.resolve(directory, '../../../..');

const sha256 = (value) => createHash('sha256').update(value).digest('hex');

async function files(root) {
  const values = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const value = path.join(root, entry.name);
    if (entry.isDirectory()) values.push(...(await files(value)));
    else values.push(value);
  }
  return values;
}

export async function prepareOverlay(runtimeRoot) {
  const packageRoot = path.join(runtimeRoot, 'builder');
  await rm(packageRoot, { recursive: true, force: true });
  await cp(path.join(repository, 'dist/libs/builder'), packageRoot, { recursive: true });
  await symlink(
    path.join(repository, 'node_modules'),
    path.join(packageRoot, 'node_modules'),
    'dir',
  );
  const overlayRoot = path.join(directory, 'overlay');
  const records = [];
  for (const source of (await files(overlayRoot)).filter((file) => file.endsWith('.ts')).sort()) {
    const relative = path.relative(overlayRoot, source);
    const original = path.join(repository, 'libs/builder', relative);
    const target = path.join(packageRoot, relative.replace(/\.ts$/, '.js'));
    const sourceBytes = await readFile(source);
    const originalBytes = await readFile(original);
    const transformed = ts.transpileModule(sourceBytes.toString('utf8'), {
      fileName: source,
      reportDiagnostics: true,
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.CommonJS,
        esModuleInterop: true,
        experimentalDecorators: true,
      },
    });
    const errors = (transformed.diagnostics ?? []).filter(
      (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error,
    );
    if (errors.length) {
      throw new Error(
        `Overlay transpile failed for ${relative}: ${errors
          .map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'))
          .join('; ')}`,
      );
    }
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, transformed.outputText);
    records.push({
      relative,
      originalSha256: sha256(originalBytes),
      overlaySourceSha256: sha256(sourceBytes),
      emittedSha256: sha256(transformed.outputText),
    });
  }
  const provenance = {
    repository,
    originalPackage: path.join(repository, 'dist/libs/builder'),
    packageRoot,
    node: process.version,
    typescript: ts.version,
    records,
  };
  await writeFile(
    path.join(runtimeRoot, 'overlay-provenance.json'),
    JSON.stringify(provenance, null, 2) + '\n',
  );
  return { packageRoot, provenance };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const runtimeRoot = process.argv[2];
  if (!runtimeRoot) throw new Error('usage: prepare-overlay.mjs <runtime-root>');
  await mkdir(runtimeRoot, { recursive: true });
  process.stdout.write(
    JSON.stringify(await prepareOverlay(path.resolve(runtimeRoot)), null, 2) + '\n',
  );
}
