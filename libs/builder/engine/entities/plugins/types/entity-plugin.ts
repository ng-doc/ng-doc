import { NgDocEntity } from '../../abstractions/entity';

export interface NgDocEntityPlugin<T, TEntity extends NgDocEntity = NgDocEntity> {
	id: string;
	execute: (data: T, context: TEntity) => Promise<T>;
}
