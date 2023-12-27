import { Job } from '../types';

/**
 *
 * @param data
 * @param jobs
 */
export async function sequentialJobs<T>(data: T, jobs: Array<Job<T>>): Promise<T> {
	let currentData: T = data;

	for (const job of jobs) {
		currentData = await job(currentData);
	}

	return currentData;
}
