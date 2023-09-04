import { ObservableSet } from '../classes';

export interface NgDocRendererOptions<T> {
	scope?: string;
	dependenciesStore?: ObservableSet<string>;
	context?: T;
	filters?: boolean;
}
