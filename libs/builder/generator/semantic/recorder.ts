import * as tsMorph from 'ts-morph';
import { Node, Project, ts } from 'ts-morph';

import {
  type Footprint,
  type FootprintChannel,
  type FootprintScopeKind,
  type RecorderMode,
  FootprintScope,
} from '../kernel/footprint';
import { SemanticFailure } from './dependencies';

/**
 * The semantic channels of the one recorder.
 *
 * Every semantic query runs synchronously inside one scope on a module-wide stack, so the hooks
 * below, which are installed in place on shared TypeScript and ts-morph objects, record into the
 * scope on top of the stack. Four channels record the source file of what a query touches:
 *
 * 1. `checker`: every function of the program's `ts.TypeChecker` object. Returned symbols, types
 *    and signatures (and arrays of them) and symbol arguments record their declarations' files,
 *    the files of every alias-chain link (`getImmediateAliasedSymbol`) with the modules the links
 *    import from, and, for every module symbol, the resolved files of its `export *` targets,
 *    recursively and even when they export nothing. TypeScript's own `TypeObject` and
 *    `SymbolObject` methods delegate through `this.checker.<fn>`, so they are recorded too.
 * 2. `language-service`: the files of `findReferences` and the other location queries. Such a
 *    search answers for the whole program, so it also makes the footprint incomplete (the
 *    derived-class list runs suspended in {@link recordDerivedQuery}).
 * 3. `lookup`: explicit source-file lookups by path in the semantic service.
 * 4. `node-factory`: ts-morph's `CompilerFactory.getNodeFromCompilerNode`, `getSourceFile` and
 *    `getSourceFileForNode`, the funnel of every wrapper (cache hits included). It records the
 *    source file of the returned wrapper, never the `sourceFile` argument.
 *
 * Shared indexes are built inside {@link suspendRecording}; per-answer caches go through
 * {@link recordedAnswer}, which stores each answer with the footprint it recorded and replays it
 * on a hit. If the pinned-version probe fails, recording is off (today's behaviour).
 */

const stack: FootprintScope[] = [];
let suspended = 0;

/** The scope reads are recorded into: the innermost open scope, unless recording is suspended. */
function top(): FootprintScope | undefined {
  return suspended === 0 ? stack[stack.length - 1] : undefined;
}

/**
 * Recording never changes what a hooked call returns or throws: a failure while recording is kept
 * on the scope as a gap (so `verify` fails the query) and the call proceeds.
 */
function failed(scope: FootprintScope, error: unknown): void {
  scope.gaps.push(`recorder failure: ${error instanceof Error ? error.message : String(error)}`);
}

/**
 *
 */
function guarded(scope: FootprintScope, record: () => void): void {
  try {
    record();
  } catch (error) {
    failed(scope, error);
  }
}

/** Runs `build` with recording suspended (shared indexes). */
export function suspendRecording<T>(build: () => T): T {
  suspended++;
  try {
    return build();
  } finally {
    suspended--;
  }
}

/**
 * Runs `query`, the derived-class list of the class `identity` (`path#start`), recording only the
 * identity into the current scope. The list depends on heritage clauses anywhere in the program,
 * and the scope's semantic closure recomputes it (`derived`), so the query itself runs with
 * recording suspended: the reference searches it makes would record whatever TypeScript resolves
 * for the first time, which depends on what ran before, not on this scope.
 */
export function recordDerivedQuery<T>(identity: string, query: () => T): T {
  top()?.recordDerived(identity);
  return suspendRecording(query);
}

/** Channel 3: an explicit source-file lookup by path. */
export function recordLookup(path: string): void {
  top()?.record(path, 'lookup');
}

export interface RecordedAnswer<T> {
  readonly value: T;
  readonly footprint: Footprint;
  /** Verify-mode gaps found while computing the answer; replayed on every use. */
  readonly gaps: readonly string[];
}

