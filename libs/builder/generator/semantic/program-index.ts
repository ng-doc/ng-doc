import { type Project, ts } from 'ts-morph';

import { canonicalJson as stableJson, compareCodeUnits, digestOf } from '../kernel/canonical';
import { contentDigest } from '../kernel/footprint';
import { derivedClassList } from './derived-classes';
import { suspendRecording } from './recorder';

/**
 * The program index behind the recorded semantic closure: per-file facts of one TypeScript
 * program, each a pure function of that program, so a cold and an incremental generation compute
 * the same digests.
 *
 * - `content(F)`: the digest of F's text as the program read it.
 * - `token(F)`: F without comments and formatting (the printed AST, plus its triple-slash
 *   directives) for TypeScript sources; the content for everything else (declaration, JavaScript,
 *   JSX and JSON files, whose comments or pragmas can carry types).
 * - `exportSurface(B)`: `token(B)`, the export map of B (each exported name to the files and name
 *   of its resolved declaration) and the export map of every `export *` target of B, recursively,
 *   including targets that export nothing. It holds no target's type information.
 * - `typeClosure(F)`: `token(F)` and, per imported name, the export surfaces of the modules on the
 *   name's alias chain and the `typeClosure` of the declaring files; any other module reference
 *   (a namespace or side-effect import, an import type, a dynamic import or `require`, an import
 *   equals, a triple-slash path reference) contributes that module's surface and the closures of
 *   the module and of every declaration it exports. Cycles are condensed: every file of a strongly
 *   connected component gets the component's digest. Declaration files under `node_modules` are
 *   leaves: their content is in `env`.
 * - `env`: the TypeScript version, the compiler options, the caller's global program observations
 *   (tsconfig reads, formatter probes, type directives) and the content of every global-effect
 *   file: declaration files, scripts, and modules with `declare global` or an ambient
 *   `declare module`.
 * - the derived-class list of a class, as the API template renders it.
 *
 * - `dtsShape(F)`: F's declaration shape, the isolated declaration emit of a TypeScript source
 *   (`ts.transpileDeclaration`, comments removed) plus its enum declarations; the `token` of every
 *   other file, and of a source the isolated emit reports a diagnostic for (a type it cannot state
 *   without the checker, such as an inferred return type). The emit is given the program's
 *   type-affecting options (strictness included: TypeScript's defaults are not the program's), so
 *   it is a function of F's name, text and those options, and is memoized across programs.
 * - `shapeClosure(F)`: `typeClosure(F)` over declaration shapes: `dtsShape(F)` and, per imported
 *   name, the shape surfaces (`exportSurface` with `dtsShape` in place of `token`) of the modules
 *   on its chain and the `shapeClosure` of the declaring files. A body edit that keeps the
 *   declaration shapes keeps every `shapeClosure`.
 *
 * A unit's closure digest is `H(env, [(f, content(f), typeClosure(f)) for f in R], [(class,
 * derived list)])`. With shape closures (`NGDOC_SHAPE_CLOSURE`), every file of `R` takes
 * `shapeClosure(f)` in place of `typeClosure(f)`. `content(f)` stays, so whatever a query read of a
 * file itself (its initializers, parameter defaults, bodies, comments) is covered by its content;
 * only what it did not read, the files it merely depends on, is followed by shape. That is sound
 * as long as the recorder puts every file a query reads into `R` and a declaration shape states
 * everything an importer's types take from its file.
 * Everything is computed with recording suspended: the index is shared by every scope and must not
 * land in the footprint of whichever query asks first.
 */
