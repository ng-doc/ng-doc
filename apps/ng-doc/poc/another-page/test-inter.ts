class Level1 {
  name: string = '';
}

export class MyClass extends Level1 {
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

export interface MyInterface extends Te {
  myProp: string;

  get myGetter(): string;
  set mySetter(value: string);

  myMethod(): void;
}

export interface Te {
  haha: number;
}

export enum MyEnum {
  value1,
  value2,
  value3 = 'value3',
}

export type MyType = {
  prop1: string;
  prop2: number;
};

/**
 * My function
 * @param param1 - param1 description
 * @param param2 - param2 description
 */
export function myFunction(param1: string, param2: number): void {
  console.log('myFunction');
}

export const myVar = 'myVar';
