import {Project} from 'ts-morph';

import {createProject} from '../helpers';
import {NgDocActionOutput} from '../interfaces';
import {NgDocAction} from '../types';
import {apiAction} from './actions/api.action';
import {demoAction} from './actions/demo.action';
import {playgroundAction} from './actions/playground.action';
import {NgDocPagePoint} from './buildables/page';

export class NgDocActions {
	private readonly project: Project;

	constructor(private readonly page: NgDocPagePoint) {
		this.project = createProject();
	}

	api(sourcePath: string): string {
		return this.performAction(apiAction(sourcePath));
	}

	demo(className: string): string {
		return this.performAction(demoAction(className));
	}

	playground(className: string): string {
		return this.performAction(playgroundAction(className));
	}

	private performAction(action: NgDocAction): string {
		const output: NgDocActionOutput = action(this.project, this.page);

		this.page.dependencies.add(...(output.dependencies ?? []));

		return output.output;
	}
}
