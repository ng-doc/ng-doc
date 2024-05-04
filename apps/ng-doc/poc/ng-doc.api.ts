import { NgDocApi } from '@ng-doc/core';

const api: NgDocApi = {
  title: 'API References',
  scopes: [
    {
      name: '@ng-doc/app',
      route: 'core',
      include: 'libs/core/**/*.ts',
    },
  ],
};

export default api;