export class ProgramIndex {
  private readonly checker: ts.TypeChecker;
  private environment?: string;
  private readonly contents = new Map<string, string>();
  private readonly tokens = new Map<string, string>();
  private readonly exportMaps = new Map<string, string>();
  private readonly surfaces = new Map<string, string>();
  private readonly stars = new Map<string, readonly string[]>();
  private readonly providers = new Map<string, readonly string[]>();
  private readonly facts = new Map<string, FileFacts>();
  private readonly closures = new Map<string, string>();
  private readonly shapes = new Map<string, string>();
  private readonly shapeSurfaces = new Map<string, string>();
  private readonly shapeClosures = new Map<string, string>();
  private shapeOptions?: { key: string; options: ts.CompilerOptions };
  private readonly derivedLists = new Map<string, string>();
  private readonly digests = new Map<string, string>();

  constructor(
    private readonly program: ts.Program,
    private readonly project: Project,
    private readonly observations: string,
  ) {
    this.checker = program.getTypeChecker();
  }

  /**
   * The closure digest of a scope that read `files` and the derived lists of `derived`: with
   * `shape` (shape closures on), each file's `shapeClosure` in place of its `typeClosure`.
   */
  closure(files: readonly string[], derived: readonly string[], shape: boolean = false): string {
    const key = JSON.stringify([files, derived, shape]);
    let digest = this.digests.get(key);
    if (digest === undefined) {
      digest = suspendRecording(() =>
        shape
          ? hash(
              'semantic-closure-shape-v1',
              this.env(),
              files.map((file) => [file, this.content(file), this.shapeClosure(file)]),
              derived.map((identity) => [identity, this.derivedList(identity)]),
            )
          : hash(
              'semantic-closure-v1',
              this.env(),
              files.map((file) => [file, this.content(file), this.typeClosure(file)]),
              derived.map((identity) => [identity, this.derivedList(identity)]),
            ),
      );
      this.digests.set(key, digest);
    }
    return digest;
  }

  env(): string {
    this.environment ??= suspendRecording(() =>
      hash(
        'env-v1',
        ts.version,
        stableJson(this.program.getCompilerOptions()),
        this.observations,
        this.program
          .getSourceFiles()
          .filter(globalEffect)
          .map((source) => [source.fileName, this.content(source.fileName)])
          .sort(([left], [right]) => compare(left, right)),
      ),
    );
    return this.environment;
  }

  content(file: string): string {
    let value = this.contents.get(file);
    if (value === undefined) {
      const source = this.program.getSourceFile(file);
      value = source ? contentDigest(source.text) : ABSENT;
      this.contents.set(file, value);
    }
    return value;
  }

  token(file: string): string {
    let value = this.tokens.get(file);
    if (value === undefined) {
      const source = this.program.getSourceFile(file);
      value = !source ? ABSENT : printable(source) ? printedToken(source) : this.content(file);
      this.tokens.set(file, value);
    }
    return value;
  }

  typeClosure(file: string): string {
    return (
      this.closures.get(file) ??
      suspendRecording(() => this.condense(file, this.closures, 'type-closure-v1', this.typeLocal))
    );
  }

  /** `typeClosure` over declaration shapes (see the class comment). */
  shapeClosure(file: string): string {
    return (
      this.shapeClosures.get(file) ??
      suspendRecording(() =>
        this.condense(file, this.shapeClosures, 'shape-closure-v1', this.shapeLocal),
      )
    );
  }

  /** The declaration shape of a file (see the class comment). */
  dtsShape(file: string): string {
    let value = this.shapes.get(file);
    if (value === undefined) {
      const source = this.program.getSourceFile(file);
      value = !source
        ? ABSENT
        : printable(source)
          ? declarationShape(source, this.declarationOptions(), () => this.token(file))
          : hash('dts-shape-v1', 'token', this.token(file));
      this.shapes.set(file, value);
    }
    return value;
  }

  /** The program's options the isolated declaration emit depends on, and their memo key. */
  private declarationOptions(): { key: string; options: ts.CompilerOptions } {
    if (!this.shapeOptions) {
      const all = this.program.getCompilerOptions();
      const options = Object.fromEntries(
        SHAPE_OPTIONS.filter((name) => all[name] !== undefined).map((name) => [name, all[name]]),
      ) as ts.CompilerOptions;
      this.shapeOptions = { key: stableJson(options), options };
    }
    return this.shapeOptions;
  }

