import {objectKeys} from './object-keys';

// eslint-disable-next-line @typescript-eslint/ban-types
export function filterObject<T extends {}>(obj: T, filter: <K extends keyof T>(key: K, value: T[K]) => boolean): T {
	return objectKeys(obj).reduce((acc: T, key: keyof T) => {
		const value: T[keyof T] = obj[key];

		if (filter<keyof T>(key, value)) {
			acc[key] = value;
		}

		return acc;
	}, {} as T);
}
