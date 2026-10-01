import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { analogResourcePolicy } from '../../../../../tools/scripts/analog-resource-patch.mjs';

const digest = (value) => createHash('sha256').update(value).digest('hex');

async function inventory(root) {
  const files = [];
  const visit = async (directory) => {
    for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) =>
      a.name.localeCompare(b.name),
    )) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(file);
      else if (entry.isFile())
        files.push([path.relative(root, file), digest(await readFile(file))]);
      else throw new Error(`Unexpected package entry ${file}`);
    }
  };
  await visit(root);
  return files;
}

function replaceOnce(source, before, after, label) {
  assert.equal(source.split(before).length, 2, `Expected exactly one ${label}`);
  return source.replace(before, after);
}

export async function prepareAnalogCopy({
  packageRoot,
  destination,
  mode,
  resourceIdentity = true,
}) {
  assert.match(mode, /^(baseline|full-reset)$/);
  await rm(destination, { recursive: true, force: true });
  await mkdir(path.dirname(destination), { recursive: true });
  await cp(packageRoot, destination, { recursive: true });
  const relativeFile = 'src/lib/angular-vite-plugin.js';
  const file = path.join(destination, relativeFile);
  const original = await readFile(file, 'utf8');
  let source = original;
  const changes = [];

  // A correction the independent Vite resource acceptance fixture already proves: preserve the
  // real native resource identity when Analog asks Angular for an incremental compilation.
  const resourceBefore =
    'pendingCompilation = performCompilation(resolvedConfig, [\n                        ...mods.map((mod) => mod.id),';
  const resourceAfter =
    'pendingCompilation = performCompilation(resolvedConfig, [\n                        ctx.file,\n                        ...mods.map((mod) => mod.id),';
  if (resourceIdentity) {
    source = replaceOnce(source, resourceBefore, resourceAfter, 'resource compilation call');
    changes.push({
      label: 'native-resource-identity',
      before: resourceBefore,
      after: resourceAfter,
    });
  }

  if (mode === 'full-reset') {
    const pendingBefore = `    let pendingCompilation;
    let compilationLock = Promise.resolve();`;
    const pendingAfter = `    let pendingCompilation;
    let terminalCompilationError;
    let compilationLock = Promise.resolve();
    function reportCompilationError(error) {
        try {
            resolvedConfig.logger.error(error);
        }
        catch {
            // A custom logger must not replace the original terminal compiler failure or create
            // a second unhandled rejection from this best-effort reporting observer.
        }
    }`;
    source = replaceOnce(source, pendingBefore, pendingAfter, 'terminal compilation state');
    changes.push({
      label: 'terminal-invalid-registry-state',
      before: pendingBefore,
      after: pendingAfter,
    });

    const invalidatorCallBefore =
      '() => performCompilation(resolvedConfig), pluginOptions.include.map((glob) => `${normalizePath(resolve(pluginOptions.workspaceRoot))}${glob}`)';
    const invalidatorCallAfter = `(files) => {
                    const compilation = performCompilation(resolvedConfig, files);
                    pendingCompilation = compilation;
                    void compilation.catch((error) => {
                        // Add/unlink compilation has no legacy HMR hook promise for Vite to observe.
                        // Report the failed candidate; the same rejection remains durable for the
                        // next public transform and the last published style registry stays active.
                        reportCompilationError(error);
                    });
                    return compilation;
                }, pluginOptions.include.map((glob) => \`${'${normalizePath(resolve(pluginOptions.workspaceRoot))}${glob}'}\`)`;
    source = replaceOnce(
      source,
      invalidatorCallBefore,
      invalidatorCallAfter,
      'filesystem compilation identity forwarding',
    );
    changes.push({
      label: 'filesystem-resource-identity',
      before: invalidatorCallBefore,
      after: invalidatorCallAfter,
    });

    const resourceCompletionBefore = `                    if (updates.length > 0) {
                        await pendingCompilation;`;
    const resourceCompletionAfter = `                    if (updates.length === 0) {
                        // Keep the rejected promise for the next public Angular transform, while
                        // attaching an immediate observer so Node never treats it as unhandled.
                        void pendingCompilation.catch(reportCompilationError);
                    }
                    if (updates.length > 0) {
                        await pendingCompilation;`;
    source = replaceOnce(
      source,
      resourceCompletionBefore,
      resourceCompletionAfter,
      'unimported resource rejection observer',
    );
    changes.push({
      label: 'unimported-resource-rejection-observer',
      before: resourceCompletionBefore,
      after: resourceCompletionAfter,
    });

    const invalidatorBefore = `    let debounceTimer;
    return (file) => {
        const affectsProgram = (TS_EXT_REGEX.test(file) && !EXCLUDED_TS_EXT_REGEX.test(file)) ||
            COMPONENT_RESOURCE_EXT_REGEX.test(file) ||
            basename(file).includes('tsconfig') ||
            !!includeFilter?.(file);
        if (!affectsProgram) {
            return;
        }
        invalidateFsCaches();
        invalidateTsconfigCaches();
        // Coalesce event bursts (atomic-save add+unlink pairs, git branch
        // switches) into a single recompilation.
        if (debounceTimer) {
            clearTimeout(debounceTimer);
        }
        debounceTimer = setTimeout(() => {
            debounceTimer = undefined;
            void performCompilation();
        }, debounceMs);
    };`;
    const invalidatorAfter = `    let debounceTimer;
    const modifiedFiles = new Set();
    return (file) => {
        const affectsProgram = (TS_EXT_REGEX.test(file) && !EXCLUDED_TS_EXT_REGEX.test(file)) ||
            COMPONENT_RESOURCE_EXT_REGEX.test(file) ||
            basename(file).includes('tsconfig') ||
            !!includeFilter?.(file);
        if (!affectsProgram) {
            return;
        }
        invalidateFsCaches();
        invalidateTsconfigCaches();
        modifiedFiles.add(file);
        // Coalesce event bursts (atomic-save add+unlink pairs, git branch
        // switches) into a single recompilation without losing the physical
        // identities needed to invalidate the source-file cache.
        if (debounceTimer) {
            clearTimeout(debounceTimer);
        }
        debounceTimer = setTimeout(() => {
            debounceTimer = undefined;
            const files = [...modifiedFiles];
            modifiedFiles.clear();
            void performCompilation(files).catch(() => {
                // The supplied callback records the terminal error and reports it through Vite.
            });
        }, debounceMs);
    };`;
    source = replaceOnce(
      source,
      invalidatorBefore,
      invalidatorAfter,
      'debounced filesystem identities',
    );
    changes.push({
      label: 'debounced-filesystem-identities',
      before: invalidatorBefore,
      after: invalidatorAfter,
    });

    const compilationBefore = `    async function performCompilation(config, ids) {
        let resolve;
        const previousLock = compilationLock;
        compilationLock = new Promise((r) => {
            resolve = r;
        });
        try {
            await previousLock;
            await _doPerformCompilation(config, ids);
        }
        finally {
            resolve();
        }
    }`;
    const compilationAfter = `    async function performCompilation(config, ids) {
        if (terminalCompilationError) {
            throw terminalCompilationError;
        }
        let resolve;
        const previousLock = compilationLock;
        compilationLock = new Promise((r) => {
            resolve = r;
        });
        try {
            await previousLock;
            if (terminalCompilationError) {
                throw terminalCompilationError;
            }
            await _doPerformCompilation(config, ids);
        }
        catch (error) {
            // Only completed analysis with an ordinary diagnostic is retryable. The rejected
            // pending compilation continues blocking transforms until a real later pass succeeds.
            if (error?.code === "NGDOC_ANALOG_COMPILATION_DIAGNOSTIC") {
                throw error;
            }
            terminalCompilationError ??= error;
            throw terminalCompilationError;
        }
        finally {
            resolve();
        }
    }`;
    source = replaceOnce(
      source,
      compilationBefore,
      compilationAfter,
      'terminal compilation policy',
    );
    changes.push({
      label: 'terminal-compilation-policy',
      before: compilationBefore,
      after: compilationAfter,
    });

    const mapsBefore = `        if (!jit) {
            inlineComponentStyles = tsCompilerOptions['externalRuntimeStyles']
                ? new Map()
                : undefined;
            externalComponentStyles = tsCompilerOptions['externalRuntimeStyles']
                ? new Map()
                : undefined;
            augmentHostWithResources(host, styleTransform, {
                inlineStylesExtension: pluginOptions.inlineStylesExtension,
                isProd,
                inlineComponentStyles,
                externalComponentStyles,
                sourceFileCache,
            });
        }`;
    const mapsAfter = `        let passInlineComponentStyles;
        let passExternalComponentStyles;
        if (!jit) {
            passInlineComponentStyles = tsCompilerOptions['externalRuntimeStyles']
                ? new Map()
                : undefined;
            passExternalComponentStyles = tsCompilerOptions['externalRuntimeStyles']
                ? new Map()
                : undefined;
            augmentHostWithResources(host, styleTransform, {
                inlineStylesExtension: pluginOptions.inlineStylesExtension,
                isProd,
                inlineComponentStyles: passInlineComponentStyles,
                externalComponentStyles: passExternalComponentStyles,
                sourceFileCache,
            });
        }`;
    source = replaceOnce(source, mapsBefore, mapsAfter, 'per-pass style maps');
    changes.push({ label: 'transactional-pass-maps', before: mapsBefore, after: mapsAfter });

    const programBefore =
      'const angularProgram = new compilerCli.NgtscProgram(rootNames, tsCompilerOptions, host, nextProgram);';
    const programAfter = `// External runtime style maps represent the complete current Angular program. Reusing the
            // previous NgtscProgram can skip unchanged owners and therefore cannot reconstruct that
            // complete registry after a pass-local reset.
            const styleRegistryPreviousProgram = tsCompilerOptions['externalRuntimeStyles']
                ? undefined
                : nextProgram;
            const angularProgram = new compilerCli.NgtscProgram(rootNames, tsCompilerOptions, host, styleRegistryPreviousProgram);`;
    source = replaceOnce(source, programBefore, programAfter, 'NgtscProgram construction');
    changes.push({
      label: 'complete-style-owner-analysis',
      before: programBefore,
      after: programAfter,
    });

    const commitBefore = `        if (!isTest) {
            /**
             * Perf: Output files on demand so the dev server
             * isn't blocked when emitting files.
             */
            outputFile = writeOutputFile;
        }
    }
}`;
    const commitAfter = `        if (!isTest) {
            /**
             * Perf: Output files on demand so the dev server
             * isn't blocked when emitting files.
             */
            outputFile = writeOutputFile;
        }
        // A pass with diagnostics is not a complete current-owner registry: a broken component
        // can be absent while the browser still holds its last successful virtual style URL.
        // Keep the prior published maps and reject this pass. A later real compilation can
        // repair ordinary diagnostics; unexpected compiler exceptions still require a new factory.
        if (!jit && tsCompilerOptions['externalRuntimeStyles']) {
            const styleRegistryDiagnostics = [
                ...builder.getSyntacticDiagnostics(),
                ...(pluginOptions.disableTypeChecking ? [] : builder.getSemanticDiagnostics()),
                ...(angularCompiler?.getDiagnostics() ?? []),
            ];
            const styleRegistryError = styleRegistryDiagnostics.find((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error);
            if (styleRegistryError) {
                throw Object.assign(new Error('[ANALOG_STYLE_REGISTRY_INVALID] ' + formatDiagnosticWithLocation(styleRegistryError)), {
                    code: 'NGDOC_ANALOG_COMPILATION_DIAGNOSTIC',
                });
            }
        }
        // Publish a complete registry only after analysis, diagnostics, and emit setup return
        // successfully. A thrown pass leaves the prior maps serving the last successful program.
        if (!jit) {
            inlineComponentStyles = passInlineComponentStyles;
            externalComponentStyles = passExternalComponentStyles;
        }
    }
}`;
    source = replaceOnce(source, commitBefore, commitAfter, 'successful style-map publication');
    changes.push({
      label: 'validated-successful-pass-publication',
      before: commitBefore,
      after: commitAfter,
    });
  }

  if (mode === 'full-reset') {
    // The shipped policy has further changes than the style-ownership ones checked here; apply
    // them too, so this harness runs exactly the Analog source NgDoc builds and ships.
    const applied = new Set(changes.map(({ label }) => label));
    for (const change of analogResourcePolicy.changes) {
      if (applied.has(change.label)) continue;
      source = replaceOnce(source, change.before, change.after, change.label);
      changes.push(change);
    }
  }

  await writeFile(file, source);
  const baselineFiles = await inventory(packageRoot);
  const copiedFiles = await inventory(destination);
  const changedFiles = copiedFiles.filter(
    ([name, hash]) => baselineFiles.find(([candidate]) => candidate === name)?.[1] !== hash,
  );
  assert.deepEqual(
    changedFiles.map(([name]) => name),
    [relativeFile],
  );
  return {
    mode,
    packageVersion: JSON.parse(await readFile(path.join(packageRoot, 'package.json'), 'utf8'))
      .version,
    originalPackageDigest: digest(JSON.stringify(baselineFiles)),
    copiedPackageDigest: digest(JSON.stringify(copiedFiles)),
    changedFiles,
    changes,
    baselineFiles,
    copiedFiles,
  };
}
