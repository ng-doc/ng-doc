import {NgDocEntity} from '../../abstractions/entity';

export interface NgDocEntityPlugin<T, TEntity extends NgDocEntity = NgDocEntity> {
	id: string;
	implementation: (data: T, context: TEntity) => Promise<T>;
}
