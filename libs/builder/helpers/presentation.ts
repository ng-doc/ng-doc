import { isPresent } from '@ng-doc/core';

import { FunctionApi, TypeAliasApi, VariableApi } from './api';
import {
  ConstructorApi,
  GetAccessorApi,
  MethodApi,
  ParameterApi,
  SetAccessorApi,
} from './api/mappers';
import { formatCode } from './format-code';

/**
 *
 * @param constructor
 */
export function constructorPresentation(constructor: ConstructorApi): string {
  const parameters: string = constructor.parameters.map(parameterPresentation).join(', \n	');

  const presentation: string =
    [
      scopePresentation(constructor),
      `constructor(\n	${parameters}\n):`,
      `${constructor.returnType};`,
    ]
      .filter(isPresent)
      .join(' ') + ';';

  return formatCode(presentation, 'TypeScript');
}

/**
 *
 * @param accessor
 * @param type
 */
export function accessorPresentation(accessor: GetAccessorApi | SetAccessorApi): string {
  const parameters: string = (accessor.kind === 'set' ? accessor.parameters : [])
    .map(parameterPresentation)
    .join(', ');
  const header: string =
    accessor.kind === 'get' ? `${accessor.name}():` : `${accessor.name}(${parameters})`;
  const returnType: string = accessor.kind === 'get' ? accessor.returnType : '';

  const presentation: string =
    [staticPresentation(accessor), scopePresentation(accessor), accessor.kind, header, returnType]
      .filter(isPresent)
      .join(' ') + ';';

  return formatCode(presentation, 'TypeScript');
}

/**
 *
 * @param method
 */
export function methodPresentation(method: MethodApi): string {
  const parameters: string = method.parameters.map(parameterPresentation).join(', ');

  const presentation: string = [
    memberModifiers(method),
    staticPresentation(method),
    scopePresentation(method),
    `${method.name}(${parameters}):`,
    `${method.returnType};`,
  ]
    .filter(isPresent)
    .join(' ');

  return formatCode(presentation, 'TypeScript');
}

/**
 *
 * @param fn
 */
export function functionPresentation(fn: FunctionApi): string {
  const parameters: string = fn.parameters.map(parameterPresentation).join(', ');

  const presentation: string = ['function', `${fn.name}(${parameters}):`, `${fn.returnType};`]
    .filter(isPresent)
    .join(' ');

  return formatCode(presentation, 'TypeScript');
}

/**
 *
 * @param typeAlias
 */
export function typeAliasPresentation(typeAlias: TypeAliasApi): string {
  const presentation: string = `type ${typeAlias.name} = ${typeAlias.type};`;

  return formatCode(presentation, 'TypeScript');
}

/**
 *
 * @param variable
 */
export function variablePresentation(variable: VariableApi): string {
  const presentation: string = [variable.kind, `${variable.name}:`, `${variable.type};`]
    .filter(isPresent)
    .join(' ');

  return formatCode(presentation, 'TypeScript');
}

/**
 *
 * @param parameter
 */
function parameterPresentation(parameter: ParameterApi): string {
  return [
    decoratorsPresentation(parameter.decorators),
    modPresentation(parameter),
    parameter.name + (parameter.isOptional ? '?' : '') + ':',
    parameter.type,
    parameter.initializer ? `= ${parameter.initializer ?? ''}` : '',
  ]
    .filter(isPresent)
    .join(' ');
}

/**
 *
 * @param node
 * @param node.isProtected
 */
function scopePresentation(node: { isProtected: boolean }): string {
  return node.isProtected ? 'protected' : '';
}

/**
 *
 * @param node
 * @param node.isStatic
 */
function staticPresentation(node: { isStatic: boolean }): string {
  return node.isStatic ? 'static' : '';
}

/**
 *
 * @param member
 * @param member.isAbstract
 * @param member.isAsync
 */
function memberModifiers(member: { isAbstract: boolean; isAsync: boolean }): string {
  return [(member.isAbstract && 'abstract') || '', (member.isAsync && 'async') || '']
    .filter(isPresent)
    .join(' ');
}

/**
 *
 * @param node
 * @param node.isReadonly
 */
function modPresentation(node: { isReadonly: boolean }): string {
  return (node.isReadonly && 'readonly') || '';
}

/**
 *
 * @param decorators
 */
function decoratorsPresentation(decorators: string[]): string {
  return decorators.map((d) => `@${d}()`).join(' ');
}
