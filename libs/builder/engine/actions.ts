import {NgDocActionOutput} from '../interfaces';
import {NgDocAction} from '../types';
import {apiAction} from './actions/api.action';
import {demoAction} from './actions/demo.action';
import {playgroundAction} from './actions/playground.action';
import {tagsAction} from './actions/tags.action';
import {NgDocPageEntity} from './entities/page.entity';
import {NgDocDemoActionOptions} from './interfaces';

export class NgDocActions {
	constructor(private readonly page: NgDocPageEntity) {}

	api(sourcePath: string): string {
		return this.performAction(apiAction(sourcePath)).output;
	}

	demo(className: string, options?: NgDocDemoActionOptions): string {
		return this.performAction(demoAction(className, options)).output;
	}

	playground(playgroundId: string): string {
		const output: NgDocActionOutput = this.performAction(playgroundAction(playgroundId));

		return output.output;
	}

	tags(sourcePath: string): string {
		return this.performAction(tagsAction(sourcePath)).output;
	}

	private performAction(action: NgDocAction): NgDocActionOutput {
		const output: NgDocActionOutput = action(this.page.project, this.page);

		this.page.dependencies.add(...(output.dependencies ?? []));

		return output;
	}
}
