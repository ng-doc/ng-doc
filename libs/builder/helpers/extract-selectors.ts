import { Component, Directive } from '@angular/core';
import { Node } from 'ts-morph';

import { NgDocSupportedDeclaration } from '../types';
import { getComponentDecorator, getDirectiveDecorator } from './angular';

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
