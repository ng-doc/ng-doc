export interface FileOutput {
  filePath: string;
  content: string;
}

export type AsyncFileOutput = () => Promise<FileOutput>;

/**
 *
 * @param obj
 */
export function isFileOutput(obj: any): obj is FileOutput {
  return obj && typeof obj.filePath === 'string' && typeof obj.content === 'string';
}
