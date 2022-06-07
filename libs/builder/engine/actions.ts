import {NgDocActionOutput} from '../interfaces';
import {NgDocAction} from '../types';
import {apiAction} from './actions/api.action';
import {demoAction} from './actions/demo.action';
import {NgDocPagePoint} from './buildables/page';

export class NgDocActions {
	constructor(private readonly page: NgDocPagePoint) {}

	api(sourcePath: string): string {
		return this.performAction(apiAction(sourcePath));
	}

	demo(className: string): string {
		return this.performAction(demoAction(className));
	}

	private performAction(action: NgDocAction): string {
		const output: NgDocActionOutput = action(this.page);

		(output.dependencies ?? []).forEach((dependency: string) => this.page.templateDependencies.add(dependency));

		return output.output;
	}
}