/**
 * A per-answer cache entry that replays what computing it recorded. The key is an identity
 * (`path#name`, position), never a ts-morph node. The answer is always computed inside a capture
 * scope, even when the caller's recording is suspended, so a hit never under-records.
 */
export function recordedAnswer<T>(
  cache: Map<string, RecordedAnswer<T>>,
  key: string,
  compute: () => T,
): T {
  // The query this answer serves, even while its recording is suspended: its mode decides verify,
  // and it receives the answer's gaps.
  const owner = stack[stack.length - 1];
  let answer = cache.get(key);
  if (!answer) {
    const capture = new FootprintScope('capture', key, owner?.verify ?? false);
    const saved = suspended;
    suspended = 0;
    stack.push(capture);
    try {
      const value = compute();
      answer = { value, footprint: capture.seal(), gaps: [...capture.gaps] };
    } finally {
      stack.splice(stack.lastIndexOf(capture), 1);
      suspended = saved;
    }
    cache.set(key, answer);
  }
  owner?.gaps.push(...answer.gaps);
  top()?.merge(answer.footprint);
  return answer.value;
}

// ---------------------------------------------------------------------------------------------
// Channel 1: the checker.

interface CheckerContext {
  program: ts.Program;
  getImmediateAliasedSymbol: (symbol: ts.Symbol) => ts.Symbol | undefined;
  getSymbolAtLocation: (node: ts.Node) => ts.Symbol | undefined;
  /** `export *` closure per module file, a pure function of the program. */
  stars: Map<string, readonly string[]>;
}

interface ResolvingProgram {
  getResolvedModuleFromModuleSpecifier(
    specifier: ts.Expression,
    source: ts.SourceFile,
  ): { resolvedModule?: { resolvedFileName: string } } | undefined;
}

/** TypeScript's internal object allocator: the constructors of checker symbols, types and signatures. */
const allocator = (
  ts as unknown as {
    objectAllocator: Record<
      'getSymbolConstructor' | 'getTypeConstructor' | 'getSignatureConstructor',
      () => new (...values: never[]) => object
    >;
  }
).objectAllocator;
const SymbolObject = allocator.getSymbolConstructor();
const TypeObject = allocator.getTypeConstructor();
const SignatureObject = allocator.getSignatureConstructor();

/** Symbols already recorded into a scope (a scope records a symbol's files once). */
const visited = new WeakMap<FootprintScope, WeakSet<object>>();

/**
 *
 */
function fileOf(node: ts.Node): string | undefined {
  let current: ts.Node | undefined = node;
  while (current && current.kind !== ts.SyntaxKind.SourceFile) current = current.parent;
  return (current as ts.SourceFile | undefined)?.fileName;
}

/**
 *
 */
function moduleSourceFile(
  specifier: ts.Expression,
  context: CheckerContext,
): ts.SourceFile | undefined {
  const declaration = context
    .getSymbolAtLocation(specifier)
    ?.declarations?.find((item): item is ts.SourceFile => ts.isSourceFile(item));
  if (declaration) return declaration;
  // A star target that is not a module (it exports nothing) has no symbol; resolution still names it.
  // `Program#getResolvedModuleFromModuleSpecifier` is internal (asserted by the compatibility probe).
  const resolved = (
    context.program as unknown as ResolvingProgram
  ).getResolvedModuleFromModuleSpecifier(specifier, specifier.getSourceFile())?.resolvedModule
    ?.resolvedFileName;
  return resolved ? context.program.getSourceFile(resolved) : undefined;
}

/** The resolved files of every `export *` target of `source`, recursively. */
function starClosure(source: ts.SourceFile, context: CheckerContext): readonly string[] {
  const cached = context.stars.get(source.fileName);
  if (cached) return cached;
  const files = new Set<string>();
  const visit = (file: ts.SourceFile): void => {
    for (const statement of file.statements) {
      if (
        !ts.isExportDeclaration(statement) ||
        statement.exportClause ||
        !statement.moduleSpecifier
      )
        continue;
      const target = moduleSourceFile(statement.moduleSpecifier, context);
      if (!target || files.has(target.fileName)) continue;
      files.add(target.fileName);
      visit(target);
    }
  };
  visit(source);
  const closure = [...files];
  context.stars.set(source.fileName, closure);
  return closure;
}

