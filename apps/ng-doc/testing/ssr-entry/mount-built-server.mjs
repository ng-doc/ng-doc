import express from 'express';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const serverEntryOption = process.env['NG_DOC_SERVER_ENTRY'];
if (!serverEntryOption) {
  throw new Error('NG_DOC_SERVER_ENTRY is required');
}

const serverEntry = resolve(serverEntryOption);
const { app } = await import(pathToFileURL(serverEntry).href);
const server = express();

server.use('/preview', app());
server.listen(process.env['PORT'], () => {
  console.log(
    `Mounted Node Express server listening on http://localhost:${process.env['PORT']}/preview`,
  );
});
