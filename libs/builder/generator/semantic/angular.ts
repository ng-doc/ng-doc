import {
  type NgDocPlaygroundProperties,
  buildPlaygroundDemoPipeTemplate,
  buildPlaygroundDemoTemplate,
  getAssignedInputs,
} from '@ng-doc/core';
import { dirname, resolve } from 'node:path';
import {
  type ClassDeclaration,
  type ObjectLiteralExpression,
  type SourceFile,
  type Type,
  Node,
  ts,
  TypeFormatFlags,
} from 'ts-morph';

import { getComponentInputs } from '../../helpers/angular/get-component-inputs';
import { getComponentSourceFiles } from '../../helpers/angular/get-component-source-files';
import { getInputName } from '../../helpers/angular/get-input-name';
import { getInputType } from '../../helpers/angular/get-input-type';
import { isStandalone } from '../../helpers/angular/is-standalone';
import { codeTypeFromExt } from '../../helpers/code-type-from-ext';
import { getDemoClassDeclarations } from '../../helpers/demo/get-demo-class-declarations';
import { extractSelectors, getPipeName } from '../../helpers/extract-selectors';
import { getContentForPlayground } from '../../helpers/playground/get-content-for-playground';
import { getPlaygroundTemplateInputs } from '../../helpers/playground/get-playground-template-inputs';
import { getTargetForPlayground } from '../../helpers/playground/get-target-for-playground';
import { getTemplateForPlayground } from '../../helpers/playground/get-template-for-playground';
import { writtenUnionOrder } from '../../helpers/playground/written-union-order';
import { removeLinesFromCode } from '../../helpers/remove-lines-from-code';
import { snippetsFromAsset } from '../../helpers/snippets-from-asset';
import { formatType } from '../../helpers/typescript/display-type';
import { parseSnippet } from '../../parsers/parse-snippet';
import type { DemoAsset, GeneratorConfiguration, GuideSemantics, JsonValue } from '../contracts';
import { hostPath } from '../kernel/paths';
import { type TrackedFiles, SemanticFailure } from './dependencies';
import type { JsDoc } from './rendering';
import { canonicalUnionMembers } from './type-text';

/** A union's members in the canonical order of printed types (`type-text.ts`). */
function canonicalMembers(type: Type): Type[] {
  const members = type.getUnionTypes();
  const wrappers = new Map(members.map((member) => [member.compilerType, member]));
  return canonicalUnionMembers(
    members.map((member) => member.compilerType),
    (member) =>
      wrappers
        .get(member)!
        .getText(
          undefined,
          TypeFormatFlags.NoTruncation | TypeFormatFlags.UseSingleQuotesForStringLiteralType,
        ),
  ).map((member) => wrappers.get(member)!);
}

/** Resolves wrappers and local constants without executing source code. */
export function unwrap(
  node: Node | undefined,
  seen: Set<Node<ts.Node>> = new Set<Node>(),
): Node | undefined {
  if (!node || seen.has(node)) return undefined;
  seen.add(node);
  if (
    Node.isAsExpression(node) ||
    Node.isSatisfiesExpression(node) ||
    Node.isParenthesizedExpression(node) ||
    Node.isTypeAssertion(node)
  )
    return unwrap(node.getExpression(), seen);
  if (Node.isIdentifier(node)) return unwrap(node.getSymbol()?.getDeclarations()[0], seen);
  if (Node.isVariableDeclaration(node) || Node.isPropertyAssignment(node))
    return unwrap(node.getInitializer(), seen);
  if (Node.isExportAssignment(node)) return unwrap(node.getExpression(), seen);
  return node;
}

export function entryObject(source: SourceFile): ObjectLiteralExpression {
  const exported = source.getDefaultExportSymbol()?.getDeclarations()[0];
  const object = unwrap(exported);
  if (!Node.isObjectLiteralExpression(object))
    throw new SemanticFailure(
      'SEMANTIC_ENTRY_OBJECT',
      `Cannot resolve default entry object in ${source.getFilePath()}`,
    );
  return object;
}

