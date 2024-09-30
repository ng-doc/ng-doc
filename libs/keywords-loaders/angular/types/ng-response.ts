import { NgPage } from '../interfaces';

export type NgResponse = Array<{
  moduleName: string;
  entries: NgPage[];
}>;
