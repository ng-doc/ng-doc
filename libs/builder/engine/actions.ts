import {NgDocActionOutput} from '../interfaces';
import {NgDocAction} from '../types';
import {demoAction} from './actions/demo.action';
import {NgDocPagePoint} from './buildables/page';

export class NgDocActions {
	constructor(private readonly entryPoint: NgDocPagePoint) {}

	api(sourcePath: string): string {
		return `${sourcePath}/api`;
	}

	demo(className: string): string {
		return this.performAction(demoAction(className));
	}

	private performAction(action: NgDocAction): string {
		const output: NgDocActionOutput = action(this.entryPoint);

		// TODO add dependencies

		return output.output;
	}
}
