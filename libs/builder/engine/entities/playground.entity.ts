import * as path from 'path';
import {Observable, of} from 'rxjs';
import {mapTo, tap} from 'rxjs/operators';
import {
	ClassDeclaration,
	Expression,
	Node,
	ObjectLiteralElementLike,
	ObjectLiteralExpression,
	Project,
	SourceFile,
} from 'ts-morph';

import {isPageEntity} from '../../helpers';
import {NgDocBuilderContext, NgDocBuiltOutput, NgDocPlayground} from '../../interfaces';
import {NgDocEntityStore} from '../entity-store';
import {PAGE_NAME} from '../variables';
import {NgDocEntity} from './abstractions/entity';
import {NgDocFileEntity} from './abstractions/file.entity';
import {NgDocPageEntity} from './page.entity';

export class NgDocPlaygroundEntity extends NgDocFileEntity<NgDocPlayground> {
	readonly isRoot: boolean = false;
	override readonly buildCandidates: NgDocEntity[] = [];

	constructor(
		override readonly project: Project,
		override readonly sourceFile: SourceFile,
		protected override readonly context: NgDocBuilderContext,
		protected override readonly entityStore: NgDocEntityStore,
	) {
		super(project, sourceFile, context, entityStore);
	}

	override get parent(): NgDocPageEntity | undefined {
		const expectedPath: string = path.join(this.sourceFileFolder, PAGE_NAME);
		const buildable: NgDocEntity | undefined = this.entityStore.get(expectedPath);

		return isPageEntity(buildable) ? buildable : undefined;
	}

	protected override build(): Observable<NgDocBuiltOutput[]> {
		return of([]);
	}

	protected override update(): Observable<void> {
		return of(null).pipe(
			tap(() => {
				this.sourceFile.refreshFromFileSystemSync();

				this.readyToBuild = true;
			}),
			mapTo(void 0),
		);
	}

	getTargetForPlayground(playgroundId: string): ClassDeclaration | undefined {
		const expression: ObjectLiteralExpression | undefined = this.getObjectExpressionFromDefault();

		if (!expression) {
			throw new Error(
				`Failed to load ${this.sourceFile.getFilePath()}. Make sure that you have exported it as default.`,
			);
		}

		const playgroundExpression: ObjectLiteralElementLike | undefined = expression.getProperty(playgroundId);

		if (Node.isPropertyAssignment(playgroundExpression)) {
			const playgroundInitializer: Expression | undefined = playgroundExpression.getInitializer();

			if (Node.isObjectLiteralExpression(playgroundInitializer)) {
				const target: ObjectLiteralElementLike | undefined = playgroundInitializer.getProperty('target');

				if (Node.isPropertyAssignment(target)) {
					const targetInitializer: Expression | undefined = target.getInitializer();

					if (Node.isIdentifier(targetInitializer)) {
						const declaration: Node | undefined = targetInitializer
							.getType()
							?.getSymbol()
							?.getDeclarations()[0];

						if (Node.isClassDeclaration(declaration)) {
							return declaration;
						}
					}
				}
			}
		}

		return undefined;
	}
}
