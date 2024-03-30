import { renderTemplate } from './engine/nunjucks/render-template';
import { getClassApi } from './helpers/api/get-class-api';
import { createProject } from './helpers/typescript/create-project';

const project = createProject();
const sf = project.addSourceFileAtPath('libs/builder/engine/entities/page.entity.ts');
project.resolveSourceFileDependencies();
const declaration = sf.getClass('NgDocPageEntity');

/**
 *
 */
function go() {
  console.time('old renderTemplate1');
  // @ts-expect-error develop
  const templ = renderTemplate('api-page-content.html.nunj', {
    context: {
      declaration,
    },
    filters: true,
  });
  // console.log(templ)
  console.timeEnd('old renderTemplate1');
}

/**
 *
 * @param log
 */
function go2(log?: boolean): void {
  console.time('new renderTemplate2');
  // @ts-expect-error develop
  const templ = getClassApi(declaration);
  if (log) console.log(templ);
  console.timeEnd('new renderTemplate2');
}

go2();
go2();
go2();
go2();
go2();
go2(true);
go();
go();
go();
go();
go();
