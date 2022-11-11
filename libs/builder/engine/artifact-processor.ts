import * as path from 'path';

import {NgDocBuiltOutput} from '../interfaces';
import {NgDocBuilder} from './builder';
import {NgDocEntity} from './entities/abstractions/entity';
import {keywordProcessor} from './processors/keyword.processor';

export class NgDocArtifactsProcessor {
	constructor(
		readonly builder: NgDocBuilder,
		readonly entities: Map<string, NgDocEntity>,
	) {}

	process(artifacts: NgDocBuiltOutput[]): NgDocBuiltOutput[] {
		return artifacts
			.map((artifact: NgDocBuiltOutput) =>
				this.isProcessableArtifact(artifact)
					? this.runProcessors(artifact)
					: artifact
			);
	}

	private runProcessors(artifact: NgDocBuiltOutput): NgDocBuiltOutput {
		import('remark').then((remark: typeof import('remark')) =>
			remark.remark()
				.use(keywordProcessor(this.entities))
				.processSync(artifact.output)
		)
		return {
			...artifact,
			output: artifact.output
		}
	}

	private isProcessableArtifact(artifact: NgDocBuiltOutput): boolean {
		return path.extname(artifact.filePath) === '.md';
	}

}
