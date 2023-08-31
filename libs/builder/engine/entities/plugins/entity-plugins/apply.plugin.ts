import {objectKeys} from '@ng-doc/core';

import {NgDocEntity} from '../../abstractions/entity';
import {NgDocEntityPlugin} from '../types';

type ApplyFn<T, TEntity extends NgDocEntity> = (data: T, entity: TEntity) => Promise<T>;
type TransformFn<T, R, TEntity extends NgDocEntity> = (
	data: T,
	apply: ApplyFn<R, TEntity>,
	entity: TEntity,
) => Promise<T>;
/**
 *
 * @param fn
 * @param get
 * @param transform
 * @param plugins
 */
export function applyPlugin<T, R, TEntity extends NgDocEntity = NgDocEntity>(
	transform: TransformFn<T, R, TEntity>,
	plugins: (data: R) => Array<NgDocEntityPlugin<R, TEntity>>,
): NgDocEntityPlugin<T, TEntity> {
	return {
		id: 'apply-plugins',
		execute: async (data: T, entity: TEntity): Promise<T> => {
			const apply = async (data: R) => {
				for (const plugin of plugins(data)) {
					// eslint-disable-next-line no-await-in-loop
					data = await plugin.execute(data, entity);
				}

				return data;
			};

			return transform(data, apply, entity);
		},
	};
}

/**
 *
 */
export function forArrayItems<T, TEntity extends NgDocEntity>(): TransformFn<T[], T, TEntity> {
	return async (data: T[], apply: ApplyFn<T, TEntity>, entity: TEntity): Promise<T[]> => {
		for (let i = 0; i < data.length; i++) {
			data[i] = await apply(data[i], entity);
		}

		return data;
	};
}

/**
 *
 */
export function forObjectValues<T, K extends keyof T, TEntity extends NgDocEntity>(): TransformFn<T, T[K], TEntity> {
	return async (data: T, apply: ApplyFn<T[K], TEntity>, entity: TEntity): Promise<T> => {
		const keys: K[] = objectKeys(data as object) as K[];

		for (const k of keys) {
			data[k] = await apply(data[k], entity);
		}

		return data;
	};
}

/**
 *
 * @param key
 */
export function forObjectValue<T extends object, K extends keyof T, TEntity extends NgDocEntity>(
	key: K,
): TransformFn<T, T[K], TEntity> {
	return async (data: T, apply: ApplyFn<T[K], TEntity>, entity: TEntity): Promise<T> => {
		data[key] = await apply(data[key], entity);

		return data;
	};
}
