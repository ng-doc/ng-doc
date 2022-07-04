import {FlControl} from 'flex-controls';

export abstract class NgDocInputHost<T> {
	abstract inputControl: FlControl<T> | null;
}
