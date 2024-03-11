import { NgDocBuilderContext } from '../../../interfaces';
import { NgDocSupportedDeclaration } from '../../../types';
import { Builder } from '../../core';

interface Config {
  context: NgDocBuilderContext;
  declaration: NgDocSupportedDeclaration;
}

/**
 *
 * @param config
 */
export function apiBuilder(config: Config): Builder<string> {
  const { context, declaration } = config;

  return;
}
