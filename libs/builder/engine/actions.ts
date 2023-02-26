import {NgDocDemoActionOptions} from '@ng-doc/core';

import {NgDocActionOutput} from '../interfaces';
import {NgDocAction} from '../types';
import {demoAction} from './actions/demo.action';
import {playgroundAction} from './actions/playground.action';
import {NgDocPageEntity} from './entities/page.entity';

export class NgDocActions {
	constructor(private readonly page: NgDocPageEntity) {}

	demo(className: string, options?: NgDocDemoActionOptions): string {
		return this.performAction(demoAction(className, options)).output;
	}

	playground(playgroundId: string): string {
		const output: NgDocActionOutput = this.performAction(playgroundAction(playgroundId));

		return output.output;
	}

	private performAction(action: NgDocAction): NgDocActionOutput {
		const output: NgDocActionOutput = action(this.page.sourceFile.getProject(), this.page);

		this.page.dependencies.add(...(output.dependencies ?? []));

		return output;
	}
}
