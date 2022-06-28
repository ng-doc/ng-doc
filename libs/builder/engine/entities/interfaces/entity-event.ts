import {NgDocEntity} from '../abstractions/entity';

export interface NgDocEntityEvent {
	event: 'created' | 'changed' | 'destroyed';
	entity: NgDocEntity[];
}
