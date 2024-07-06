export interface NgDocCachedData<TData = unknown> {
  version?: string;
  files?: Record<string, string>;
  result?: string;
  data?: TData;
}
