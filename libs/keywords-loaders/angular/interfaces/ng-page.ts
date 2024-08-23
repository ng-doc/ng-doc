import { NgApiPageType } from '../types';

export interface NgPage {
  name: string;
  type: NgApiPageType;
  isDeprecated?: boolean;
}