  /** `exportSurface` with `dtsShape` in place of `token`. */
  shapeSurface(file: string): string {
    let value = this.shapeSurfaces.get(file);
    if (value === undefined) {
      value = suspendRecording(() =>
        hash(
          'shape-surface-v1',
          this.dtsShape(file),
          this.exportMap(file),
          this.starTargets(file).map((target) => [target, this.exportMap(target)]),
        ),
      );
      this.shapeSurfaces.set(file, value);
    }
    return value;
  }

  exportSurface(file: string): string {
    let value = this.surfaces.get(file);
    if (value === undefined) {
      value = suspendRecording(() =>
        hash(
          'surface-v1',
          this.token(file),
          this.exportMap(file),
          this.starTargets(file).map((target) => [target, this.exportMap(target)]),
        ),
      );
      this.surfaces.set(file, value);
    }
    return value;
  }

  private derivedList(identity: string): string {
    let value = this.derivedLists.get(identity);
    if (value === undefined) {
      value = derivedClassList(this.project, identity);
      this.derivedLists.set(identity, value);
    }
    return value;
  }

  /** Each exported name of a module, with the files and name of its resolved declaration. */
  private exportMap(file: string): string {
    let value = this.exportMaps.get(file);
    if (value === undefined) {
      const symbol = moduleSymbol(this.program.getSourceFile(file));
      value = symbol
        ? JSON.stringify(
            this.checker
              .getExportsOfModule(symbol)
              .map((exported) => {
                const target = this.resolveAlias(exported);
                return [
                  exported.getName(),
                  target ? target.getName() : UNRESOLVED,
                  target ? declarationFiles(target) : [],
                ];
              })
              .sort(([left], [right]) => compare(left as string, right as string)),
          )
        : NOT_A_MODULE;
      this.exportMaps.set(file, value);
    }
    return value;
  }

  /** The resolved files of every `export *` target of `file`, recursively, sorted. */
  private starTargets(file: string): readonly string[] {
    let value = this.stars.get(file);
    if (value === undefined) {
      const found = new Set<string>();
      const visit = (current: string): void => {
        const source = this.program.getSourceFile(current);
        if (!source) return;
        for (const statement of source.statements) {
          if (
            !ts.isExportDeclaration(statement) ||
            statement.exportClause ||
            !statement.moduleSpecifier ||
            !ts.isStringLiteralLike(statement.moduleSpecifier)
          )
            continue;
          for (const target of this.moduleFiles(statement.moduleSpecifier, source)) {
            if (found.has(target)) continue;
            found.add(target);
            visit(target);
          }
        }
      };
      visit(file);
      value = [...found].sort(compare);
      this.stars.set(file, value);
    }
    return value;
  }

  /** The files a module specifier resolves to: the resolved module, or an ambient module's files. */
  private moduleFiles(specifier: ts.StringLiteralLike, source: ts.SourceFile): string[] {
    const resolved = (
      this.program as unknown as ResolvingProgram
    ).getResolvedModuleFromModuleSpecifier?.(specifier, source)?.resolvedModule?.resolvedFileName;
    if (resolved && this.program.getSourceFile(resolved)) return [resolved];
    const symbol = this.checker.getSymbolAtLocation(specifier);
    return symbol ? declarationFiles(symbol) : [];
  }

  /**
   * The files declaring what a module exports (its export surface names any export that does not
   * resolve, so it needs no provider).
   */
  private exportProviders(module: string): readonly string[] {
    let value = this.providers.get(module);
    if (value === undefined) {
      const symbol = moduleSymbol(this.program.getSourceFile(module));
      const files = new Set<string>();
      for (const exported of symbol ? this.checker.getExportsOfModule(symbol) : []) {
        const target = this.resolveAlias(exported);
        if (target) declarationFiles(target).forEach((file) => files.add(file));
      }
      value = [...files].sort(compare);
      this.providers.set(module, value);
    }
    return value;
  }

