const fs = require('fs');
const path = require('path');

/* The plugin updates dependencies between packages based on the generated semantic-release version */

function prepare(pluginConfig, {logger}) {
	const originalPackageJson = JSON.parse(fs.readFileSync(pluginConfig.original, {encoding: 'utf-8'}));

	for (let packageDir of pluginConfig.packages) {
		logger.log('Updating package.json of %s', packageDir);

		const packageJson = JSON.parse(
			fs.readFileSync(`${path.join(packageDir, 'package.json')}`, {encoding: 'utf-8'}),
		);

		for (let key of pluginConfig.keys) {
			packageJson[key] = originalPackageJson[key];
		}

		fs.writeFileSync(`${path.join(packageDir, 'package.json')}`, JSON.stringify(packageJson, undefined, 2));
	}
}

module.exports = {prepare};
