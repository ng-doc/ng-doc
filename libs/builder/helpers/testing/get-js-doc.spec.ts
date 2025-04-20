import { Project, SourceFile } from 'ts-morph';

import {
  getJsDocDescription,
  getJsDocParam,
  getJsDocTag,
  getJsDocTags,
  hasJsDocTag,
} from '../get-js-doc';
import { createProject } from '../typescript/create-project';

describe('presentation', () => {
  let project: Project;

  beforeEach(() => {
    project = createProject({
      useInMemoryFileSystem: true,
      compilerOptions: {
        strict: true,
      },
    });
  });

  describe('getJsDocDescription', () => {
    it('should return description', () => {
      const sourceFile: SourceFile = project.createSourceFile(
        'code.ts',
        `
				/**
				* Test class
        */
        export class Test {}
			`,
      );
      const declaration = sourceFile.getClassOrThrow('Test');

      expect(getJsDocDescription(declaration)).toBe('<p>Test class</p>');
    });

    it('should not return status tag in description', () => {
      const sourceFile: SourceFile = project.createSourceFile(
        'code.ts',
        `
        /**
        * Test class
        *
        * @status:warning Test status
        */
        export class Test {}
      `,
      );
      const declaration = sourceFile.getClassOrThrow('Test');

      expect(getJsDocDescription(declaration)).toBe('<p>Test class</p>');
    });

    it('should not return status tag in description, even if part of paragraph', () => {
      const sourceFile: SourceFile = project.createSourceFile(
        'code.ts',
        `
        /**
        * Test class
        * @status:warning Test status
        */
        export class Test {}
      `,
      );
      const declaration = sourceFile.getClassOrThrow('Test');

      expect(getJsDocDescription(declaration)).toBe('<p>Test class</p>');
    });
  });

  describe('getJsDocTag', () => {
    it('should return description', () => {
      const sourceFile: SourceFile = project.createSourceFile(
        'code.ts',
        `
        /**
        * Test class
        * @usageNotes
        * Test usage notes
        */
        export class Test {}
      `,
      );
      const declaration = sourceFile.getClassOrThrow('Test');

      expect(getJsDocTag(declaration, 'usageNotes')).toBe('<p>Test usage notes</p>');
    });
  });

  describe('getJsDocTags', () => {
    it('should return description', () => {
      const sourceFile: SourceFile = project.createSourceFile(
        'code.ts',
        `
        /**
        * Test class
        * @see Page1
        * @see Page2
        */
        export class Test {}
      `,
      );
      const declaration = sourceFile.getClassOrThrow('Test');

      expect(getJsDocTags(declaration, 'see')).toEqual(['<p>Page1</p>', '<p>Page2</p>']);
    });
  });

  describe('hasJsDocTag', () => {
    it('should return true if tag exists', () => {
      const sourceFile: SourceFile = project.createSourceFile(
        'code.ts',
        `
        /**
        * Test class
        * @usageNotes
        * Test usage notes
        */
        export class Test {}
      `,
      );
      const declaration = sourceFile.getClassOrThrow('Test');

      expect(hasJsDocTag(declaration, 'usageNotes')).toBe(true);
    });

    it('should return false if tag does not exist', () => {
      const sourceFile: SourceFile = project.createSourceFile(
        'code.ts',
        `
        /**
        * Test class
        */
        export class Test {}
      `,
      );
      const declaration = sourceFile.getClassOrThrow('Test');

      expect(hasJsDocTag(declaration, 'usageNotes')).toBe(false);
    });
  });

  describe('getJsDocParam', () => {
    it('should return description with "-" delimiter', () => {
      const sourceFile: SourceFile = project.createSourceFile(
        'code.ts',
        `
        export class Test {

          /**
          * Method description
          * @param param1 - Test param1
          */
          test(param1: string) {}
        }
      `,
      );
      const declaration = sourceFile.getClassOrThrow('Test');
      const method = declaration.getMethodOrThrow('test');

      expect(getJsDocParam(method, 'param1')).toBe('<p>Test param1</p>');
    });

    it('should return description with " " delimiter', () => {
      const sourceFile: SourceFile = project.createSourceFile(
        'code.ts',
        `
        export class Test {

          /**
          * Method description
          * @param param1 Test param1
          */
          test(param1: string) {}
        }
      `,
      );
      const declaration = sourceFile.getClassOrThrow('Test');
      const method = declaration.getMethodOrThrow('test');

      expect(getJsDocParam(method, 'param1')).toBe('<p>Test param1</p>');
    });
  });
});