  private resolveAlias(symbol: ts.Symbol): ts.Symbol | undefined {
    if (!(symbol.flags & ts.SymbolFlags.Alias)) return symbol;
    try {
      const target = this.checker.getAliasedSymbol(symbol);
      return target.flags & ts.SymbolFlags.Alias ? undefined : target;
    } catch {
      return undefined;
    }
  }

  /** The references and the successors of one file in the closure graphs. */
  private factsOf(file: string): FileFacts {
    let facts = this.facts.get(file);
    if (facts) return facts;
    const source = this.program.getSourceFile(file);
    if (!source) facts = { leaf: ABSENT, references: [], successors: [] };
    else if (source.isDeclarationFile && /[\\/]node_modules[\\/]/.test(file))
      facts = { leaf: LEAF, references: [], successors: [] };
    else facts = this.edges(source);
    this.facts.set(file, facts);
    return facts;
  }

  /** A file's local contribution to `typeClosure`: its token and its references' surfaces. */
  private readonly typeLocal = (file: string): string => {
    const facts = this.factsOf(file);
    return (
      facts.leaf ??
      hash(
        'local-v1',
        this.token(file),
        contributions(facts, (module) => this.exportSurface(module)),
      )
    );
  };

  /** A file's local contribution to `shapeClosure`: its shape and its references' shape surfaces. */
  private readonly shapeLocal = (file: string): string => {
    const facts = this.factsOf(file);
    return (
      facts.leaf ??
      hash(
        'shape-local-v1',
        this.dtsShape(file),
        contributions(facts, (module) => this.shapeSurface(module)),
      )
    );
  };

  private edges(source: ts.SourceFile): FileFacts {
    const references: Reference[] = [];
    const successors = new Set<string>();
    const named = new Set<ts.Node>();
    const moduleEdge = (module: string): void => {
      references.push(['module', module]);
      successors.add(module);
      for (const declaring of this.exportProviders(module)) successors.add(declaring);
    };
    const fallback = (specifier: ts.StringLiteralLike): void => {
      const modules = this.moduleFiles(specifier, source);
      if (!modules.length) references.push(['unresolved-module', specifier.text]);
      for (const module of modules) moduleEdge(module);
    };
    for (const statement of source.statements) {
      if (
        !ts.isImportDeclaration(statement) ||
        !ts.isStringLiteralLike(statement.moduleSpecifier) ||
        !statement.importClause
      )
        continue;
      const clause = statement.importClause;
      const bindings: ts.Identifier[] = [];
      if (clause.name) bindings.push(clause.name);
      if (clause.namedBindings && ts.isNamedImports(clause.namedBindings))
        clause.namedBindings.elements.forEach((element) => bindings.push(element.name));
      else if (clause.namedBindings) continue; // A namespace import: a module edge below.
      named.add(statement.moduleSpecifier);
      const modules = this.moduleFiles(statement.moduleSpecifier, source);
      for (const binding of bindings) {
        const resolved = this.namedEdge(binding, modules);
        if (!resolved) {
          named.delete(statement.moduleSpecifier);
          break;
        }
        references.push(['name', resolved.chain, resolved.providers]);
        resolved.providers.forEach((provider) => successors.add(provider));
      }
    }
    // Every other module reference of the file, in the program's own collection (imports and
    // re-exports, import types, dynamic imports and `require` calls, import equals).
    for (const specifier of (source as unknown as CollectedImports).imports ?? []) {
      if (named.has(specifier)) continue;
      const parent = specifier.parent;
      // A re-export binds nothing in this file; its targets are the export surface's concern.
      if (parent && ts.isExportDeclaration(parent)) continue;
      fallback(specifier);
    }
    for (const reference of source.referencedFiles) {
      // TypeScript's own resolution of the reference: program file names use forward slashes on
      // every platform, so resolving them with the host's path rules (backslashes and the current
      // drive on Windows) would miss the file.
      const target = this.program.getSourceFile(
        ts.resolveTripleslashReference(reference.fileName, source.fileName),
      );
      if (target) moduleEdge(target.fileName);
      else references.push(['unresolved-reference', reference.fileName]);
    }
    successors.delete(source.fileName);
    return { references, successors: [...successors].sort(compare) };
  }

