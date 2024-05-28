import { NgDocApi } from '@ng-doc/core';

const api: NgDocApi = {
  title: 'API References',
  scopes: [
    {
      name: '@ng-doc/core',
      route: 'core',
      include: 'libs/core/constants/*.ts',
    },
  ],
};

export default api;
