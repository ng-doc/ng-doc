import { NgDocPage } from '@ng-doc/core';

const AnotherPagePage: NgDocPage = {
  title: `Another Page`,
  description: `This is another page for the POC. It's a simple page with a simple bomb.`,
  mdFile: ['./index.md', './api.md'],
  data: {
    declaration: 'apps/ng-doc/poc/another-page/test-inter.ts#MyClass',
    keyword: 'AnotherApiPage',
  },
};

export default AnotherPagePage;