  /**
   * One imported name: every module on its alias chain (whose surfaces it depends on), and the
   * files that declare the symbol the chain ends at. Undefined when the chain does not resolve.
   */
  private namedEdge(
    binding: ts.Identifier,
    modules: string[],
  ): { chain: string[]; providers: string[] } | undefined {
    const chain = new Set(modules);
    let link = this.checker.getSymbolAtLocation(binding);
    const seen = new Set<ts.Symbol>();
    while (link && link.flags & ts.SymbolFlags.Alias && !seen.has(link)) {
      seen.add(link);
      let next: ts.Symbol | undefined;
      try {
        next = this.checker.getImmediateAliasedSymbol(link);
      } catch {
        return undefined;
      }
      if (!next) return undefined;
      for (const declaration of next.declarations ?? []) {
        const specifier = aliasModuleSpecifier(declaration);
        if (specifier)
          this.moduleFiles(specifier, declaration.getSourceFile()).forEach((file) =>
            chain.add(file),
          );
      }
      link = next;
    }
    if (!link || link.flags & ts.SymbolFlags.Alias) return undefined;
    const declaring = declarationFiles(link);
    if (!declaring.length) return undefined;
    const providers = new Set(declaring);
    // The name is a namespace (`export * as ns from`, `import * as ns; export { ns }`, a
    // `declare module`): its members' types come from every export of that module, star targets
    // included, as for a namespace import.
    if (link.flags & ts.SymbolFlags.Module) {
      declaring.forEach((file) => chain.add(file));
      for (const exported of this.checker.getExportsOfModule(link)) {
        const target = this.resolveAlias(exported);
        if (target) declarationFiles(target).forEach((file) => providers.add(file));
      }
    }
    return { chain: [...chain].sort(compare), providers: [...providers].sort(compare) };
  }

  /**
   * Tarjan's algorithm from `root` over the files not condensed yet in `closures`; every component
   * gets `H(tag, its members and their local contributions, the digests of the components it
   * reaches)`.
   */
  private condense(
    root: string,
    closures: Map<string, string>,
    tag: string,
    local: (file: string) => string,
  ): string {
    const index = new Map<string, number>();
    const low = new Map<string, number>();
    const stack: string[] = [];
    const onStack = new Set<string>();
    const frames: Array<{ file: string; successors: readonly string[]; next: number }> = [];
    let counter = 0;
    const enter = (file: string): void => {
      index.set(file, counter);
      low.set(file, counter);
      counter++;
      stack.push(file);
      onStack.add(file);
      frames.push({ file, successors: this.factsOf(file).successors, next: 0 });
    };
    enter(root);
    while (frames.length) {
      const frame = frames[frames.length - 1]!;
      if (frame.next < frame.successors.length) {
        const successor = frame.successors[frame.next++]!;
        if (closures.has(successor)) continue;
        if (!index.has(successor)) enter(successor);
        else if (onStack.has(successor))
          low.set(frame.file, Math.min(low.get(frame.file)!, index.get(successor)!));
        continue;
      }
      frames.pop();
      if (low.get(frame.file) === index.get(frame.file)) {
        const members: string[] = [];
        let member: string;
        do {
          member = stack.pop()!;
          onStack.delete(member);
          members.push(member);
        } while (member !== frame.file);
        members.sort(compare);
        const inside = new Set(members);
        const reached = new Set<string>();
        for (const file of members)
          for (const successor of this.factsOf(file).successors)
            if (!inside.has(successor)) reached.add(closures.get(successor)!);
        const digest = hash(
          tag,
          members.map((file) => [file, local(file)]),
          [...reached].sort(compare),
        );
        for (const file of members) closures.set(file, digest);
      }
      const parent = frames[frames.length - 1];
      if (parent) low.set(parent.file, Math.min(low.get(parent.file)!, low.get(frame.file)!));
    }
    return closures.get(root)!;
  }
}

