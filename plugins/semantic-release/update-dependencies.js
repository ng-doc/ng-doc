const fs = require('fs');
const path = require('path');

/* Плагин обновляет зависимости между пакетами на основании сгенерированной semantic-release версией */

function prepare(pluginConfig, {logger}) {
	const localPackages = collectPackageNames(pluginConfig.packages);

	for (let packageDir of pluginConfig.packages) {
		logger.log('Checking package.json of %s', packageDir);

		const pkg = fs.readFileSync(`${path.join(packageDir, 'package.json')}`);
		const packageJson = JSON.parse(String(pkg));

		if (packageJson.dependencies) {
			Object.keys(packageJson.dependencies).forEach((key) => {
				if (localPackages.includes(key)) {
					logger.log('Update %s version to %s', key, packageJson.version);

					packageJson.dependencies[key] = `${packageJson.version}`;
				}
			});
		}

		fs.writeFileSync(`${path.join(packageDir, 'package.json')}`, JSON.stringify(packageJson, undefined, 2));
	}
}

function collectPackageNames(packages) {
	return packages.map((packageDir) => {
		const pkg = fs.readFileSync(`${path.join(packageDir, 'package.json')}`);
		const packageJson = JSON.parse(String(pkg));

		return packageJson.name;
	});
}

module.exports = {prepare};
