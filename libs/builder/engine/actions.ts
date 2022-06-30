import {NgDocActionOutput} from '../interfaces';
import {NgDocAction} from '../types';
import {apiAction} from './actions/api.action';
import {demoAction} from './actions/demo.action';
import {playgroundAction} from './actions/playground.action';
import {tagsAction} from './actions/tags.action';
import {NgDocPageEntity} from './entities/page.entity';

export class NgDocActions {
	constructor(private readonly page: NgDocPageEntity) {}

	api(sourcePath: string): string {
		return this.performAction(apiAction(sourcePath));
	}

	demo(className: string): string {
		return this.performAction(demoAction(className));
	}

	playground(className: string): string {
		return this.performAction(playgroundAction(className));
	}

	tags(sourcePath: string): string {
		return this.performAction(tagsAction(sourcePath));
	}

	private performAction(action: NgDocAction): string {
		const output: NgDocActionOutput = action(this.page.project, this.page);

		this.page.dependencies.add(...(output.dependencies ?? []));

		return output.output;
	}
}