interface FileFacts {
  /** The fixed local contribution of a file outside the graph (absent, or a library declaration). */
  readonly leaf?: string;
  readonly references: readonly Reference[];
  readonly successors: readonly string[];
}

/**
 * One module reference of a file: an imported name (the modules on its chain, sorted, and its
 * declaring files), any other module reference, or a reference that did not resolve.
 */
type Reference =
  | readonly ['name', readonly string[], readonly string[]]
  | readonly ['module', string]
  | readonly ['unresolved-module', string]
  | readonly ['unresolved-reference', string];

/** The sorted, distinct contributions of a file's references, with `surface` for the modules. */
function contributions(facts: FileFacts, surface: (module: string) => string): string[] {
  const values = new Set<string>();
  for (const reference of facts.references)
    values.add(
      reference[0] === 'name'
        ? JSON.stringify([
            'name',
            reference[1].map((file) => `${file}:${surface(file)}`),
            reference[2],
          ])
        : reference[0] === 'module'
          ? JSON.stringify(['module', reference[1], surface(reference[1])])
          : JSON.stringify(reference),
    );
  return [...values].sort(compare);
}

interface ResolvingProgram {
  getResolvedModuleFromModuleSpecifier?(
    specifier: ts.StringLiteralLike,
    source: ts.SourceFile,
  ): { resolvedModule?: { resolvedFileName: string } } | undefined;
}

/** The module references TypeScript collected while creating the program (internal). */
interface CollectedImports {
  imports?: readonly ts.StringLiteralLike[];
}

const ABSENT = 'absent';
const LEAF = 'declaration-file';
const UNRESOLVED = '<unresolved>';
const NOT_A_MODULE = 'not-a-module';

const indexes = new WeakMap<ts.Program, ProgramIndex>();

/**
 * The index of the project's current program; a changed program (a FULL synchronization, or a
 * query that added a source file) gets a new one. `observations` digests the program's global
 * observations that `env` includes.
 */
export function programIndex(project: Project, observations: string): ProgramIndex {
  const program = project.getProgram().compilerObject;
  let index = indexes.get(program);
  if (!index) {
    index = new ProgramIndex(program, project, observations);
    indexes.set(program, index);
  }
  return index;
}

const compare = compareCodeUnits;

function hash(...parts: unknown[]): string {
  return digestOf(parts);
}

/** A module symbol of a source file (undefined for a script). */
function moduleSymbol(source: ts.SourceFile | undefined): ts.Symbol | undefined {
  return source ? (source as unknown as { symbol?: ts.Symbol }).symbol : undefined;
}

/** The sorted files of a symbol's declarations. */
function declarationFiles(symbol: ts.Symbol): string[] {
  return [
    ...new Set(
      (symbol.declarations ?? []).map((declaration) => declaration.getSourceFile().fileName),
    ),
  ].sort(compare);
}

/** The module an import or re-export declaration reads from. */
function aliasModuleSpecifier(declaration: ts.Node): ts.StringLiteralLike | undefined {
  for (let node: ts.Node | undefined = declaration, depth = 0; node && depth < 4; depth++) {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node))
      return node.moduleSpecifier && ts.isStringLiteralLike(node.moduleSpecifier)
        ? node.moduleSpecifier
        : undefined;
    if (ts.isImportEqualsDeclaration(node))
      return ts.isExternalModuleReference(node.moduleReference) &&
        ts.isStringLiteralLike(node.moduleReference.expression)
        ? node.moduleReference.expression
        : undefined;
    node = node.parent;
  }
  return undefined;
}

