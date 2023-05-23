import {NgDocCachedEntity} from '../../abstractions/cached.entity';

/**
 * Decorator for cached properties, it will add the property name to the cachedProperties set
 */
export function CachedProperty<TClass extends NgDocCachedEntity, TProperty>() {
	return (target: undefined | TClass, context: ClassFieldDecoratorContext<TClass, TProperty>) => {
		return function (this: TClass, initialValue: TProperty): TProperty {
			this.cachedProperties.add(context.name.toString());

			return initialValue;
		};
	};
}
