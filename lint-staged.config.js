module.exports = {
	'*': [
		(files) => `nx affected:lint --fix --quiet=true --files=${files.join(',')}`,
		(files) => `nx format:write --files=${files.join(',')}`,
	],
};
