import {NgDocActions} from '../engine/actions';
import {NgDocPage} from '../interfaces';

export interface NgDocPageEnv {
	NgDocPage: NgDocPage;
	NgDocActions: NgDocActions;
}
