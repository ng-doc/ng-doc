module.exports = {
	branches: ['+([0-9])?(.{+([0-9]),x}).x', 'release', {name: 'beta', channel: 'beta', prerelease: true}],
	plugins: [
		'@semantic-release/commit-analyzer',
		'@semantic-release/release-notes-generator',
		'@semantic-release/changelog',
		[
			'./plugins/semantic-release/publish-packages.js',
			{
				packages: [
					{
						pkgRoot: 'dist/libs/add',
					},
					{
						pkgRoot: 'dist/libs/core',
					},
					{
						pkgRoot: 'dist/libs/utils',
					},
					{
						pkgRoot: 'dist/libs/ui-kit',
					},
					{
						pkgRoot: 'dist/libs/builder',
					},
					{
						pkgRoot: 'dist/libs/app',
					},
				],
			},
		],
		[
			'./plugins/semantic-release/update-dependencies.js',
			{
				packages: [
					'dist/libs/add',
					'dist/libs/core',
					'dist/libs/utils',
					'dist/libs/ui-kit',
					'dist/libs/builder',
					'dist/libs/app',
				],
			},
		],
		[
			'./plugins/semantic-release/copy-package-info.js',
			{
				original: 'package.json',
				keys: ['keywords', 'author', 'repository', 'bugs', 'homepage', 'license'],
				packages: [
					'dist/libs/add',
					'dist/libs/core',
					'dist/libs/utils',
					'dist/libs/ui-kit',
					'dist/libs/builder',
					'dist/libs/app',
				],
			},
		],
		[
			'@semantic-release/git',
			{
				assets: ['CHANGELOG.md', 'package.json'],
				message: 'chore(release): ${nextRelease.version} [skip ci]\n\n${nextRelease.notes}',
			},
		],
		[
			'@semantic-release/github',
			{
				releasedLabels: ['Status: Released'],
			},
		],
	],
};
