import {NgDocPagePoint} from '../engine';
import {NgDocActionOutput} from '../interfaces';

export type NgDocAction = (page: NgDocPagePoint) => NgDocActionOutput;
