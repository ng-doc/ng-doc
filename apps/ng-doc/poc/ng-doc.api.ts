import { NgDocApi } from '@ng-doc/core';

const api: NgDocApi = {
  title: 'API References',
  scopes: [
    {
      name: 'ng-doc',
      route: 'ng-doc',
      include: 'apps/ng-doc/poc/page/*.ts',
    },
  ],
};

export default api;
