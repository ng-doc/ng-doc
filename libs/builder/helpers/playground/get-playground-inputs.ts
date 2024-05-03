import { NgDocPlaygroundProperties } from '@ng-doc/core';
import {
  ClassDeclaration,
  Node,
  ParameterDeclaration,
  SyntaxKind,
  Type,
  TypeFormatFlags,
} from 'ts-morph';

import { getComponentInputs, getInputName, getInputType, NgDocInputDeclaration } from '../angular';
import { getJsDocDescription, getJsDocParam } from '../get-js-doc';
import { formatType } from '../typescript';

/**
 *
 * @param declaration
 */
export function getPlaygroundComponentInputs(
  declaration: ClassDeclaration,
): NgDocPlaygroundProperties {
  return getComponentInputs(declaration).reduce(
    (properties: NgDocPlaygroundProperties, property: NgDocInputDeclaration) => {
      const inputName: string = getInputName(property);
      return { ...properties, ...propOrParamToPlaygroundProperty(property, inputName) };
    },
    {},
  );
}

/**
 *
 * @param declaration
 */
export function getPlaygroundPipeInputs(declaration: ClassDeclaration): NgDocPlaygroundProperties {
  return declaration
    .getMethodOrThrow('transform')
    .getParameters()
    .slice(1)
    .reduce((properties: NgDocPlaygroundProperties, parameter: ParameterDeclaration) => {
      return { ...properties, ...propOrParamToPlaygroundProperty(parameter) };
    }, {});
}

/**
 *
 * @param propOrParam
 * @param inputName
 */
function propOrParamToPlaygroundProperty(
  propOrParam: NgDocInputDeclaration | ParameterDeclaration,
  inputName?: string,
): NgDocPlaygroundProperties {
  const inputType = Node.isPropertyDeclaration(propOrParam)
    ? getInputType(propOrParam)
    : propOrParam.getType();
  const type: string = formatType(
    inputType,
    TypeFormatFlags.NoTruncation | TypeFormatFlags.UseSingleQuotesForStringLiteralType,
  );

  return {
    [propOrParam.getName()]: {
      inputName: inputName ?? propOrParam.getName(),
      type,
      description:
        Node.isPropertyDeclaration(propOrParam) ||
        Node.isGetAccessorDeclaration(propOrParam) ||
        Node.isSetAccessorDeclaration(propOrParam)
          ? getJsDocDescription(propOrParam)
          : getJsDocParam(
              propOrParam.getParentIfKindOrThrow(SyntaxKind.MethodDeclaration),
              propOrParam.getName(),
            ),
      options: inputType
        .getUnionTypes()
        .map((type: Type) =>
          type.getText(
            undefined,
            TypeFormatFlags.NoTruncation | TypeFormatFlags.UseSingleQuotesForStringLiteralType,
          ),
        ),
    },
  };
}
