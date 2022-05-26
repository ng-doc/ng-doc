import {NgDocEntryPoint} from './entry-point';

export class NgDocActions {
	constructor(private readonly entryPoint: NgDocEntryPoint) {}

	api(sourcePath: string): string {
		return `${sourcePath}/api`;
	}

	demo(className: string): string {
		return className;
	}
}
