export const greet = (name: string): string => {
  // ng-doc-ignore-line
  console.debug('greet', name);

  return `Hello, ${name}!`;
};

export const farewell = (name: string): string => {
  return `Goodbye, ${name}!`;
};
