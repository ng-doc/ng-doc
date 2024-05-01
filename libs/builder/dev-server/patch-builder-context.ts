import { BuilderContext } from '@angular-devkit/architect';

// The DevServer uses EsBuild only for specific builder names.
// https://github.com/just-jeb/angular-builders/blob/dbf4d281a29c2f93d309bba0e155c3a22965130c/packages/custom-esbuild/src/dev-server/patch-builder-context.ts#L14-L47
/**
 *
 * @param context
 * @param config
 * @param config.mock
 * @param config.with
 * @param config.optionsTransform
 */
export function patchBuilderContext(
  context: BuilderContext,
  config: {
    mock: string[];
    with: string;
    optionsTransform: (options: any) => void;
  },
): BuilderContext {
  const getBuilderNameForTarget: typeof context.getBuilderNameForTarget = async (target) => {
    const builderName = await context.getBuilderNameForTarget(target);
    if (!config.mock.includes(builderName)) return builderName;
    return config.with;
  };

  const getTargetOptions: typeof context.getTargetOptions = async (target) => {
    const builderName = await context.getBuilderNameForTarget(target);
    if (!config.mock.includes(builderName)) return context.getTargetOptions(target);
    const options = await context.getTargetOptions(target);
    config.optionsTransform(options);
    return options;
  };

  return { ...context, getBuilderNameForTarget, getTargetOptions };
}
