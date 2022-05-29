import {NgDocPagePoint} from './page';

export class NgDocActions {
	constructor(private readonly entryPoint: NgDocPagePoint) {}

	api(sourcePath: string): string {
		return `${sourcePath}/api`;
	}

	demo(className: string): string {
		return className;
	}
}
