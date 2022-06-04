import {NgDocActions} from '../engine/actions';
import {NgDocPage} from '../interfaces';

export interface NgDocPageEnv {
	ngDocPage: NgDocPage;
	ngDocActions: NgDocActions;
}
