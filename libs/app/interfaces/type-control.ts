import {FlBaseControlHost} from 'flex-controls';

export interface NgDocTypeControl<T> extends FlBaseControlHost<T> {
	items?: T[];
}
