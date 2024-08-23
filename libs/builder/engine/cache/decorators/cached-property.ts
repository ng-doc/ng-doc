import { cachedPropsInitializer } from '../cached-props-initializer';
import { NgDocCacheAccessor, NgDocCachedType } from '../interfaces';

/**
 * Decorator for cached properties, it will add the property name to the cachedProperties set
 * @param accessor - Accessor for the cached property, it will be used to get and set the property value in the cache
 */
export function CachedProperty<TClass, TProperty, TCachedType extends NgDocCachedType>(
  accessor?: Partial<NgDocCacheAccessor<TCachedType, TProperty>>,
) {
  return (target: undefined | TClass, context: ClassFieldDecoratorContext<TClass, TProperty>) => {
    context.addInitializer(function (this: TClass): void {
      cachedPropsInitializer(this, context.name.toString(), accessor);
    });

    return function (this: TClass, initialValue: TProperty): TProperty {
      return initialValue;
    };
  };
}
