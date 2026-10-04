import { AsyncLocalStorage } from 'node:async_hooks';
import { appendFileSync, mkdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { types } from 'node:util';

const own = (value, key) =>
  value != null ? Object.getOwnPropertyDescriptor(Object(value), key)?.value : undefined;
const primitive = (value) =>
  ['string', 'number', 'boolean'].includes(typeof value) ? value : undefined;
const arrayLength = (value) => (Array.isArray(value) ? value.length : undefined);

function inputSummary(args) {
  const request = args[0];
  return Object.fromEntries(
    ['id', 'kind', 'ownerId', 'entryId', 'generation', 'mode'].flatMap((key) => {
      const value = primitive(own(request, key));
      return value === undefined ? [] : [[key, value]];
    }),
  );
}

function resultSummary(result) {
  const diagnostics = own(result, 'diagnostics');
  const errors = Array.isArray(diagnostics)
    ? diagnostics
        .filter((item) => own(item, 'severity') === 'error')
        .map((item) => own(item, 'code'))
    : [];
  return {
    status: primitive(own(result, 'status')),
    reason: primitive(own(result, 'reason')),
    errors,
    dependencies: arrayLength(own(result, 'dependencies')),
    written: arrayLength(own(result, 'written')),
    removed: arrayLength(own(result, 'removed')),
    candidate: own(result, 'candidate') !== undefined,
  };
}

/** All observations are synchronous and nonthrowing; no production result is replaced. */
export function createObserver(write) {
  const context = new AsyncLocalStorage();
  const decorated = new WeakMap();
  let sequence = 0;
  let failure;
  let active = 0;
  const emit = (event) => {
    if (failure) return;
    try {
      write({
        schema: 1,
        pid: process.pid,
        atNs: process.hrtime.bigint().toString(),
        ...context.getStore(),
        ...event,
      });
    } catch (error) {
      failure = error;
    }
  };
  const summarize = (callback) => {
    try {
      return callback();
    } catch (error) {
      failure ??= error;
      return {};
    }
  };
  function wrapCall(name, fn, { scope = false } = {}) {
    return function (...args) {
      const receiver = this;
      const invoke = () => {
        const id = ++sequence;
        active++;
        emit({ event: 'call', id, name, input: summarize(() => inputSummary(args)) });
        const settle = (event, result) => {
          active--;
          emit({
            event,
            id,
            name,
            result: summarize(() =>
              event === 'return'
                ? resultSummary(result)
                : {
                    code: primitive(own(result, 'code')),
                    name: primitive(own(result, 'name')),
                    message: primitive(own(result, 'message')),
                  },
            ),
          });
        };
        let result;
        try {
          result = Reflect.apply(fn, receiver, args);
        } catch (error) {
          settle('throw', error);
          throw error;
        }
        if (types.isPromise(result)) {
          // Preserve the exact Promise and its rejection. Our child Promise always fulfils.
          try {
            Promise.prototype.then.call(
              result,
              (value) => settle('return', value),
              (error) => settle('reject', error),
            );
          } catch (error) {
            failure ??= error;
            active--;
          }
        } else {
          // Do not invoke a thenable's getter/then: that can change application semantics.
          settle('return', result);
        }
        return result;
      };
      if (!scope) return invoke();
      const request = args[0];
      return context.run(
        summarize(() => ({
          generation: primitive(own(request, 'generation')),
          mode: primitive(own(request, 'mode')),
          origin: primitive(own(own(request, 'contentRequest'), 'origin')),
        })),
        invoke,
      );
    };
  }
  function decorate(value, name, methods) {
    if (!value || (typeof value !== 'object' && typeof value !== 'function'))
      throw new Error(`Observer expected service ${name}`);
    let seen = decorated.get(value);
    if (!seen) decorated.set(value, (seen = new Set()));
    for (const method of methods) {
      if (seen.has(method)) continue;
      if (typeof value[method] !== 'function')
        throw new Error(`Observer missing ${name}.${method}`);
      const previous = Object.getOwnPropertyDescriptor(value, method);
      Object.defineProperty(value, method, {
        configurable: previous?.configurable ?? true,
        enumerable: previous?.enumerable ?? false,
        writable: previous?.writable ?? true,
        value: wrapCall(`${name}.${method}`, value[method], {
          scope: name === 'compiler' && method === 'compile',
        }),
      });
      seen.add(method);
    }
    return value;
  }
  return {
    wrapCall,
    decorate,
    emit,
    status: () => ({
      calls: sequence,
      active,
      failed: Boolean(failure),
      failure: failure ? String(failure) : undefined,
    }),
  };
}

let singleton;
function observer() {
  if (singleton) return singleton;
  const directory = process.env.NGDOC_BENCHMARK_OBSERVER_DIR;
  const run = process.env.NGDOC_BENCHMARK_RUN_ID;
  if (!directory || !path.isAbsolute(directory) || !run)
    throw new Error(
      'Instrumented build requires absolute NGDOC_BENCHMARK_OBSERVER_DIR and NGDOC_BENCHMARK_RUN_ID',
    );
  mkdirSync(directory, { recursive: true });
  const file = path.join(directory, `${process.pid}-${randomUUID()}.jsonl`);
  let bytes = 0;
  singleton = createObserver((event) => {
    const line = `${JSON.stringify({ run, ...event })}\n`;
    bytes += Buffer.byteLength(line);
    if (bytes > 64 * 1024 * 1024) throw new Error('Observer trace exceeded 64 MiB');
    appendFileSync(file, line, { flag: 'a', mode: 0o600 });
  });
  singleton.emit({ event: 'observer-start', format: 'ngdoc-work-observer-v1' });
  process.once('exit', () => {
    // Write independently of the failed sink, so overflow remains a failed cohort.
    try {
      appendFileSync(
        file,
        `${JSON.stringify({ schema: 1, run, pid: process.pid, event: 'observer-end', ...singleton.status() })}\n`,
      );
    } catch {
      /* A missing terminal record also invalidates the cohort. */
    }
  });
  return singleton;
}

const specs = {
  createCompilationService: ['compiler', ['compile', 'dispose']],
  createSemanticService: [
    'semantic',
    ['synchronize', 'enumerateApi', 'describeGuide', 'renderFragment', 'dispose'],
  ],
  createArtifactCache: ['cache', ['read', 'write']],
  createOutputCommitter: ['committer', ['commit', 'dispose']],
  createDependencyRefresher: ['dependency', ['refresh']],
};

/** Called only by the esbuild wrapper; all other module exports remain original. */
export function observeExport(name, original) {
  if (name === 'GeneratorContentCompiler') {
    const wrapped = new Proxy(original, {
      construct(target, args, newTarget) {
        const value = Reflect.construct(target, args, newTarget === wrapped ? target : newTarget);
        return observer().decorate(value, 'content', ['describe', 'compile', 'link']);
      },
    });
    return wrapped;
  }
  return function (...args) {
    let actualArgs = args;
    if (name === 'createDependencyRefresher') {
      // Deliberate use of the existing public instrumentation option. Caller object is untouched.
      const options = args[0] ?? {};
      actualArgs = [
        {
          ...options,
          onObserve(...observed) {
            observer().emit({
              event: 'physical-observation',
              kind: observed[0],
              identity: observed[1],
            });
            return options.onObserve?.apply(options, observed);
          },
        },
        ...args.slice(1),
      ];
    }
    const value = Reflect.apply(original, this, actualArgs);
    if (name === 'createDiscoveryServices') {
      observer().decorate(value.discovery, 'discovery', ['discover']);
      observer().decorate(value.templates, 'template', ['render']);
      return value;
    }
    const spec = specs[name];
    if (!spec) throw new Error(`Unsupported observed export ${name}`);
    return observer().decorate(value, ...spec);
  };
}
