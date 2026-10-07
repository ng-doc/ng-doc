import { NgDocPage } from '@ng-doc/core';
import { Node, ObjectLiteralExpression } from 'ts-morph';
import { describe, expect, it } from 'vitest';

import { createProject } from '../../../../helpers/typescript/create-project';
import { getPlaygroundMetadata } from '../get-playground-metadata';

const COMPONENT = `
import { Component, Input } from '@angular/core';

@Component({ selector: 'app-box', template: '' })
export class Box {
  @Input() size: 'small' | 'large' = 'small';
  @Input() label = '';
}
`;

const PAGE = `
import { Box } from './box';

export default {
  title: 'Box',
  mdFile: './index.md',
  playgrounds: { BoxPlayground: { target: Box, template: '<ng-doc-selector></ng-doc-selector>' } },
};
`;

/** The page's object literal, as the legacy page builder reads it. */
function pageObject(): ObjectLiteralExpression {
  const project = createProject({ compilerOptions: { experimentalDecorators: true } });

  project.createSourceFile('box.ts', COMPONENT, { overwrite: true });
  const page = project.createSourceFile('ng-doc.page.ts', PAGE, { overwrite: true });
  project.resolveSourceFileDependencies();
  const object = page.getExportAssignmentOrThrow(() => true).getExpression();

  if (!Node.isObjectLiteralExpression(object)) {
    throw new Error('The page is not an object literal');
  }

  return object;
}

describe('getPlaygroundMetadata', () => {
  it('replaces a detected control with an entry of the controls that has a type', () => {
    const page = {
      playgrounds: { BoxPlayground: { controls: { label: { type: 'Label', label: 'Caption' } } } },
    } as unknown as NgDocPage;

    expect(getPlaygroundMetadata(page, pageObject())['BoxPlayground'].properties).toEqual({
      size: expect.objectContaining({ type: "'small' | 'large'" }),
      label: {
        inputName: 'label',
        type: 'Label',
        description: undefined,
        options: undefined,
        isManual: true,
      },
    });
  });

  it('keeps the detected control of an input whose entry has no type', () => {
    const page = {
      playgrounds: { BoxPlayground: { controls: { size: { label: 'Size', group: 'Look' } } } },
    } as unknown as NgDocPage;
    const properties = getPlaygroundMetadata(page, pageObject())['BoxPlayground'].properties;

    expect(properties['size']).toMatchObject({
      inputName: 'size',
      type: "'small' | 'large'",
      options: ["'small'", "'large'"],
    });
    expect(properties['size']).not.toHaveProperty('isManual');
  });
});
