import { cachedFilesInitializer } from '../cached-files-initializer';

/**
 * Decorator for paths that should be cached, it can be applied to a string or an array of strings property to
 * cache the path or paths for the current class
 */
export function CachedFilesGetter<TClass, TProperty extends string | string[]>() {
	return (
		target: (this: TClass) => TProperty,
		context: ClassGetterDecoratorContext<TClass, TProperty>,
	) => {
		context.addInitializer(function (this: TClass): void {
			cachedFilesInitializer(this, context.name.toString());
		});

		return function (this: TClass): TProperty {
			return target.call(this);
		};
	};
}
