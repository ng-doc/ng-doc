import {NgDocPage} from '@ng-doc/core';
import {NgDocActions} from '../actions';

export interface NgDocPageEnv {
	ngDoc: {
		page: NgDocPage;
	};
	ngDocActions: NgDocActions;
}
