import {NgDocEntity} from '../engine/entities/abstractions/entity';
import {NgDocEntityPlugin} from '../engine/entities/plugins';
import {NgDocBuilderOutput} from './output';

export interface NgDocBuildResult<T = unknown, TEntity extends NgDocEntity = NgDocEntity> {
	toBuilderOutput: (content: T) => Promise<NgDocBuilderOutput>;
	postBuildPlugins?: Array<NgDocEntityPlugin<T, TEntity>>;
	postProcessPlugins?: Array<NgDocEntityPlugin<T, TEntity>>;
	result: T;
	entity: TEntity;
}
