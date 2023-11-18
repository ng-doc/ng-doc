import { NgDocStringHandler } from '@ng-doc/ui-kit/types';

export const NG_DOC_DEFAULT_STRINGIFY: NgDocStringHandler<unknown> = (item: unknown) =>
	String(item);