/**
 *
 */
function recordModule(
  scope: FootprintScope,
  source: ts.SourceFile,
  context: CheckerContext,
  channel: FootprintChannel,
): void {
  scope.record(source.fileName, channel);
  for (const file of starClosure(source, context)) scope.record(file, channel);
}

/** The module an import or re-export declaration reads from. */
function aliasModuleSpecifier(declaration: ts.Node): ts.Expression | undefined {
  for (let node: ts.Node | undefined = declaration, depth = 0; node && depth < 4; depth++) {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) return node.moduleSpecifier;
    if (ts.isImportEqualsDeclaration(node))
      return ts.isExternalModuleReference(node.moduleReference)
        ? node.moduleReference.expression
        : undefined;
    node = node.parent;
  }
  return undefined;
}

/**
 *
 */
function recordDeclarations(
  scope: FootprintScope,
  symbol: ts.Symbol,
  context: CheckerContext,
  channel: FootprintChannel,
): void {
  for (const declaration of symbol.declarations ?? []) {
    if (ts.isSourceFile(declaration)) recordModule(scope, declaration, context, channel);
    else {
      const file = fileOf(declaration);
      if (file) scope.record(file, channel);
    }
  }
}

/**
 *
 */
function recordSymbol(
  scope: FootprintScope,
  symbol: ts.Symbol,
  context: CheckerContext,
  channel: FootprintChannel = 'checker',
): void {
  let seen = visited.get(scope);
  if (!seen) visited.set(scope, (seen = new WeakSet()));
  if (seen.has(symbol)) return;
  seen.add(symbol);
  recordDeclarations(scope, symbol, context, channel);
  if (!(symbol.flags & ts.SymbolFlags.Alias)) return;
  // Every link of the alias chain, with the module each link imports or re-exports from.
  const chain = new Set<ts.Symbol>();
  for (
    let link: ts.Symbol | undefined = symbol;
    link && !chain.has(link);
    link = link.flags & ts.SymbolFlags.Alias ? immediateAlias(link, context) : undefined
  ) {
    chain.add(link);
    seen.add(link);
    recordDeclarations(scope, link, context, channel);
    for (const declaration of link.declarations ?? []) {
      const specifier = aliasModuleSpecifier(declaration);
      const source = specifier && moduleSourceFile(specifier, context);
      if (source) recordModule(scope, source, context, channel);
    }
  }
}

/**
 *
 */
function immediateAlias(symbol: ts.Symbol, context: CheckerContext): ts.Symbol | undefined {
  try {
    return context.getImmediateAliasedSymbol(symbol);
  } catch {
    return undefined;
  }
}

/**
 *
 */
function recordValue(scope: FootprintScope, value: unknown, context: CheckerContext): void {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    for (const item of value) recordValue(scope, item, context);
    return;
  }
  if (value instanceof SymbolObject) recordSymbol(scope, value as ts.Symbol, context);
  else if (value instanceof TypeObject) {
    const type = value as ts.Type;
    if (type.symbol) recordSymbol(scope, type.symbol, context);
    if (type.aliasSymbol) recordSymbol(scope, type.aliasSymbol, context);
  } else if (value instanceof SignatureObject) {
    const declaration = (value as ts.Signature).declaration;
    const file = declaration && fileOf(declaration);
    if (file) scope.record(file, 'checker');
  } else {
    // Index infos and other records that name their declaration.
    const declaration = (value as { declaration?: unknown }).declaration;
    if (declaration && typeof (declaration as ts.Node).kind === 'number') {
      const file = fileOf(declaration as ts.Node);
      if (file) scope.record(file, 'checker');
    }
  }
}

