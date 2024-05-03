class Level1 {
  name: string = '';
}

/**
 * MyClass description
 * @usageNotes
 *
 * MyClass usage notes
 */
export class MyClass extends Level1 {
  /**
   * Lorem ipsum dolor sit amet, consectetur adipiscing elit.
   * Lorem ipsum dolor sit amet, consectetur adipiscing elit.
   * Lorem ipsum dolor sit amet, consectetur adipiscing elit.
   * Lorem ipsum dolor sit amet, consectetur adipiscing elit.
   * Lorem ipsum dolor sit amet, consectetur adipiscing elit.
   * Lorem ipsum dolor sit amet, consectetur adipiscing elit.
   * Lorem ipsum dolor sit amet, consectetur adipiscing elit.
   * Lorem ipsum dolor sit amet, consectetur adipiscing elit.
   * Lorem ipsum dolor sit amet, consectetur adipiscing elit.
   */
  myProp = 'myProp';

  get myGetter(): string {
    return this.myProp;
  }

  set mySetter(value: string) {
    this.myProp = value;
  }

  myMethod(): void {
    console.log('myMethod');
  }
}

/**
 * MyClass description
 */
export interface MyInterface extends Te {
  myProp: string;

  get myGetter(): string;
  set mySetter(value: string);

  myMethod(): void;
}

export interface Te {
  haha: number;
}

/**
 * MyClass
 */
export enum MyEnum {
  value1,
  value2,
  value3 = 'value3',
}

/**
 * MyClass description
 */
export interface MyType {
  prop1: string;
  prop2: number;
}

/**
 * My function
 * @param param1 - param1 description
 * @param param2 - param2 description
 */
export function myFunction(param1: string, param2: number): void {
  console.log('myFunction');
}

/**
 * MyClass description
 */
export const myVar = 'myVar';
