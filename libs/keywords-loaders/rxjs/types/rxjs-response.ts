import { RxjsPage } from '../interfaces';

export type RxjsResponse = Array<{
  name: string;
  title: string;
  items: RxjsPage[];
}>;