const installed = new WeakSet<object>();

/**
 *
 */
function installChecker(program: ts.Program): void {
  const checker = program.getTypeChecker() as unknown as Record<string, unknown>;
  if (installed.has(checker)) return;
  installed.add(checker);
  const context: CheckerContext = {
    program,
    getImmediateAliasedSymbol: (
      checker['getImmediateAliasedSymbol'] as CheckerContext['getImmediateAliasedSymbol']
    ).bind(checker),
    getSymbolAtLocation: (
      checker['getSymbolAtLocation'] as CheckerContext['getSymbolAtLocation']
    ).bind(checker),
    stars: new Map(),
  };
  for (const name of Object.keys(checker)) {
    const original = checker[name];
    if (typeof original !== 'function') continue;
    checker[name] = function recordedCheckerCall(this: unknown) {
      // eslint-disable-next-line prefer-rest-params
      const args = arguments;
      const result = (original as (...values: unknown[]) => unknown).apply(this, args as never);
      const scope = top();
      if (scope) {
        try {
          for (let index = 0; index < args.length; index++)
            if (args[index] instanceof SymbolObject)
              recordSymbol(scope, args[index] as ts.Symbol, context);
          recordValue(scope, result, context);
        } catch (error) {
          failed(scope, error);
        }
      }
      return result;
    };
  }
}

// ---------------------------------------------------------------------------------------------
// Channel 2: the language service.

const LOCATION_QUERIES = [
  'findReferences',
  'getReferencesAtPosition',
  'findRenameLocations',
  'getImplementationAtPosition',
  'getDefinitionAtPosition',
  'getTypeDefinitionAtPosition',
] as const;

interface Location {
  fileName?: unknown;
  definition?: { fileName?: unknown };
  references?: Array<{ fileName?: unknown }>;
}

/**
 *
 */
function recordLocations(scope: FootprintScope, value: unknown): void {
  if (!Array.isArray(value)) return;
  for (const item of value as Location[]) {
    if (!item || typeof item !== 'object') continue;
    if (typeof item.fileName === 'string') scope.record(item.fileName, 'language-service');
    if (typeof item.definition?.fileName === 'string')
      scope.record(item.definition.fileName, 'language-service');
    if (Array.isArray(item.references))
      for (const reference of item.references)
        if (typeof reference?.fileName === 'string')
          scope.record(reference.fileName, 'language-service');
  }
}

/**
 *
 */
function installLanguageService(service: ts.LanguageService): void {
  if (installed.has(service)) return;
  const target = service as unknown as Record<string, unknown>;
  // Every method is checked before anything is wrapped or marked.
  for (const name of LOCATION_QUERIES)
    if (typeof target[name] !== 'function') throw new Error(`LanguageService.${name} is missing`);
  installed.add(service);
  for (const name of LOCATION_QUERIES) {
    const original = target[name];
    target[name] = function recordedLocationQuery(this: unknown) {
      const call = original as (...values: unknown[]) => unknown;
      // eslint-disable-next-line prefer-rest-params
      const result = call.apply(this, arguments as never);
      const scope = top();
      if (scope)
        guarded(scope, () => {
          recordLocations(scope, result);
          // A reference search answers for the whole program: a new reference in any file changes
          // it, and only the files of the current answer are recorded.
          scope.unscoped();
        });
      return result;
    };
  }
}

// ---------------------------------------------------------------------------------------------
// Channel 1b: TypeScript's own documentation readers on symbols and signatures.
//
// A ts-morph `Symbol`/`Signature` wrapper is cached per compiler object for the program's life, so
// a unit can reach another file's JSDoc through `getJsDocTags()`/`getDocumentationComment()` on a
// wrapper another unit created, with no factory or checker call. These prototype hooks
// record the declarations' files on every call. What computing the docs read (inherited docs reach
// base types through the wrapped checker) is captured on the first call per object, method and
// checker and replayed on later calls, because TypeScript caches the result on the object. A symbol
// of an unchanged file outlives a patched program; its next answer for the new program's checker is
// computed again (`documentation-cache.ts`), so it is captured again.

