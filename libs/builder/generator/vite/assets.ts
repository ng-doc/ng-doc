import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { Connect, Rolldown } from 'vite';

import { compareText } from '../../helpers/text-order';
import type { BuildResult, OutputManifest, PublishedGeneratorConfiguration } from '../contracts';

const GENERATED_ASSET_PATH = 'assets/ng-doc';

interface OwnedAsset {
  file: string;
  outputName: string;
}

const MIME = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.gif', 'image/gif'],
  ['.html', 'text/html; charset=utf-8'],
  ['.jpeg', 'image/jpeg'],
  ['.jpg', 'image/jpeg'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.map', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml; charset=utf-8'],
  ['.webp', 'image/webp'],
  ['.woff', 'font/woff'],
  ['.woff2', 'font/woff2'],
]);

function normalizedBase(base: string): string {
  const value = `/${base}`.replace(/\\/g, '/').replace(/\/+/g, '/');
  return value.endsWith('/') ? value : `${value}/`;
}

function safeRelative(value: string): boolean {
  return (
    !!value &&
    !value.includes('\0') &&
    !value.includes('\\') &&
    !path.posix.isAbsolute(value) &&
    !value.split('/').some((segment) => segment === '..' || segment === '')
  );
}

function inventory(
  configuration: PublishedGeneratorConfiguration,
  manifest: OutputManifest,
): Map<string, OwnedAsset> {
  const prefix = `${configuration.assetDirectory.replace(/\\/g, '/').replace(/\/$/, '')}/`;
  const result = new Map<string, OwnedAsset>();
  for (const entry of manifest.files) {
    const output = entry.path.replace(/\\/g, '/');
    if (!output.startsWith(prefix)) continue;
    const relative = output.slice(prefix.length);
    if (!safeRelative(relative)) {
      throw new Error(`[NGDOC_VITE_ASSET_PATH] Unsafe generated asset path: ${entry.path}.`);
    }
    const outputName = `${GENERATED_ASSET_PATH}/${relative}`;
    if (result.has(relative)) {
      throw new Error(`[NGDOC_VITE_ASSET_COLLISION] Duplicate generated asset: ${relative}.`);
    }
    result.set(relative, {
      file: path.join(configuration.outputRoot, output),
      outputName,
    });
  }
  return result;
}

export class GeneratedAssetInventory {
  private assets = new Map<string, OwnedAsset>();

  update(
    result: Extract<BuildResult, { status: 'success' }>,
    configuration: PublishedGeneratorConfiguration,
  ): void {
    this.assets = inventory(configuration, result.manifest);
  }

  middleware(base: string): Connect.NextHandleFunction {
    const prefix = `${normalizedBase(base)}${GENERATED_ASSET_PATH}/`.replace(/\/+/g, '/');
    return (request, response, next) => {
      const rawPath = (request.url ?? '/').split(/[?#]/, 1)[0];
      if (!rawPath.startsWith(prefix)) {
        next();
        return;
      }
      let relative: string;
      try {
        relative = decodeURIComponent(rawPath.slice(prefix.length));
      } catch {
        response.statusCode = 400;
        response.end('Invalid asset URL');
        return;
      }
      if (!safeRelative(relative)) {
        response.statusCode = 404;
        response.end('Not found');
        return;
      }
      const asset = this.assets.get(relative);
      if (!asset) {
        next();
        return;
      }
      void readFile(asset.file).then(
        (source) => {
          response.statusCode = 200;
          response.setHeader(
            'Content-Type',
            MIME.get(path.extname(relative).toLowerCase()) ?? 'application/octet-stream',
          );
          response.end(source);
        },
        () => {
          response.statusCode = 404;
          response.end('Not found');
        },
      );
    };
  }

  async emit(context: Rolldown.PluginContext, bundle: Rolldown.OutputBundle): Promise<void> {
    for (const asset of [...this.assets.values()].sort((a, b) =>
      compareText(a.outputName, b.outputName),
    )) {
      if (bundle[asset.outputName]) {
        throw new Error(
          `[NGDOC_VITE_ASSET_COLLISION] Vite bundle already owns ${asset.outputName}.`,
        );
      }
      context.emitFile({
        type: 'asset',
        fileName: asset.outputName,
        source: await readFile(asset.file),
      });
    }
  }

  size(): number {
    return this.assets.size;
  }
}
