import { RouterLink } from '@angular/router';
import { NgDocPage } from '@ng-doc/core';

import { DemoComponent } from './demo.component';

const Page: NgDocPage = {
  title: `Page`,
  mdFile: './index.md',
  keyword: 'MyPage',
  imports: [RouterLink],
  demos: {DemoComponent}
};

export default Page;
