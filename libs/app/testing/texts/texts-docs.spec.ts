/**
 * @vitest-environment node
 */

import { NG_DOC_DEFAULT_TEXTS } from '@ng-doc/app/tokens';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as ts from 'typescript';
import { describe, expect, it } from 'vitest';

import { workspaceRoot } from '../styles/css-surface';

const root = workspaceRoot();

// The doc comments of the text interfaces are the reference of the texts: the API reference and
// the UI texts guide show them. Each states the English default, so it must follow the value.
const SOURCES = ['libs/ui-kit/texts/texts.interfaces.ts', 'libs/app/interfaces/texts.ts'];

/** The doc comment of every property of every interface in the sources, by interface name. */
function interfaceDocs(): Map<string, Map<string, { type: string; doc: string }>> {
  const interfaces = new Map<string, Map<string, { type: string; doc: string }>>();

  for (const path of SOURCES) {
    const source = ts.createSourceFile(
      path,
      readFileSync(join(root, path), 'utf8'),
      ts.ScriptTarget.Latest,
      true,
    );

    for (const statement of source.statements) {
      if (!ts.isInterfaceDeclaration(statement)) continue;
      const members = new Map<string, { type: string; doc: string }>();

      for (const member of statement.members) {
        if (!ts.isPropertySignature(member) || !member.type) continue;
        const doc = ts
          .getJSDocCommentsAndTags(member)
          .map((node: ts.Node) => node.getText())
          .join(' ')
          .replace(/^\s*\/\*\*|\*\/\s*$|^\s*\*/gm, '')
          .replace(/\s+/g, ' ')
          .trim();

        members.set(member.name.getText(), { type: member.type.getText(), doc });
      }
      interfaces.set(statement.name.text, members);
    }
  }

  return interfaces;
}

describe('the doc comments of NgDocTexts', () => {
  const interfaces = interfaceDocs();
  const groups = new Map([
    ...(interfaces.get('NgDocUiKitTexts') ?? []),
    ...(interfaces.get('NgDocTexts') ?? []),
  ]);

  it('list exactly the groups and texts of the defaults', () => {
    const documented = [...groups].map(([group, { type }]) => [
      group,
      [...(interfaces.get(type)?.keys() ?? [])].sort(),
    ]);
    const defaults = Object.entries(NG_DOC_DEFAULT_TEXTS).map(([group, texts]) => [
      group,
      Object.keys(texts).sort(),
    ]);

    expect(Object.fromEntries(documented)).toEqual(Object.fromEntries(defaults));
  });

  it('state the default of every text', () => {
    const wrong: string[] = [];

    for (const [group, { type }] of groups) {
      for (const [key, { doc }] of interfaces.get(type) ?? []) {
        const value: unknown = (NG_DOC_DEFAULT_TEXTS as unknown as Record<string, object>)[group][
          key as never
        ];
        const stated: boolean =
          typeof value === 'string'
            ? doc.includes(`Default: "${value}"`)
            : doc.includes('Default:');

        if (!stated) wrong.push(`${group}.${key}`);
      }
    }

    expect(wrong).toEqual([]);
  });
});