export const SYMBOL_DOC_METHODS = [
  'getDocumentationComment',
  'getContextualDocumentationComment',
  'getJsDocTags',
  'getContextualJsDocTags',
] as const;
export const SIGNATURE_DOC_METHODS = ['getDocumentationComment', 'getJsDocTags'] as const;

let docsInstalled = false;
/**
 * Files first computing a documentation answer read, per compiler object and method, with the
 * checker it was computed for (symbol methods take one; a signature belongs to one).
 */
const docReads = new WeakMap<object, Map<string, { checker: unknown; files: readonly string[] }>>();

/** The checker argument of a documentation method (the context comes first in the contextual ones). */
function documentationChecker(name: string, args: IArguments, signature: boolean): unknown {
  if (signature) return undefined;
  return args[name.startsWith('getContextual') ? 1 : 0];
}

function declarationFiles(owner: object, signature: boolean): string[] {
  const declarations = signature
    ? [(owner as ts.Signature).declaration].filter(
        (item): item is ts.SignatureDeclaration => !!item,
      )
    : (owner as ts.Symbol).declarations ?? [];
  const files: string[] = [];
  for (const declaration of declarations) {
    const file = fileOf(declaration);
    if (file) files.push(file);
  }
  return files;
}

function documentationReader(
  name: string,
  original: (...values: unknown[]) => unknown,
  signature: boolean,
): (this: object) => unknown {
  return function recordedDocumentation(this: object) {
    // eslint-disable-next-line prefer-rest-params
    const checker = documentationChecker(name, arguments, signature);
    let byMethod = docReads.get(this);
    const cached = byMethod?.get(name);
    let reads = cached && cached.checker === checker ? cached.files : undefined;
    let result: unknown;
    if (reads) {
      // eslint-disable-next-line prefer-rest-params
      result = original.apply(this, arguments as never);
    } else {
      const capture = new FootprintScope('capture', name);
      const saved = suspended;
      suspended = 0;
      stack.push(capture);
      try {
        // eslint-disable-next-line prefer-rest-params
        result = original.apply(this, arguments as never);
      } finally {
        stack.splice(stack.lastIndexOf(capture), 1);
        suspended = saved;
      }
      reads = [...capture.files];
      if (!byMethod) docReads.set(this, (byMethod = new Map()));
      byMethod.set(name, { checker, files: reads });
    }
    const scope = top();
    if (scope) {
      const own = declarationFiles(this, signature);
      for (const file of own) scope.record(file, 'symbol-docs');
      for (const file of reads) scope.record(file, 'symbol-docs');
      // Verify: the documentation's own files must be in R (a disabled record above is a gap).
      if (scope.verify)
        for (const file of own) if (!scope.files.has(file)) scope.gaps.push(`${name}() on ${file}`);
    }
    return result;
  };
}

function installDocumentationReaders(): void {
  if (docsInstalled) return;
  const targets = [
    [SymbolObject.prototype, SYMBOL_DOC_METHODS, false],
    [SignatureObject.prototype, SIGNATURE_DOC_METHODS, true],
  ] as const;
  for (const [prototype, names] of targets)
    for (const name of names)
      if (typeof (prototype as Record<string, unknown>)[name] !== 'function')
        throw new Error(`TypeScript ${prototype.constructor.name}.${name} is missing`);
  docsInstalled = true;
  for (const [prototype, names, signature] of targets)
    for (const name of names) {
      const descriptor = Object.getOwnPropertyDescriptor(prototype, name)!;
      Object.defineProperty(prototype, name, {
        ...descriptor,
        value: documentationReader(
          name,
          descriptor.value as (...values: unknown[]) => unknown,
          signature,
        ),
      });
    }
}

