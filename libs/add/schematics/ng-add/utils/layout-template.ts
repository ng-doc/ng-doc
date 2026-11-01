import { Tree } from '@angular-devkit/schematics';
import { ClassDeclaration, Expression, Node } from 'ng-morph';

import { getAppComponent } from './get-app-component';
import { getAppTemplatePath } from './get-app-template-path';
import { getInitializer } from './get-initializer';

/**
 * What `ng add` does with the root component's template:
 * - `replace`: the template is Angular's `ng new` placeholder, empty or only a router outlet, so
 *   it is replaced with the NgDoc layout;
 * - `has-layout`: it already renders `ng-doc-root`;
 * - `keep`: it is the application's own (or inline), so it is left as it is and the layout is
 *   added by hand, for example in the component of a lazy documentation route;
 * - `missing`: the root component or its template file can't be found.
 */
export type LayoutTemplateAction = 'replace' | 'has-layout' | 'keep' | 'missing';

/** A template that `ng add` replaces with the layout. */
interface ReplacedLayoutTemplate {
  action: 'replace';
  /** The template file. */
  path: string;
}

/** A template that `ng add` leaves as it is, or that it can't find. */
interface KeptLayoutTemplate {
  action: Exclude<LayoutTemplateAction, 'replace'>;
  /** The template file, unless the template is inline or missing. */
  path?: string;
}

/** The root component's template and what `ng add` does with it. */
export type LayoutTemplate = ReplacedLayoutTemplate | KeptLayoutTemplate;

/** A line of the comment that `ng new` puts at the top of the placeholder template. */
const NG_NEW_PLACEHOLDER = 'is only a placeholder';

/**
 * Decides what `ng add` does with the root component's template. It never replaces a template
 * that the application wrote: only Angular's `ng new` placeholder, an empty template or one that
 * holds only a router outlet. An active ng-morph project must hold the application's sources.
 * @param tree - The workspace tree.
 * @param mainPath - Path of the application's main file.
 */
export function getLayoutTemplate(tree: Tree, mainPath: string | undefined): LayoutTemplate {
  const appComponent: ClassDeclaration | undefined = mainPath
    ? getAppComponent(tree, mainPath)
    : undefined;

  if (!mainPath || !Node.isClassDeclaration(appComponent)) {
    return { action: 'missing' };
  }

  const inline: Expression | undefined = getInitializer(appComponent, 'Component', 'template');

  if (inline) {
    return { action: inline.getText().includes('<ng-doc-root') ? 'has-layout' : 'keep' };
  }

  const path: string | undefined = getAppTemplatePath(tree, mainPath);
  const content: string | undefined = path ? tree.read(path)?.toString('utf-8') : undefined;

  if (!path || content === undefined) {
    return { action: 'missing' };
  }

  if (content.includes('<ng-doc-root')) {
    return { action: 'has-layout', path };
  }

  return { action: isPlaceholderTemplate(content) ? 'replace' : 'keep', path };
}

/**
 * Whether a template holds nothing the application wrote: Angular's `ng new` placeholder, nothing
 * at all, or only a router outlet (which the NgDoc layout keeps).
 * @param content - The template.
 */
export function isPlaceholderTemplate(content: string): boolean {
  if (content.includes(NG_NEW_PLACEHOLDER)) {
    return true;
  }

  const markup: string = content.replace(/<!--[\s\S]*?-->/g, '').replace(/\s+/g, '');

  return markup === '' || /^<router-outlet(\/>|><\/router-outlet>)$/.test(markup);
}
