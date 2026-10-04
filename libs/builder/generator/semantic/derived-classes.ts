import { type ClassDeclaration, type Project, Node, SyntaxKind, ts } from 'ts-morph';

import { recordDerivedQuery, suspendRecording } from './recorder';

/**
 * One heritage index per TypeScript program for the API "See Also" section.
 *
 * ts-morph `ClassDeclaration#getDerivedClasses()` runs a language-service `findReferences`
 * for the class and then again for every class it finds, so a base class with N subclasses
 * costs N + 1 whole-program reference searches (apps/ng-doc: 658 page subclasses of
 * `NgDocRootPage`, about 16 s for one page).
 *
 * The index is built in one pass over the class declarations of the program. It records, for
 * every `extends` clause, each identifier that ts-morph would accept as the reference to the
 * base class (the expression itself, or any name in a property-access chain) both by text and
 * by the declarations its symbol resolves to through any import/export aliases. A class that
 * appears in neither set cannot be returned by a reference search: TypeScript reports only
 * identifiers that bind to the searched symbol, directly or through an alias. Such a class has
 * no derived classes, and no reference search runs for it.
 *
 * A class that the index marks may have subclasses keeps the exact ts-morph lookup, so the
 * result, including its order (which follows TypeScript's reference-group order), is the one
 * `getDerivedClasses()` returns.
 */
export class DerivedClassIndex {
  private readonly names = new Set<string>();
  private readonly targets = new WeakSet<ts.Node>();

  constructor(program: ts.Program) {
    const checker = program.getTypeChecker();
    const record = (identifier: ts.Identifier): void => {
      this.names.add(identifier.text);
      let symbol = checker.getSymbolAtLocation(identifier);
      const seen = new Set<ts.Symbol>();
      while (symbol && !seen.has(symbol)) {
        seen.add(symbol);
        symbol.declarations?.forEach((declaration) => this.targets.add(declaration));
        symbol = symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : undefined;
      }
    };
    const referenceNames = (expression: ts.Expression): void => {
      if (ts.isIdentifier(expression)) record(expression);
      else if (ts.isPropertyAccessExpression(expression)) {
        if (ts.isIdentifier(expression.name)) record(expression.name);
        referenceNames(expression.expression);
      }
    };
    const visit = (node: ts.Node): void => {
      if (ts.isClassDeclaration(node))
        for (const clause of node.heritageClauses ?? [])
          if (clause.token === ts.SyntaxKind.ExtendsKeyword)
            clause.types.forEach((type) => referenceNames(type.expression));
      ts.forEachChild(node, visit);
    };
    for (const source of program.getSourceFiles())
      if (source.text.includes('extends')) visit(source);
  }

  /** False only when no reference search can find a class deriving from `declaration`. */
  mayHaveDerivedClasses(declaration: ClassDeclaration): boolean {
    const name = declaration.getNameNode();
    if (!name) return false;
    return this.names.has(name.compilerNode.text) || this.targets.has(declaration.compilerNode);
  }
}

const indexes = new WeakMap<ts.Program, DerivedClassIndex>();

/**
 * The index of the project's current program; a changed program gets a new index. It is a shared
 * index, so it is built with recording suspended: the one pass over every class would otherwise
 * land in the footprint of whichever unit happens to render first.
 *
 * Its answers are NOT covered by the unit's footprint. A `true` is followed by the recorded
 * reference search, but a `false` ("no subclass can exist") depends on the heritage clauses of
 * every file in the program: adding `class Sub extends Lone` anywhere changes `Lone`'s See Also
 * while `R(Lone)` does not contain that file. The scope records the class instead
 * (`recordDerivedQuery`), and its semantic closure recomputes the list (`derivedClassList`); the
 * index must not be turned into a replayed `recordedAnswer`, whose footprint could not state it.
 */
export function derivedClassIndex(project: Project): DerivedClassIndex {
  const program = project.getProgram().compilerObject;
  let index = indexes.get(program);
  if (!index) {
    index = suspendRecording(() => new DerivedClassIndex(program));
    indexes.set(program, index);
  }
  return index;
}

