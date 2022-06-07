import {Project} from 'ts-morph';

import {NgDocPagePoint} from '../engine';
import {NgDocActionOutput} from '../interfaces';

export type NgDocAction = (project: Project, page: NgDocPagePoint) => NgDocActionOutput;
