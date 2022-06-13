import {Project} from 'ts-morph';

import {NgDocPageEntity} from '../engine';
import {NgDocActionOutput} from '../interfaces';

export type NgDocAction = (project: Project, page: NgDocPageEntity) => NgDocActionOutput;
