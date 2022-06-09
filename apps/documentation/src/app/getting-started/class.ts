export class TestClass {
	/** My property */
	property1: string = 'asd';
	private property2: string = 'aks98d';

	/**
	 * Описание функции
	 *
	 * @param parameter
	 * @param parameter2
	 */
	method1(parameter: number, parameter2: string): void {
		console.log(parameter, parameter2);
	}

	private method2(): void {
		console.log('method');
	}
}
