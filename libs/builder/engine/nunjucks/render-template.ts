import { objectKeys } from '@ng-doc/core';
import * as fs from 'fs';
import { Environment, ILoader, LoaderSource } from 'nunjucks';
import * as path from 'path';
import { Node } from 'ts-morph';

import { ObservableSet } from '../../classes';
import { NgDocRendererOptions } from '../../interfaces';
import { TEMPLATES_PATH } from '../variables';
import { NgDocIndexExtension } from './extentions';
import * as filters from './filters';

class NgDocRelativeLoader implements ILoader {
  constructor(
    private readonly path: string,
    private readonly dependenciesStore?: ObservableSet<string>,
  ) {}

  getSource(name: string): LoaderSource {
    const fullPath: string = path.join(this.path, name);

    this.dependenciesStore?.add(fullPath);

    return {
      src: fs.readFileSync(fullPath, 'utf-8'),
      path: fullPath,
      noCache: true,
    };
  }
}

/**
 *
 * @param scope
 * @param dependencies
 */
function getEnvironment(scope: string, dependencies?: ObservableSet<string>): Environment {
  let environment: Environment = new Environment(new NgDocRelativeLoader(scope, dependencies), {
    autoescape: false,
  });

  objectKeys(filters).forEach(
    (filter: keyof typeof filters) =>
      (environment = environment.addFilter(filter, filters[filter])),
  );

  environment.addGlobal('Node', Node);
  environment.addExtension('NgDocIndexExtension', new NgDocIndexExtension());

  return environment;
}

/**
 * Renders a template with the given options via Nunjucks.
 * @param template - The template path to render.
 * @param options - The options to render the template with.
 */
export function renderTemplate<T extends object>(
  template: string,
  options?: NgDocRendererOptions<T>,
): string {
  const environment: Environment = getEnvironment(
    options?.scope ?? TEMPLATES_PATH,
    options?.dependencies,
  );

  return environment.render(template, options?.context);
}

/**
 * Renders a template string with the given options via Nunjucks.
 * @param template - The template string to render.
 * @param options - The options to render the template with.
 */
export function renderTemplateString<T extends object>(
  template: string,
  options: NgDocRendererOptions<T>,
): string {
  const environment: Environment = getEnvironment(
    options?.scope ?? TEMPLATES_PATH,
    options?.dependencies,
  );

  return environment.renderString(template, options?.context ?? {});
}
