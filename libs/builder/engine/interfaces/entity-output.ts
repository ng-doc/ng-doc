import {NgDocEntity} from '../entities/abstractions/entity';

export interface NgDocEntityOutput {
	type: 'insert' | 'remove' | 'empty';
	entities: NgDocEntity[];
}
