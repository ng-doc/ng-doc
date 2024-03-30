import { DecoratorStructure, OptionalKind } from 'ts-morph';

/**
 *
 * @param decorators
 */
export function mapDecorators(decorators: Array<OptionalKind<DecoratorStructure>>): string[] {
  return decorators.map(({ name }) => name);
}
