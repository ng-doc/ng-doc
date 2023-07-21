// import {NgDocPageIndex} from '@ng-doc/core';
// import {from, Observable, of} from 'rxjs';
// import {map, switchMap, tap} from 'rxjs/operators';
//
// import {getPageType, markdownToHtml, postProcessHtml, processHtml} from '../../helpers';
// import {buildIndexes} from '../../helpers/build-indexes';
// import {NgDocBuilderOutput} from '../../interfaces';
// import {NgDocPageEntity} from '../entities';
// import {renderTemplate} from '../nunjucks';
//
// /**
//  * Builds page module
//  *
//  * @param page - Page entity
//  */
// export function buildPageModule(page: NgDocPageEntity): Observable<NgDocBuilderOutput> {
// 	if (!page.target) {
// 		throw new Error(`Failed to build page. Make sure that you define a page configuration correctly.`);
// 	}
//
// 	const template: string = '';
//
// 	return of(template).pipe(
// 		map((output: string) => markdownToHtml(output, page)),
// 		switchMap((html: string) => processHtml(page, html)),
// 		map((content: string) => ({
// 			content,
// 			filePath: page.modulePath,
// 			postProcessFn: (content: string) =>
// 				from(postProcessHtml(page, content)).pipe(
// 					switchMap((content: string) =>
// 						from(
// 							buildIndexes({
// 								title: page.title,
// 								content,
// 								pageType: getPageType(page),
// 								breadcrumbs: page.breadcrumbs,
// 								route: page.fullRoute,
// 							}),
// 						).pipe(
// 							tap((indexes: NgDocPageIndex[]) => page.indexes.push(...indexes)),
// 							map(() =>
// 								renderTemplate('./page.module.ts.nunj', {
// 									context: {
// 										page,
// 										pageContent: content,
// 									},
// 								}),
// 							),
// 						),
// 					),
// 				),
// 		})),
// 	);
// }