// ---------------------------------------------------------------------------------------------
// Channel 4: ts-morph's node factory.

/** The factory methods every wrapper is created or fetched through (ts-morph 28.0.0). */
export const NODE_FACTORY_METHODS = [
  'getNodeFromCompilerNode',
  'getSourceFile',
  'getSourceFileForNode',
] as const;

interface WrapperLike {
  __sourceFile?: { compilerNode: ts.SourceFile };
}

/**
 *
 */
function wrapperFile(node: unknown): string | undefined {
  try {
    return (node as WrapperLike | undefined)?.__sourceFile?.compilerNode.fileName;
  } catch {
    return undefined;
  }
}

/**
 *
 */
function compilerFactory(project: Project): Record<string, unknown> {
  const factory = (project as unknown as { _context?: { compilerFactory?: unknown } })._context
    ?.compilerFactory;
  if (!factory || typeof factory !== 'object')
    throw new Error('ts-morph compiler factory is missing');
  return factory as Record<string, unknown>;
}

/**
 *
 */
function installNodeFactory(project: Project): void {
  const factory = compilerFactory(project);
  if (installed.has(factory)) return;
  for (const name of NODE_FACTORY_METHODS)
    if (typeof factory[name] !== 'function') throw new Error(`CompilerFactory.${name} is missing`);
  installed.add(factory);
  for (const name of NODE_FACTORY_METHODS) {
    const original = factory[name] as (...values: unknown[]) => unknown;
    factory[name] = function recordedWrapper(this: unknown) {
      // eslint-disable-next-line prefer-rest-params
      const node = original.apply(this, arguments as never);
      const scope = top();
      if (scope) {
        // The returned wrapper's own file, not the caller's `sourceFile` argument.
        const file = wrapperFile(node);
        if (file) scope.record(file, 'node-factory');
      }
      return node;
    };
  }
}

// ---------------------------------------------------------------------------------------------
// The verify-mode assertion.

export const VERIFIED_NODE_READS = ['getJsDocs', 'getText', 'getFullText', 'getStructure'] as const;
let verifyInstalled = false;

/**
 *
 */
function installVerifyHooks(): void {
  if (verifyInstalled) return;
  verifyInstalled = true;
  const prototypes = new Set<object>();
  for (const value of Object.values(tsMorph)) {
    if (typeof value !== 'function' || !(value === Node || value.prototype instanceof Node))
      continue;
    for (
      let prototype = value.prototype as object | null;
      prototype && prototype !== Object.prototype;
      prototype = Object.getPrototypeOf(prototype) as object | null
    )
      prototypes.add(prototype);
  }
  for (const prototype of prototypes)
    for (const name of VERIFIED_NODE_READS) {
      const descriptor = Object.getOwnPropertyDescriptor(prototype, name);
      if (typeof descriptor?.value !== 'function') continue;
      const original = descriptor.value as (...values: unknown[]) => unknown;
      Object.defineProperty(prototype, name, {
        ...descriptor,
        value: function verifiedNodeRead(this: unknown) {
          const scope = top();
          if (scope?.verify) {
            const file = wrapperFile(this);
            if (file && !scope.files.has(file)) scope.gaps.push(`${name}() on ${file}`);
          }
          // eslint-disable-next-line prefer-rest-params
          return original.apply(this, arguments as never);
        },
      });
    }
}

// ---------------------------------------------------------------------------------------------
// Installation, the compatibility probe and scopes.

/**
 *
 */
function install(project: Project): void {
  installDocumentationReaders();
  installNodeFactory(project);
  installLanguageService(project.getLanguageService().compilerObject);
  installChecker(project.getProgram().compilerObject);
}

export interface RecorderCompatibility {
  ok: boolean;
  /** Why recording is off when `ok` is false. */
  reason?: string;
  typescript: string;
}

