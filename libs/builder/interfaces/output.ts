import {Observable} from 'rxjs';

export interface NgDocBuildOutput {
	content: string;
	filePath: string;
	postProcessFn?: (content: string) => Observable<string>;
}