/** Files whose declarations are visible to every file of the program. */
function globalEffect(source: ts.SourceFile): boolean {
  if (source.isDeclarationFile) return true;
  if (/\.json$/i.test(source.fileName)) return false;
  if (!ts.isExternalModule(source)) return true;
  return source.statements.some(
    (statement) =>
      ts.isModuleDeclaration(statement) &&
      (!!(statement.flags & ts.NodeFlags.GlobalAugmentation) || ts.isStringLiteral(statement.name)),
  );
}

/** A TypeScript source whose comments carry no types: its token digest is its printed AST. */
function printable(source: ts.SourceFile): boolean {
  return !source.isDeclarationFile && /\.(ts|mts|cts)$/i.test(source.fileName);
}

const printer = ts.createPrinter({ removeComments: true, newLine: ts.NewLineKind.LineFeed });

/**
 * The options that change what the isolated declaration emit states about a declaration: the
 * strictness family (`null` and `undefined` initializers, optional properties), the target and
 * class field semantics, and decorators. A program's own values are passed as they are (an unset
 * option keeps TypeScript's default for both the program and the emit).
 */
const SHAPE_OPTIONS = [
  'strict',
  'strictNullChecks',
  'noImplicitAny',
  'exactOptionalPropertyTypes',
  'strictPropertyInitialization',
  'strictFunctionTypes',
  'strictBindCallApply',
  'noImplicitThis',
  'useUnknownInCatchVariables',
  'noUncheckedIndexedAccess',
  'target',
  'useDefineForClassFields',
  'experimentalDecorators',
] as const satisfies ReadonlyArray<keyof ts.CompilerOptions>;

/** Declaration shapes by options, file name and text digest (a shape is a function of the three). */
const declarationShapes = new Map<string, string>();
const DECLARATION_SHAPES_LIMIT = 50_000;

/**
 * The declaration shape of a TypeScript source: its isolated declaration emit without comments
 * and its enum declarations (the isolated emit drops an initializer it cannot evaluate, such as an
 * imported constant, where the checker's emit keeps the value). A source the isolated emit reports
 * a diagnostic for (it needs the checker to state a type) takes `token()` instead, so it narrows
 * nothing.
 */
function declarationShape(
  source: ts.SourceFile,
  emit: { key: string; options: ts.CompilerOptions },
  token: () => string,
): string {
  const key = `${emit.key}\0${source.fileName}\0${contentDigest(source.text)}`;
  let value = declarationShapes.get(key);
  if (value === undefined) {
    value = isolatedShape(source, emit.options) ?? hash('dts-shape-v1', 'token', token());
    if (declarationShapes.size >= DECLARATION_SHAPES_LIMIT) declarationShapes.clear();
    declarationShapes.set(key, value);
  }
  return value;
}

function isolatedShape(source: ts.SourceFile, options: ts.CompilerOptions): string | undefined {
  const emitted = ts.transpileDeclaration(source.text, {
    fileName: source.fileName,
    reportDiagnostics: true,
    compilerOptions: { ...options, removeComments: true, newLine: ts.NewLineKind.LineFeed },
  });
  if (emitted.diagnostics?.length) return undefined;
  const enums: string[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isEnumDeclaration(node))
      enums.push(printer.printNode(ts.EmitHint.Unspecified, node, source));
    else ts.forEachChild(node, visit);
  };
  visit(source);
  return hash('dts-shape-v1', 'dts', emitted.outputText, enums);
}

function printedToken(source: ts.SourceFile): string {
  try {
    return hash(
      'token-v1',
      printer.printFile(source),
      source.referencedFiles.map((reference) => reference.fileName),
      source.typeReferenceDirectives.map((reference) => [
        reference.fileName,
        reference.resolutionMode ?? null,
      ]),
      source.libReferenceDirectives.map((reference) => reference.fileName),
    );
  } catch {
    return contentDigest(source.text);
  }
}
