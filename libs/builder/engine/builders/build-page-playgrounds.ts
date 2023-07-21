// import {Observable, of} from 'rxjs';
//
// import {formatCode} from '../../helpers';
// import {NgDocBuilderOutput} from '../../interfaces';
// import {NgDocPagePlaygroundEntity} from '../entities';
// import {renderTemplate} from '../nunjucks';
//
// /**
//  * Builds playgrounds file for page
//  *
//  * @param page - page entity
//  */
// export function buildPagePlaygrounds(page: NgDocPagePlaygroundEntity): Observable<NgDocBuilderOutput> {
// 	const content: string = renderTemplate('./playgrounds.ts.nunj', {
// 		context: {
// 			page: page,
// 		},
// 	});
//
// 	return of({content: formatCode(content, 'TypeScript'), filePath: page.playgroundsPath});
// }
