import { ngApiPageTypes, ngPageTypes } from '../constants';

export type NgApiPageType = typeof ngPageTypes[number] | typeof ngApiPageTypes[number];
