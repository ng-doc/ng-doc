// A stand-in for prerender-entry.js: its behaviour is chosen by the request's `browserDir`.
process.once('message', (request) => {
  const reply = (message, code) => process.send(message, () => process.exit(code));
  switch (request.browserDir) {
    case 'result':
      reply(
        {
          type: 'result',
          report: {
            routes: [{ path: '/', file: 'index.html' }],
            excluded: [],
            shell: 'index.csr.html',
            request,
          },
        },
        0,
      );
      break;
    case 'error':
      reply({ type: 'error', message: '[NGDOC_PRERENDER_FAILED] 1 of 1 route(s) failed' }, 1);
      break;
    case 'silent':
      process.exit(3);
      break;
    default:
      // Waits to be killed (abort).
      setInterval(() => undefined, 1000);
  }
});
