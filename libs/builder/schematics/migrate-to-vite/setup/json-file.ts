import { Tree } from '@angular-devkit/schematics';
import {
  applyEdits,
  findNodeAtLocation,
  FormattingOptions,
  getNodeValue,
  modify,
  Node,
  ParseError,
  parseTree,
  printParseErrorCode,
} from 'jsonc-parser';

import { compareText } from '../../../helpers/text-order';

/** A path into a JSON document: property names and array indexes. */
export type JsonPath = Array<string | number>;

/**
 * Where `modify` inserts a new property: `undefined` keeps the properties sorted by name (as
 * ng-morph's `JSONFile` does), `false` appends, a function returns the index among the existing
 * property names.
 */
export type JsonInsertion = ((properties: string[]) => number) | false | undefined;

/**
 * The indentation and line ending the file already uses, so an edit keeps its layout. Files
 * without an indented line get two spaces.
 * @param content - The file's text.
 */
function formattingOf(content: string): FormattingOptions {
  const indented = /^([ \t]+)\S/m.exec(content)?.[1];
  const eol = content.includes('\r\n') ? '\r\n' : '\n';
  if (indented?.startsWith('\t')) return { insertSpaces: false, tabSize: 1, eol };
  return { insertSpaces: true, tabSize: indented?.length ?? 2, eol };
}

/**
 * A JSON file of the tree, read as JSONC the way the Angular CLI reads `angular.json`, Nx
 * `project.json` and tsconfig files: comments and trailing commas are accepted. Edits are applied
 * as text edits, so comments, key order and layout outside the edited value stay as they were.
 */
export class JsonFile {
  private content: string;
  private ast: Node | undefined;

  /**
   * Reads the file.
   * @param tree - The workspace tree.
   * @param path - The file, workspace-relative.
   */
  constructor(
    private readonly tree: Tree,
    readonly path: string,
  ) {
    if (!tree.exists(path)) throw new Error(`Could not read '${path}'.`);
    this.content = tree.readText(path);
  }

  private root(): Node | undefined {
    if (this.ast) return this.ast;
    const errors: ParseError[] = [];
    this.ast = parseTree(this.content, errors, {
      allowTrailingComma: true,
      disallowComments: false,
    });
    if (errors.length) {
      const { error, offset } = errors[0];
      throw new Error(`[${this.path}] ${printParseErrorCode(error)} at offset ${offset}.`);
    }
    return this.ast;
  }

  /**
   * The value at a path, or undefined.
   * @param path - The path; empty for the whole document.
   */
  get(path: JsonPath): unknown {
    const root = this.root();
    if (!root) return undefined;
    const node = path.length ? findNodeAtLocation(root, path) : root;
    return node ? getNodeValue(node) : undefined;
  }

  /**
   * Sets the value at a path (`undefined` removes it) and writes the file.
   * @param path - The path.
   * @param value - The new value.
   * @param insertion - Where a new property goes.
   */
  modify(path: JsonPath, value: unknown, insertion?: JsonInsertion): void {
    const property = path[path.length - 1];
    const getInsertionIndex =
      insertion === undefined
        ? (properties: string[]) =>
            [...properties, String(property)].sort(compareText).indexOf(String(property))
        : insertion === false
          ? undefined
          : insertion;
    const edits = modify(this.content, path, value, {
      getInsertionIndex,
      formattingOptions: formattingOf(this.content),
    });
    this.content = applyEdits(this.content, edits);
    this.ast = undefined;
    this.tree.overwrite(this.path, this.content);
  }

  /**
   * Removes the value at a path, if there is one.
   * @param path - The path.
   */
  remove(path: JsonPath): void {
    if (this.get(path) !== undefined) this.modify(path, undefined);
  }
}
