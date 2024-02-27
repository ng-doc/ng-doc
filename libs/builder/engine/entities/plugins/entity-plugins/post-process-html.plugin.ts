import { NgDocEntityPlugin } from '../types';

/**
 *
 */
export function postProcessHtmlPlugin(): NgDocEntityPlugin<string> {
  return {
    id: 'postProcessHtmlPlugin',
    execute: async (data) => {
      return data;
    },
  };
}
