import {NgDocPage} from '@ng-doc/core';

import {NgDocActions} from '../engine/actions';

export interface NgDocPageEnv {
	NgDocPage: NgDocPage;
	NgDocActions: NgDocActions;
}
