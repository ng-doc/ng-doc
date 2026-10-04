import { Component, Directive, Pipe } from '@angular/core';
import { Node } from 'ts-morph';

import type { NgDocSupportedDeclaration } from '../types/supported-declaration';
import { getComponentDecorator } from './angular/get-component-decorator';
import { getDirectiveDecorator } from './angular/get-directive-decorator';
import { getPipeDecorator } from './angular/get-pipe-decorator';

/**
 *
 * @param declaration
 */
export function extractSelectors(declaration: NgDocSupportedDeclaration): string[] {
  if (Node.isClassDeclaration(declaration)) {
    const decorator: Component | Directive | undefined =
      getComponentDecorator(declaration) ?? getDirectiveDecorator(declaration);

    if (decorator) {
      return decorator.selector?.split(',').map((s: string) => s.trim()) ?? [];
    }
  }

  return [];
}

/**
 *
 * @param declaration
 */
export function getPipeName(declaration: NgDocSupportedDeclaration): string | undefined {
  if (Node.isClassDeclaration(declaration)) {
    const decorator: Pipe | undefined = getPipeDecorator(declaration);

    if (decorator) {
      return decorator.name;
    }
  }

  return undefined;
}