let compatibility: RecorderCompatibility | undefined;

/**
 * The pinned-version probe, run once per process on a two-file in-memory project: TypeScript's
 * `TypeObject`/`SymbolObject` methods reach the wrapped checker, ts-morph wrappers come through all
 * three factory methods, and `findReferences` reaches the wrapped language service. Any failure
 * turns recording off.
 */
export function recorderCompatibility(): RecorderCompatibility {
  return (compatibility ??= probe());
}

/** Test hook: forget the cached probe result. */
export function resetRecorderCompatibility(): void {
  compatibility = undefined;
}

/**
 *
 */
export function probeRecorder(): RecorderCompatibility {
  return probe();
}

/**
 *
 */
function probe(): RecorderCompatibility {
  const result = (reason?: string): RecorderCompatibility => ({
    ok: !reason,
    ...(reason ? { reason } : {}),
    typescript: ts.version,
  });
  try {
    const project = new Project({
      useInMemoryFileSystem: true,
      skipLoadingLibFiles: true,
      compilerOptions: { noLib: true },
    });
    project.createSourceFile(
      '/probe/base.ts',
      'export interface Base { /** doc */ value: number }',
    );
    const user = project.createSourceFile(
      '/probe/user.ts',
      "import { Base } from './base';\nexport const used: Base = { value: 1 };",
    );
    install(project);
    const factory = compilerFactory(project);
    const hits = new Map<string, number>();
    const originals = NODE_FACTORY_METHODS.map((name) => [name, factory[name]] as const);
    for (const [name, original] of originals)
      factory[name] = function countedWrapper(this: unknown) {
        hits.set(name, (hits.get(name) ?? 0) + 1);
        // eslint-disable-next-line prefer-rest-params
        return (original as (...values: unknown[]) => unknown).apply(this, arguments as never);
      };
    const declaration = user.getVariableDeclarationOrThrow('used');
    const type = declaration.getType();
    // A ts-morph Symbol wrapper made (and cached) outside any scope, as another unit would.
    const cachedSymbol = type.getSymbolOrThrow();
    // SymbolObject methods take the checker ts-morph hands them: it must be the wrapped one.
    if (!installed.has(project.getTypeChecker().compilerObject))
      return result('ts-morph does not hand out the wrapped checker');
    if (
      typeof (project.getProgram().compilerObject as unknown as Partial<ResolvingProgram>)
        .getResolvedModuleFromModuleSpecifier !== 'function'
    )
      return result('Program#getResolvedModuleFromModuleSpecifier is missing');
    const checker = new FootprintScope('capture', 'probe-checker', true);
    stack.push(checker);
    try {
      // TypeObject.getProperties -> this.checker.getPropertiesOfType: nothing else records base.ts.
      type.compilerType.getProperties();
    } finally {
      stack.splice(stack.lastIndexOf(checker), 1);
    }
    if (!checker.channels?.get('checker')?.has('/probe/base.ts'))
      return result('TypeObject methods do not delegate through the wrapped checker');
    const docs = new FootprintScope('capture', 'probe-docs', true);
    stack.push(docs);
    try {
      // ts-morph Symbol.getJsDocTags -> SymbolObject.getJsDocTags (hooked): no factory call.
      cachedSymbol.getJsDocTags();
    } finally {
      stack.splice(stack.lastIndexOf(docs), 1);
    }
    if (!docs.channels?.get('symbol-docs')?.has('/probe/base.ts'))
      return result('ts-morph symbol documentation does not reach the hooked SymbolObject methods');
    const scope = new FootprintScope('capture', 'probe', true);
    stack.push(scope);
    try {
      // Symbol.getDeclarations -> getSourceFileForNode + getNodeFromCompilerNode; the parent of a
      // top-level declaration is its source file -> getNodeFromCompilerNode -> getSourceFile.
      type.getSymbolOrThrow().getDeclarations()[0]!.getParentOrThrow();
      project.getLanguageService().findReferences(declaration.getNameNode());
    } finally {
      stack.splice(stack.lastIndexOf(scope), 1);
      for (const [name, original] of originals) factory[name] = original;
    }
    for (const name of NODE_FACTORY_METHODS)
      if (!hits.get(name)) return result(`ts-morph wrappers bypass CompilerFactory.${name}`);
    if (!scope.channels?.get('node-factory')?.has('/probe/base.ts'))
      return result('the node factory did not record the returned wrapper file');
    if (!scope.channels?.get('language-service')?.has('/probe/user.ts'))
      return result('findReferences does not reach the wrapped language service');
    return result();
  } catch (error) {
    return result(error instanceof Error ? error.message : String(error));
  }
}

