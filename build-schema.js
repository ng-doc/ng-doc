const { basename, dirname, join } = require('path');
const glob = require('glob');
const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');
const merge = require('lodash/merge');
const fs = require('fs');

const argv = yargs(hideBin(process.argv)).argv;

function buildSchema(from, to) {
	const schemas = glob.sync(from);

	schemas.forEach((schemaPath) => {
		const builder = basename(dirname(schemaPath));
		const schema = loadSchema(schemaPath);
		const schemaName = basename(schemaPath);
		const builderName = builder === 'browser' ? 'application' : builder;
		const originalSchema = loadSchema(
			`./node_modules/@angular-devkit/build-angular/src/builders/${builderName}/schema.json`,
		);
		const newSchema = merge(originalSchema, schema);
		const newSchemaPath = join(to, builder, schemaName);

		fs.writeFileSync(newSchemaPath, JSON.stringify(newSchema, null, 2), 'utf-8');
	});
}

function loadSchema(path) {
	return JSON.parse(fs.readFileSync(path, { encoding: 'utf-8' }));
}

if (argv.from && argv.to) {
	buildSchema(argv.from, argv.to);
}

module.exports = { buildSchema };