export function literal(node: Node | undefined): JsonValue {
  const value = unwrap(node);
  if (Node.isStringLiteral(value) || Node.isNoSubstitutionTemplateLiteral(value))
    return value.getLiteralValue();
  if (Node.isNumericLiteral(value)) return value.getLiteralValue();
  if (value?.getText() === 'true') return true;
  if (value?.getText() === 'false') return false;
  if (value?.getText() === 'null') return null;
  if (Node.isPrefixUnaryExpression(value) && /^-\d/.test(value.getText()))
    return Number(value.getText());
  if (Node.isArrayLiteralExpression(value)) return value.getElements().map((item) => literal(item));
  if (Node.isObjectLiteralExpression(value))
    return Object.fromEntries(
      value.getProperties().map((property) => {
        if (!Node.isPropertyAssignment(property))
          throw new SemanticFailure(
            'SEMANTIC_DYNAMIC_CONTROLS',
            'Computed controls require readGuideValues',
          );
        return [property.getName().replace(/^['"]|['"]$/g, ''), literal(property.getInitializer())];
      }),
    );
  throw new SemanticFailure(
    'SEMANTIC_DYNAMIC_CONTROLS',
    'Computed controls require the evaluated readGuideValues factory port',
  );
}

function controlsToProperties(controls: Record<string, JsonValue>): NgDocPlaygroundProperties {
  return Object.fromEntries(
    Object.entries(controls).map(([name, value]) => {
      if (typeof value === 'string') {
        return [name, { inputName: name, type: value, isManual: true }];
      }
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new SemanticFailure('SEMANTIC_CONTROLS_SHAPE', `Invalid control ${name}`);
      }
      const type = value.type;
      if (typeof type !== 'string') {
        throw new SemanticFailure('SEMANTIC_CONTROLS_SHAPE', `Invalid control ${name}`);
      }
      return [
        name,
        {
          inputName: typeof value.alias === 'string' ? value.alias : name,
          type,
          ...(typeof value.description === 'string' ? { description: value.description } : {}),
          ...(Array.isArray(value.options) &&
          value.options.every((item) => typeof item === 'string')
            ? { options: value.options as string[] }
            : {}),
          isManual: true,
        },
      ];
    }),
  );
}

function assets(
  target: ClassDeclaration,
  files: TrackedFiles,
  config: GeneratorConfiguration,
): DemoAsset[] {
  // The shared helper joins the resource URLs with `node:path`, which gives backslashes on Windows.
  // Each asset's source is recorded as a content dependency, so it takes the engine's spelling.
  return getComponentSourceFiles(target).flatMap((file) => {
    const source = hostPath(file);
    const code = files.read(source).trim();
    // The reused snippet parser reads these files; register even failed reads before invoking it.
    for (const line of code.split(/\r?\n/)) {
      const start = line.indexOf('snippet-from-file=');
      if (start >= 0) {
        const snippet = parseSnippet(
          line
            .slice(start)
            .replace(/\s*(-->|\*\/)\s*$/, '')
            .trim(),
        );
        if (snippet?.fromFile) files.read(resolve(dirname(source), snippet.fromFile));
      }
    }
    const title = codeTypeFromExt(source);
    const asset = {
      title,
      code,
      filePath: source,
      isEmpty: !code,
      lang: title.replace('TypeScript', 'angular-ts').replace('HTML', 'angular-html'),
    };
    const snippets = snippetsFromAsset(asset, config.inlineStyleLanguage, config.workspaceRoot);
    return (snippets.length ? snippets : [asset]).map((item) => ({
      title: item.title,
      source,
      language: item.lang,
      code: removeLinesFromCode(item.code),
      ...('icon' in item && item.icon !== undefined ? { icon: item.icon as string } : {}),
      ...('opened' in item && item.opened !== undefined ? { opened: item.opened as boolean } : {}),
    }));
  });
}

export function guideSemantics(
  source: SourceFile,
  files: TrackedFiles,
  config: GeneratorConfiguration,
  docs: JsDoc,
  values?: JsonValue,
): GuideSemantics {
  const object = entryObject(source);
  const demoClasses = getDemoClassDeclarations(object);
  const demoExpression = unwrap(object.getProperty('demos'));
  if (demoExpression) {
    if (!Node.isObjectLiteralExpression(demoExpression))
      throw new SemanticFailure(
        'SEMANTIC_DEMO_OBJECT',
        'Demos require an object literal mapping names to component classes',
      );
    for (const property of demoExpression.getProperties()) {
      const name =
        Node.isPropertyAssignment(property) || Node.isShorthandPropertyAssignment(property)
          ? property.getName().replace(/^['"]|['"]$/g, '')
          : '';
      if (!demoClasses[name] || !getComponentSourceFiles(demoClasses[name]).length)
        throw new SemanticFailure('SEMANTIC_DEMO_TARGET', `Cannot resolve component demo ${name}`);
    }
  }
  const demos = Object.fromEntries(
    Object.entries(demoClasses).map(([id, target]) => [id, assets(target, files, config)]),
  );
  const playgrounds = unwrap(object.getProperty('playgrounds'));
  if (!playgrounds) return { demos, playgrounds: [] };
  if (!Node.isObjectLiteralExpression(playgrounds))
    throw new SemanticFailure(
      'SEMANTIC_PLAYGROUNDS_OBJECT',
      'Playgrounds must expose an object literal for target analysis',
    );
  const evaluated = values as
    | { playgrounds?: Record<string, { controls?: JsonValue }> }
    | undefined;
  return {
    demos,
    playgrounds: playgrounds.getProperties().map((property) => {
      if (!Node.isPropertyAssignment(property))
        throw new SemanticFailure(
          'SEMANTIC_PLAYGROUND_OBJECT',
          'Playgrounds require named property assignments',
        );
      const id = property.getName().replace(/^['"]|['"]$/g, '');
      const expression = unwrap(property.getInitializer());
      if (!Node.isObjectLiteralExpression(expression))
        throw new SemanticFailure('SEMANTIC_PLAYGROUND_OBJECT', `Cannot resolve playground ${id}`);
      const target = getTargetForPlayground(expression);
      if (!target?.getName())
        throw new SemanticFailure(
          'SEMANTIC_PLAYGROUND_TARGET',
          `Cannot resolve named target for playground ${id}`,
        );
      getComponentSourceFiles(target).forEach((file) => files.read(file));
      const selectors = extractSelectors(target);
      const pipeName = getPipeName(target);
      if (!selectors.length && !pipeName)
        throw new SemanticFailure(
          'SEMANTIC_PLAYGROUND_TARGET',
          `Playground ${id} target needs a component/directive selector or pipe name`,
        );
      const template = getTemplateForPlayground(expression);
      const content = getContentForPlayground(expression);
      const properties: NgDocPlaygroundProperties = {};
      const inputs = pipeName
        ? target.getMethodOrThrow('transform').getParameters().slice(1)
        : getComponentInputs(target);
      for (const input of inputs) {
        const type = Node.isPropertyDeclaration(input) ? getInputType(input) : input.getType();
        let name = Node.isParameterDeclaration(input) ? input.getName() : getInputName(input);
        // Both input.required and model.required place options at argument zero.
        if (Node.isPropertyDeclaration(input)) {
          const call = input.getInitializer();
          if (Node.isCallExpression(call) && /\.required$/.test(call.getExpression().getText())) {
            const options = call.getArguments()[0];
            const alias = Node.isObjectLiteralExpression(options)
              ? unwrap(options.getProperty('alias'))
              : undefined;
            if (Node.isStringLiteral(alias)) name = alias.getLiteralValue();
          }
        }
        properties[input.getName()] = {
          inputName: name,
          type: formatType(
            type,
            TypeFormatFlags.NoTruncation | TypeFormatFlags.UseSingleQuotesForStringLiteralType,
          ),
          description: Node.isParameterDeclaration(input)
            ? docs.getJsDocParam(target.getMethodOrThrow('transform'), input.getName())
            : docs.getJsDocDescription(input),
          // In the written order: the checker's (stable) order sorts literals by value.
          options: writtenUnionOrder(input, type, canonicalMembers(type)).map((part) =>
            part.getText(
              undefined,
              TypeFormatFlags.NoTruncation | TypeFormatFlags.UseSingleQuotesForStringLiteralType,
            ),
          ),
        };
      }
      const controls =
        evaluated?.playgrounds?.[id]?.controls ??
        (expression.getProperty('controls') ? literal(expression.getProperty('controls')) : {});
      if (!controls || typeof controls !== 'object' || Array.isArray(controls))
        throw new SemanticFailure(
          'SEMANTIC_CONTROLS_SHAPE',
          `Controls for ${id} must be a JSON object`,
        );
      Object.assign(properties, controlsToProperties(controls as Record<string, JsonValue>));
      for (const [key, value] of Object.entries(properties)) {
        if (!value || typeof value !== 'object' || typeof value.type !== 'string')
          throw new SemanticFailure('SEMANTIC_CONTROLS_SHAPE', `Invalid control ${id}.${key}`);
        if (!pipeName && getAssignedInputs(template, selectors).includes(value.inputName ?? key))
          delete properties[key];
      }
      const templateInputs = getPlaygroundTemplateInputs(properties);
      return {
        id,
        target: { source: target.getSourceFile().getFilePath(), exportName: target.getName()! },
        standalone: isStandalone(target),
        ...(pipeName ? { pipeName } : { selector: selectors.join(',') }),
        template,
        templatesBySelector: Object.fromEntries(
          (pipeName ? [pipeName] : selectors).map((selector) => [
            selector,
            pipeName
              ? buildPlaygroundDemoPipeTemplate(template, selector, content, templateInputs, false)
              : buildPlaygroundDemoTemplate(template, selector, content, templateInputs, false),
          ]),
        ),
        properties: properties as unknown as Record<string, JsonValue>,
        content,
      };
    }),
  };
}
