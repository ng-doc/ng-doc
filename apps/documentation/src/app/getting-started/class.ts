export class TestClass {
	/** My property */
	property1 = 'asd'
	private property2 = 'aks98d'

	constructor(
		some: string,
	) {
	}

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

	}
}
