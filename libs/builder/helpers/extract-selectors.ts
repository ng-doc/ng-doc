import { Component, Directive, Pipe } from '@angular/core';
import { Node } from 'ts-morph';

import { NgDocSupportedDeclaration } from '../types';
import { getComponentDecorator, getDirectiveDecorator, getPipeDecorator } from './angular';

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
