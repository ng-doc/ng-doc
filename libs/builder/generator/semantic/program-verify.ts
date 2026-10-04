import { type Project, ts } from 'ts-morph';

import { classIdentity, derivedClassList } from './derived-classes';
import { ProgramIndex } from './program-index';
import { suspendRecording } from './recorder';

/**
 * The semantic facts of a program that `NGDOC_INCREMENTAL_PROGRAM=verify` compares between a
 * patched program and a cold synchronization of the same tree, beyond the observations, root names
 * and texts: what the queries read through the checker, which a stale cache on an object a patched
 * program reused (a symbol of an unchanged file) would change.
 *
 * For every workspace file of the program (not a default library, not under `node_modules`), in
 * program order:
 * - the program index facts: `token`, `exportSurface`, `typeClosure`, `dtsShape` and
 *   `shapeClosure` (and `env` once);
 * - the documentation TypeScript gives every export and every member of it (inherited
 *   documentation included), with its tags;
 * - the derived-class list of every top-level class, as the API template renders it.
 *
 * A fresh index is built for each program (never the shared one of `programIndex`, whose
 * observations digest the closures of the generation use). Everything runs with recording
 * suspended.
 */
export function programFacts(project: Project): Array<[string, string]> {
  return suspendRecording(() => {
    const program = project.getProgram().compilerObject;
    const checker = program.getTypeChecker();
    const index = new ProgramIndex(program, project, 'verify');
    const facts: Array<[string, string]> = [['env', index.env()]];
    for (const source of program.getSourceFiles()) {
      const file = source.fileName;
      if (file.includes('/node_modules/') || program.isSourceFileDefaultLibrary(source)) continue;
      facts.push(
        [`${file} token`, index.token(file)],
        [`${file} surface`, index.exportSurface(file)],
        [`${file} closure`, index.typeClosure(file)],
        [`${file} shape`, index.dtsShape(file)],
        [`${file} shape closure`, index.shapeClosure(file)],
      );
      const module = checker.getSymbolAtLocation(source);
      for (const exported of module ? checker.getExportsOfModule(module) : []) {
        const symbol =
          exported.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(exported) : exported;
        facts.push([`${file}#${exported.name} docs`, documentation(symbol, checker)]);
        symbol.members?.forEach((member, name) =>
          facts.push([
            `${file}#${exported.name}.${String(name)} docs`,
            documentation(member, checker),
          ]),
        );
      }
      for (const statement of source.statements)
        if (ts.isClassDeclaration(statement) && statement.name)
          facts.push([
            `${file}#${statement.name.text} derived`,
            derivedClassList(project, classIdentity(statement)),
          ]);
    }
    return facts;
  });
}

function documentation(symbol: ts.Symbol, checker: ts.TypeChecker): string {
  try {
    return JSON.stringify([
      ts.displayPartsToString(symbol.getDocumentationComment(checker)),
      symbol.getJsDocTags(checker).map((tag) => [tag.name, ts.displayPartsToString(tag.text)]),
    ]);
  } catch (error) {
    return `failed: ${error instanceof Error ? error.message : String(error)}`;
  }
}

/** The first fact whose name or value differs, or undefined when the two lists are equal. */
export function firstFactDifference(
  left: ReadonlyArray<readonly [string, string]>,
  right: ReadonlyArray<readonly [string, string]>,
): string | undefined {
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index++) {
    const [name, value] = left[index] ?? ['(none)', ''];
    const [coldName, coldValue] = right[index] ?? ['(none)', ''];
    if (name !== coldName) return `fact ${index} is ${name}, cold ${coldName}`;
    if (value !== coldValue) return `${name} differs`;
  }
  return undefined;
}
