const { TextDecoder, TextEncoder } = require('node:util');

/*
	 After migration to Angular 17.1 an error "TextEncoder is not defined" started to appear
	 in Jest tests that use "@angular-devkit/schematics" package. Ideally, this should be fixed
	 in the package itself, but for now, this is a workaround.
	 TODO: Check if this is still needed after updating Nx packages.
 */

Object.defineProperties(globalThis, {
	TextDecoder: { value: TextDecoder },
	TextEncoder: { value: TextEncoder },
});
