import {NgDocActions} from '../actions';
import {NgDocPage} from '../interfaces';

export interface NgDocPageEnv {
	ngDoc: {
		page: NgDocPage;
	};
	ngDocActions: NgDocActions;
}
