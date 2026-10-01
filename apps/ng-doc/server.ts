import { APP_BASE_HREF } from '@angular/common';
import { CommonEngine, isMainModule } from '@angular/ssr/node';
import express from 'express';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import bootstrap from './src/main.server';

// The Express app is exported so that it can be used by serverless Functions.
/**
 *
 */
export function app(): express.Express {
  const server = express();
  const distFolder = join(import.meta.dirname, '../browser');
  const indexHtml = join(import.meta.dirname, 'index.server.html');
  const document = readFileSync(indexHtml, 'utf8');

  const commonEngine = new CommonEngine();

  server.set('view engine', 'html');
  server.set('views', distFolder);

  // Example Express Rest API endpoints
  // server.get('/api/**', (req, res) => { });
  // Serve static files from /browser
  server.get(
    '*.*',
    express.static(distFolder, {
      maxAge: '1y',
    }),
  );

  // All regular routes use the Angular engine
  server.get('*', (req, res, next) => {
    const { protocol, originalUrl, baseUrl, headers } = req;
    const escapedBaseHref = `${baseUrl.replace(/\/$/, '')}/`
      .replaceAll('&', '&amp;')
      .replaceAll('"', '&quot;');
    const renderedDocument = baseUrl
      ? document.replace(/<base\s+href="[^"]*"\s*\/?\s*>/, `<base href="${escapedBaseHref}">`)
      : document;

    commonEngine
      .render({
        bootstrap,
        document: renderedDocument,
        documentFilePath: indexHtml,
        url: `${protocol}://${headers.host}${originalUrl}`,
        publicPath: distFolder,
        providers: [{ provide: APP_BASE_HREF, useValue: baseUrl }],
      })
      .then((html) => res.send(html))
      .catch((err) => next(err));
  });

  return server;
}

/**
 *
 */
function run(): void {
  const port = process.env['PORT'] || 4000;

  // Start up the Node server
  const server = app();
  server.listen(port, () => {
    console.log(`Node Express server listening on http://localhost:${port}`);
  });
}

if (isMainModule(import.meta.url)) {
  run();
}

export default bootstrap;