/** One open scope of a semantic query. */
export class RecordingScope {
  private open = true;
  constructor(readonly scope: FootprintScope) {}

  /** The files-channel observer handed to the query's `TrackedFiles`. */
  readonly observe = (dependency: Parameters<FootprintScope['observe']>[0]): void =>
    this.scope.observe(dependency);

  /**
   * Closes the scope. In verify mode a recorder gap (a node read outside the footprint, or a
   * failure while recording) throws `SEMANTIC_RECORDER_GAP`; outside verify mode nothing throws.
   */
  close(assert: boolean = true): Footprint {
    this.dispose();
    const footprint = this.scope.seal();
    stack[stack.length - 1]?.merge(footprint);
    if (assert && this.scope.verify && this.scope.gaps.length)
      throw new SemanticFailure(
        'SEMANTIC_RECORDER_GAP',
        `${this.scope.kind} ${this.scope.key} read nodes outside its recorded footprint: ${[...new Set(this.scope.gaps)].join('; ')}`,
      );
    return footprint;
  }

  /** Removes the scope from the stack if it is still open. */
  dispose(): void {
    if (!this.open) return;
    this.open = false;
    const index = stack.lastIndexOf(this.scope);
    if (index >= 0) stack.splice(index, 1);
  }
}

/** A semantic service's recorder: its mode, and hook installation on each Project it queries. */
export class SemanticRecorder {
  /**
   * Why recording is off although the mode asks for it (the probe or an install failed). Once set
   * it is never cleared: this recorder then opens no scope again.
   */
  unavailable?: string;

  constructor(readonly mode: RecorderMode) {}

  /**
   * Installs the channels on the project's current program (idempotent; a re-created program gets
   * its checker wrapped here) and returns whether recording is available.
   */
  ensure(project: Project): boolean {
    if (this.mode === 'off') return false;
    // An install failure is sticky for this recorder: `unavailable` stays set and
    // no later call re-installs part of the channels.
    if (this.unavailable !== undefined) return false;
    const compatible = recorderCompatibility();
    if (!compatible.ok) {
      this.unavailable = compatible.reason;
      return false;
    }
    try {
      install(project);
    } catch (error) {
      this.unavailable = error instanceof Error ? error.message : String(error);
      return false;
    }
    if (this.mode === 'verify') installVerifyHooks();
    return true;
  }

  /** Opens a scope for one phase call, or undefined when recording is off or unavailable. */
  open(
    kind: FootprintScopeKind,
    key: string,
    project: Project | undefined,
  ): RecordingScope | undefined {
    if (!project || !this.ensure(project)) return undefined;
    const scope = new FootprintScope(kind, key, this.mode === 'verify');
    stack.push(scope);
    return new RecordingScope(scope);
  }
}

/** Test and diagnostics hook: the number of open scopes (0 between queries). */
export function openRecordingScopes(): number {
  return stack.length;
}

/**
 * Closes every scope and ends every suspension. For use between queries only, after a query was
 * terminated (V8's `vm` watchdog runs no `finally` block, so its scopes were never closed).
 */
export function resetRecording(): void {
  stack.length = 0;
  suspended = 0;
}
