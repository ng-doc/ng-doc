import {NgDocCachedEntity} from '../../abstractions/cached.entity';
import {NgDocCacheAccessor, NgDocCachedType} from '../interfaces';

/**
 * Decorator for cached properties, it will add the property name to the cachedProperties set
 *
 * @param accessor
 */
export function CachedProperty<TClass extends NgDocCachedEntity, TProperty, TCacheType extends NgDocCachedType>(
	accessor?: Partial<NgDocCacheAccessor<TCacheType, TProperty>>,
) {
	return (target: undefined | TClass, context: ClassFieldDecoratorContext<TClass, TProperty>) => {
		return function (this: TClass, initialValue: TProperty): TProperty {
			this.cachedProperties.set(context.name.toString(), {
				get: accessor?.get ?? ((value: TCacheType) => value),
				set: accessor?.set ?? ((value: TProperty) => JSON.stringify(value)),
			});

			return initialValue;
		};
	};
}
