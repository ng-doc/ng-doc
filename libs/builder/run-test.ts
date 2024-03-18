import { renderTemplate } from './engine/nunjucks';
import { getClassApi } from './helpers';
import { createProject } from './helpers/typescript/create-project';

/**
 *
 */
function go() {
  const project = createProject();
  const sf = project.addSourceFileAtPath('libs/builder/engine/entities/page.entity.ts');
  project.resolveSourceFileDependencies();
  const declaration = sf.getClass('NgDocPageEntity');

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
 */
function go2(): void {
  const project = createProject();
  const sf = project.addSourceFileAtPath('libs/builder/engine/entities/page.entity.ts');

  project.resolveSourceFileDependencies();
  const declaration = sf.getClass('NgDocPageEntity');

  console.time('new renderTemplate2');
  // @ts-expect-error develop
  const templ = getClassApi(declaration);
  console.log(templ);
  console.timeEnd('new renderTemplate2');
}
go2();
go();
