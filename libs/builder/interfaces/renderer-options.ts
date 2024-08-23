import { ObservableSet } from '../classes';

export interface NgDocRendererOptions<T> {
	scope?: string;
	dependencies?: ObservableSet<string>;
	context?: T;
	filters?: boolean;
}