/** ts-morph's `getImmediateDerivedClasses` (28.0.0), unchanged. */
function immediateDerivedClasses(declaration: ClassDeclaration): ClassDeclaration[] {
  const classes: ClassDeclaration[] = [];
  const nameNode = declaration.getNameNode();
  if (nameNode == null) return classes;
  for (let node of nameNode.findReferencesAsNodes() as Node[]) {
    node = node.getParentWhileKind(SyntaxKind.PropertyAccessExpression) ?? node;
    const nodeParent = node.getParentIfKind(SyntaxKind.ExpressionWithTypeArguments);
    if (nodeParent == null) continue;
    const heritageClause = nodeParent.getParentIfKind(SyntaxKind.HeritageClause);
    if (heritageClause == null || heritageClause.getToken() !== SyntaxKind.ExtendsKeyword) continue;
    const derivedClass = heritageClause.getParentIfKind(SyntaxKind.ClassDeclaration);
    if (derivedClass == null) continue;
    classes.push(derivedClass);
  }
  return classes;
}

/** Same result and order as ts-morph `getDerivedClasses()`, without searches for leaf classes. */
export function getDerivedClasses(
  declaration: ClassDeclaration,
  index: DerivedClassIndex,
): ClassDeclaration[] {
  const immediate = (value: ClassDeclaration): ClassDeclaration[] =>
    index.mayHaveDerivedClasses(value) ? immediateDerivedClasses(value) : [];
  const classes = immediate(declaration);
  const listed = new Set(classes);
  for (let i = 0; i < classes.length; i++) {
    for (const derivedClass of immediate(classes[i])) {
      if (derivedClass !== declaration && !listed.has(derivedClass)) {
        listed.add(derivedClass);
        classes.push(derivedClass);
      }
    }
  }
  return classes;
}

/** The identity of a class for the semantic closure: its file and start position. */
export function classIdentity(declaration: ts.ClassDeclaration): string {
  return `${declaration.getSourceFile().fileName}#${declaration.getStart()}`;
}

/**
 * The derived-class list of the class `identity` names in the project's current program, as it
 * would be rendered (order included): each class's identity and name. `absent` when no class
 * starts there. Callers run it with recording suspended.
 */
export function derivedClassList(project: Project, identity: string): string {
  const separator = identity.lastIndexOf('#');
  const start = Number(identity.slice(separator + 1));
  const source = project.getSourceFile(identity.slice(0, separator));
  let node: Node | undefined = source?.getDescendantAtPos(start);
  while (node && !(Node.isClassDeclaration(node) && node.getStart() === start))
    node = node.getParent();
  if (!node || !Node.isClassDeclaration(node)) return 'absent';
  return JSON.stringify(
    getDerivedClasses(node, derivedClassIndex(project)).map((derived) => [
      classIdentity(derived.compilerNode),
      derived.compilerNode.name?.text ?? '',
    ]),
  );
}

/**
 * Runs `render` while `declaration.getDerivedClasses()` is served from the program index.
 *
 * The shared API templates call that method directly and are shared with the legacy engine,
 * so the modern engine changes the value it supplies rather than the template.
 */
export function withIndexedDerivedClasses<T>(
  declaration: Node,
  project: Project,
  render: () => T,
): T {
  if (!Node.isClassDeclaration(declaration) || Object.hasOwn(declaration, 'getDerivedClasses'))
    return render();
  Object.defineProperty(declaration, 'getDerivedClasses', {
    configurable: true,
    value: () =>
      recordDerivedQuery(classIdentity(declaration.compilerNode), () =>
        getDerivedClasses(declaration, derivedClassIndex(project)),
      ),
  });
  try {
    return render();
  } finally {
    delete (declaration as Partial<Pick<ClassDeclaration, 'getDerivedClasses'>>).getDerivedClasses;
  }
}
