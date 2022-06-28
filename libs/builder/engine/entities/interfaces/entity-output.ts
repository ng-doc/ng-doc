import {NgDocEntity} from '../abstractions/entity';

export interface NgDocEntityOutput {
	type: 'insert' | 'remove' | 'empty';
	entities: NgDocEntity[];
}
