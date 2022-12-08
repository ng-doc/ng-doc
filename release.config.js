module.exports = {
	branches: ['+([0-9])?(.{+([0-9]),x}).x', 'release', 'beta'],
	plugins: [
		...require('@emias-kpi/linters/semantic-release/base.release.config.js').plugins,
		[
			'@emias-kpi/semantic-release-npm',
			{
				packages: [
					{
						pkgRoot: 'dist/solit/lucidus',
					},
					{
						pkgRoot: 'dist/solit/lucidus-cdk',
					},
					{
						pkgRoot: 'dist/solit/lucidus-core',
					},
					{
						pkgRoot: 'dist/solit/lucidus-date-fns-adapter',
					},
					{
						pkgRoot: 'dist/solit/lucidus-moment-adapter',
					},
					{
						pkgRoot: 'dist/solit/lucidus-luxon-adapter',
					},
				],
			},
		],
		[
			'./plugins/semantic-release/update-dependencies.js',
			{
				packages: [
					'dist/solit/lucidus',
					'dist/solit/lucidus-cdk',
					'dist/solit/lucidus-core',
					'dist/solit/lucidus-date-fns-adapter',
					'dist/solit/lucidus-moment-adapter',
					'dist/solit/lucidus-luxon-adapter',
				],
			},
		],
		[
			'semantic-release-telegram-bot',
			{
				success: {
					message: '${nextRelease.notes}',
				},
				notifications: [
					{
						chatIds: '408225585',
						notifyOnFail: true,
						notifyOnSuccess: false,
					},
					{
						chatIds: '408225585',
						branch: 'rc/*',
					},
					{
						chatIds: '-1001149567831',
						branch: 'release/*',
					},
				],
			},
		],
	],
};
