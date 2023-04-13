# [15.11.0](https://github.com/skoropadas/ng-doc/compare/v15.10.5...v15.11.0) (2023-04-13)


### Bug Fixes

* **app:** headings in not indexable content have a wrong margin ([82dbea1](https://github.com/skoropadas/ng-doc/commit/82dbea1ce0e01b586ba7d1c240f775e5aefa8b8d))
* **builder:** ng-doc throws an error if a page was removed from the file system ([515e8b7](https://github.com/skoropadas/ng-doc/commit/515e8b7eacffe8ab68097f2206dfbe08b3ee06ff))


### Features

* **builder:** now ng-doc handles several API configuration files correctly ([ab84513](https://github.com/skoropadas/ng-doc/commit/ab84513b78a349b565d01f9fe536148d4815b2aa)), closes [#26](https://github.com/skoropadas/ng-doc/issues/26)


### Performance Improvements

* **builder:** enable the "noEmit" property for the NgDoc TypeScript project, this should slightly improve performance for the projects with a lot of API entities ([f06a75d](https://github.com/skoropadas/ng-doc/commit/f06a75df5ad470ae4e2d11ff659152a4e4c73a75))

## [15.10.5](https://github.com/skoropadas/ng-doc/compare/v15.10.4...v15.10.5) (2023-04-04)


### Bug Fixes

* **builder:** default param value displayed as [object Object] in API presentations ([30fb08b](https://github.com/skoropadas/ng-doc/commit/30fb08b5691fc8025c3c2912799afee1c209c29c)), closes [#40](https://github.com/skoropadas/ng-doc/issues/40)

## [15.10.4](https://github.com/skoropadas/ng-doc/compare/v15.10.3...v15.10.4) (2023-04-03)


### Bug Fixes

* **builder:** api doesn't display `undefined` for optional types if `strict` mode is enabled ([1a812a2](https://github.com/skoropadas/ng-doc/commit/1a812a2c550263b3119ccfd914c05b02dd543df7))
* **builder:** remove unused duplicate of `NgDocPageIndex` interface ([8c65331](https://github.com/skoropadas/ng-doc/commit/8c65331f82cf3ddb83cdadabe6de8a88d448cad6))


### Performance Improvements

* **utils:** html post processor doesn't wrap the html with the body tag anymore ([6118a7e](https://github.com/skoropadas/ng-doc/commit/6118a7edd994b3866d6bb9e0ad822a4360d5c89e))

## [15.10.3](https://github.com/skoropadas/ng-doc/compare/v15.10.2...v15.10.3) (2023-04-02)


### Bug Fixes

* **builder:** logical types are not recognized correctly in playground ([e062357](https://github.com/skoropadas/ng-doc/commit/e06235723695428828a515c81065830c459b7043))
* **builder:** some types are not displayed in the API ([f9e3885](https://github.com/skoropadas/ng-doc/commit/f9e3885bb97090b954c55a12be32fe102eef8052))

## [15.10.2](https://github.com/skoropadas/ng-doc/compare/v15.10.1...v15.10.2) (2023-04-01)


### Bug Fixes

* **builder:** logical types are not recognized correctly in playground ([16c348c](https://github.com/skoropadas/ng-doc/commit/16c348c445f72236b3c36d057cb50ae77962a13a))

## [15.10.1](https://github.com/skoropadas/ng-doc/compare/v15.10.0...v15.10.1) (2023-04-01)


### Bug Fixes

* **builder:** builder emits error if there are API nodes without type ([ee67112](https://github.com/skoropadas/ng-doc/commit/ee67112fa0acc846f4caf99fbcc61fcd73560e85))

# [15.10.0](https://github.com/skoropadas/ng-doc/compare/v15.9.0...v15.10.0) (2023-04-01)


### Bug Fixes

* **app:** nested `ul` list are displayed with wrong margin ([4b7ae6b](https://github.com/skoropadas/ng-doc/commit/4b7ae6beb8c2e8068dd3a5dc3dc20f346edabff1))
* **builder:** inline code is lost in indexes ([7157dc0](https://github.com/skoropadas/ng-doc/commit/7157dc067098356c957243a638184ca55d2daaba))
* **builder:** ng-doc expands type aliases for API ([86ca3ab](https://github.com/skoropadas/ng-doc/commit/86ca3ab0485b63f11b588adbddd8f61d92e833ed))
* **builder:** ng-doc truncates long literal types ([f1581fd](https://github.com/skoropadas/ng-doc/commit/f1581fdbee7393c0d12778a941337ab02058cb69))
* **p:** iframes are not styled ([ce4379c](https://github.com/skoropadas/ng-doc/commit/ce4379c49fe557234b6f4cd919805147d8b222ab))
* **project:** dependency injection error after update to 15.10.0 ([5ca03a1](https://github.com/skoropadas/ng-doc/commit/5ca03a1cbc9615fced9427fea91daa0d60798309))
* **search:** fix `@oramasearch/orama` warnings and add HTML sanitizer ([378d8aa](https://github.com/skoropadas/ng-doc/commit/378d8aaff88faf6431b3c87e7a5eb63004a13b4f))


### Features

* **add:** ng-add command provides `NgDocSearchEngine` automatically ([af535c4](https://github.com/skoropadas/ng-doc/commit/af535c45e5fde814c5302bf071dd10b546d4b247))
* **app:** add a spinner to the search component to indicate when the search is in progress ([d35c4e8](https://github.com/skoropadas/ng-doc/commit/d35c4e85cd22014b6ec480616a092c720675d18f))
* **app:** add animation of content changes for tabs and code tooltips ([5fec4ab](https://github.com/skoropadas/ng-doc/commit/5fec4ab04d4f8278407fbaf7a1fed1ae9bab5b94))
* **app:** add breadcrumbs for guides ([931fd86](https://github.com/skoropadas/ng-doc/commit/931fd86401980c6a18e01cb04feaacda3ac9248b))
* **app:** code blocks use `--ng-doc-code-background` CSS variable ([75f4d8a](https://github.com/skoropadas/ng-doc/commit/75f4d8ac28f88227fa3747d53d0e8fa56e0dfbe4))
* **app:** copy to clipboard button now changes its text if code was copied ([f71f7c4](https://github.com/skoropadas/ng-doc/commit/f71f7c4b7791213494a28a925e6cea65d137038e))
* **app:** search component and search engine improvements ([d865e26](https://github.com/skoropadas/ng-doc/commit/d865e26c490ba8ebd6da57c945cb64d5de4cbb74)), closes [#31](https://github.com/skoropadas/ng-doc/issues/31)
* **builder:** add `demoPane` method to display demo ([3ce3e32](https://github.com/skoropadas/ng-doc/commit/3ce3e32fe86087cf1ffb4d38f0c3cce8fbc44b46))
* **builder:** content indexing can be disabled for certain blocks ([43ebeaa](https://github.com/skoropadas/ng-doc/commit/43ebeaa1ee3104879fd79727273ae98fba7a7acb))
* **builder:** markdown code blocks improvements ([32aa365](https://github.com/skoropadas/ng-doc/commit/32aa36504109e746840826e8880f6b832a52b000))
* **builder:** now all API presentation are formatted by default ([a7108e8](https://github.com/skoropadas/ng-doc/commit/a7108e89b71a1982c9564d50f707ad6c3e596fd8))
* **utils:** add new `@ng-doc/utils` package that now contains Post HTML Processor ([0d44b5a](https://github.com/skoropadas/ng-doc/commit/0d44b5a3569ce045da69b7c0b7e76bb43d52c983))


### Performance Improvements

* **builder:** improve the indexing process ([02857e2](https://github.com/skoropadas/ng-doc/commit/02857e2e4dd944d756cc085f7c755a0ebf55b898))

# [15.9.0](https://github.com/skoropadas/ng-doc/compare/v15.8.0...v15.9.0) (2023-03-26)


### Bug Fixes

**app:** code blocks have wrong font config([8a8b172] (https://github.com/skoropadas/ng-doc/commit/8a8b17205050f360619f4aebc6a6931aa1336acc))


### Features

**app:** conditionally remove docs page from sidebar([5f52ab8] (https://github.com/skoropadas/ng-doc/commit/5f52ab8006876434a2e3133e07e688283e68964e)), closes[#35](https://github.com/skoropadas/ng-doc/issues/35)

# [15.8.0](https://github.com/skoropadas/ng-doc/compare/v15.7.12...v15.8.0) (2023-03-23)


### Bug Fixes

**app:** headings don't display anchor icon on hover([167b15a] (https://github.com/skoropadas/ng-doc/commit/167b15afb54d84037dc28ce4e90e79130d23f4e7))


### Features

**add:** add schematics adds default `RouterModule` config automatically to allow scroll repositions when link anchor was clicked([2698781] (https://github.com/skoropadas/ng-doc/commit/269878102a513cfc2778ad1d1c45e6a935e234ed))

## [15.7.12](https://github.com/skoropadas/ng-doc/compare/v15.7.11...v15.7.12) (2023-03-22)


### Bug Fixes

**app:** 
navigation links in code examples do not work when using baseHref([12280d0](https://github.com/skoropadas/ng-doc/commit/12280d0a0774f29d10e875bffc37982f38272c6c)), closes[#34](https://github.com/skoropadas/ng-doc/issues/34)

## [15.7.11](https://github.com/skoropadas/ng-doc/compare/v15.7.10...v15.7.11) (2023-03-22)


### Bug Fixes

**app:** 
navigation links do not work when using baseHref([41f4c3f](https://github.com/skoropadas/ng-doc/commit/41f4c3f99fa47490410ccac05c78a1be84a2dfda)), closes[#34](https://github.com/skoropadas/ng-doc/issues/34)

## [15.7.10](https://github.com/skoropadas/ng-doc/compare/v15.7.9...v15.7.10) (2023-03-21)


### Bug Fixes

	**app:**navigation links do not work when using baseHref([81a0847](https://github.com/skoropadas/ng-doc/commit/81a08479a69df1524b268063c92e0ec8c8e67aba))

## [15.7.9](https://github.com/skoropadas/ng-doc/compare/v15.7.8...v15.7.9) (2023-03-19)


### Bug Fixes

	**builder:**new demo code previews are unavailable until the application is restarted([038e0ef](https://github.com/skoropadas/ng-doc/commit/038e0ef79ca650f55ff00536ff93c5416ca64d8b)), closes[#33](https://github.com/skoropadas/ng-doc/issues/33)

## [15.7.8](https://github.com/skoropadas/ng-doc/compare/v15.7.7...v15.7.8) (2023-03-17)


### Bug Fixes

* **add:** schematic doesnt add NgDoc modules ([dcee2ae](https://github.com/skoropadas/ng-doc/commit/dcee2ae3196916585782ca9aea87cd5ea792a40f))
* **builder:** if an error is made in the template syntax, the application throws an error and stops building, while if the error is fixed, you still have to restart the build ([81f7b70](https://github.com/skoropadas/ng-doc/commit/81f7b708e408edb576d4a05470ef66ba6dc3c105))

## [15.7.7](https://github.com/skoropadas/ng-doc/compare/v15.7.6...v15.7.7) (2023-03-13)


### Bug Fixes

* **builder:** replace `ts-node` config loader with `swc` ([b0df84f](https://github.com/skoropadas/ng-doc/commit/b0df84f6eb024bb9cd2e6e0c200c61a36154d05d))
* **builder:** update builder imports ([a4ef8c3](https://github.com/skoropadas/ng-doc/commit/a4ef8c3e3de291a8ac43bbc4fc9db2f008dcb2c0))

## [15.7.6](https://github.com/skoropadas/ng-doc/compare/v15.7.5...v15.7.6) (2023-03-13)


### Bug Fixes

* **builder:** replace `ts-node` config loader with `swc` ([f279818](https://github.com/skoropadas/ng-doc/commit/f2798189720dfff4128068f2a3d3aaaa091f927d))

## [15.7.5](https://github.com/skoropadas/ng-doc/compare/v15.7.4...v15.7.5) (2023-03-13)


### Bug Fixes

* **app:** next page button is aligned to the left if there is no previous page ([017560b](https://github.com/skoropadas/ng-doc/commit/017560b74a09275db2afd119284f21c9c2836aaf))
* **app:** playground's type controls are not provided ([458ab4a](https://github.com/skoropadas/ng-doc/commit/458ab4a6d7e785d81d96a668c8ad2d038f7bd656))
* **builder:** add `Page` suffix for `page` schematic ([88b92d3](https://github.com/skoropadas/ng-doc/commit/88b92d3811dd2ce725df1565a50649475677b357))

## [15.7.4](https://github.com/skoropadas/ng-doc/compare/v15.7.3...v15.7.4) (2023-03-12)


### Bug Fixes

* **add:** `add` command adds deprecated configuration ([dbaf75b](https://github.com/skoropadas/ng-doc/commit/dbaf75b2bcca4f334cdf3334b99a0fffa67a36be))
* **add:** path error, if `ngDoc` configuration in `angular.json` is not provided ([03a57ad](https://github.com/skoropadas/ng-doc/commit/03a57ad609030a424481305de2a293512bbd26cb))
* **app:** global CSS styles leak into component demos ([f8d615a](https://github.com/skoropadas/ng-doc/commit/f8d615a68269a0e45d4f60bd64c6051083532b9d)), closes [#28](https://github.com/skoropadas/ng-doc/issues/28)

## [15.7.3](https://github.com/skoropadas/ng-doc/compare/v15.7.2...v15.7.3) (2023-03-08)


### Bug Fixes

* **app:** global CSS styles leak into component demos ([1ab364d](https://github.com/skoropadas/ng-doc/commit/1ab364db88cbacc062862935e652e1c9e1f918ab)), closes [#28](https://github.com/skoropadas/ng-doc/issues/28)

## [15.7.2](https://github.com/skoropadas/ng-doc/compare/v15.7.1...v15.7.2) (2023-03-08)


### Bug Fixes

* **app:** some dependencies are not installed ([0c57d6c](https://github.com/skoropadas/ng-doc/commit/0c57d6ce7ec2c1250c99edc636629255408d5c7b)), closes [#30](https://github.com/skoropadas/ng-doc/issues/30)


### Reverts

* Revert "fix(app): global CSS styles leak into component demos" ([a1d9bb9](https://github.com/skoropadas/ng-doc/commit/a1d9bb90080f9ba8052c579305a73475ae70be9e))

## [15.7.1](https://github.com/skoropadas/ng-doc/compare/v15.7.0...v15.7.1) (2023-03-07)


### Bug Fixes

* **app:** ng-doc does not use the `tsConfig` passed in the global configuration ([3dfd5cc](https://github.com/skoropadas/ng-doc/commit/3dfd5ccff882dfeceb40e96672e00cbcfe9d1881))

# [15.7.0](https://github.com/skoropadas/ng-doc/compare/v15.6.0...v15.7.0) (2023-03-07)


### Bug Fixes

* **app:** filter for entity type on the api list page doesn't display type icons ([eeb8bdd](https://github.com/skoropadas/ng-doc/commit/eeb8bdd042708a9d18f6b640fbdc4b89c5d4a313))
* **app:** global CSS styles leak into component demos ([91727f5](https://github.com/skoropadas/ng-doc/commit/91727f54243605a965e3fe9e11d432c0dd72a8c0)), closes [#28](https://github.com/skoropadas/ng-doc/issues/28)
* **app:** prev/next links are wrong for pages with similar routes ([3cdf42a](https://github.com/skoropadas/ng-doc/commit/3cdf42abe6644e2390c0f9d1601d3eb55765e193)), closes [#29](https://github.com/skoropadas/ng-doc/issues/29)
* **app:** remove warning about `beautify-html` library ([714f3c7](https://github.com/skoropadas/ng-doc/commit/714f3c7875c50e87cbeac7df2da80541a698a38f))
* **builder:** `onlyForTags` property of the page/category configuration object should contain project configuration name like `production` or `development` ([9aebc99](https://github.com/skoropadas/ng-doc/commit/9aebc99231400ee8b963e6fbb4f9fdab4a38be40))


### Features

* **app:** `toc` is generated based on headers with id given header level ([96cd9e2](https://github.com/skoropadas/ng-doc/commit/96cd9e24d440dc8f230de9cb82b30ea907ce47e2))
* **app:** add `anchorHeadings` to the `NgDocConfiguration` interface, that can be used to limit the headings for which anchor links should be generated ([10aaa20](https://github.com/skoropadas/ng-doc/commit/10aaa20525dea2ebd56f72ac9e670f55f01c981f)), closes [#27](https://github.com/skoropadas/ng-doc/issues/27)
* **app:** filter by entity name on the api list page is focused by default ([865d0a4](https://github.com/skoropadas/ng-doc/commit/865d0a499154cf6a72adbb6afe136757f745ae32))
* **app:** replace `ngDoc` configuration field in `angular.json` with `ng-doc.config.js` file ([e2c9b6c](https://github.com/skoropadas/ng-doc/commit/e2c9b6c2b489979756c253cefbd0af0f3b255a21)), closes [#20](https://github.com/skoropadas/ng-doc/issues/20)

# [15.6.0](https://github.com/skoropadas/ng-doc/compare/v15.5.1...v15.6.0) (2023-03-03)


### Bug Fixes

* **app:** missing dependency js-beautify ([fa1a8e3](https://github.com/skoropadas/ng-doc/commit/fa1a8e375a709553aeda942d70a12dede4a41643)), closes [#22](https://github.com/skoropadas/ng-doc/issues/22)
* **builder:** api scopes are not sorted by `order` field ([b07598c](https://github.com/skoropadas/ng-doc/commit/b07598cda0192c13667ae883a7285a3c959b6ef2))
* **builder:** paths are generated incorrectly on Windows ([9cbda4c](https://github.com/skoropadas/ng-doc/commit/9cbda4c4e697474ab90303b68cacc911125d656e)), closes [#25](https://github.com/skoropadas/ng-doc/issues/25)


### Features

* **app:** add `scope` filter for api list ([911196c](https://github.com/skoropadas/ng-doc/commit/911196cd438af03f13fe1bcd3494b8cec704d657)), closes [#23](https://github.com/skoropadas/ng-doc/issues/23)

## [15.5.1](https://github.com/skoropadas/ng-doc/compare/v15.5.0...v15.5.1) (2023-03-01)


### Bug Fixes

* **app:** previous page button display on the right side of the page ([b32d978](https://github.com/skoropadas/ng-doc/commit/b32d9781fcef1499d33ea0d8f898d254c6cb4a24))
* **app:** previous/next buttons have wrong background color for dark themes ([90bf376](https://github.com/skoropadas/ng-doc/commit/90bf37650fadbb6fd498a5df46a3787db74f5982))

# [15.5.0](https://github.com/skoropadas/ng-doc/compare/v15.4.1...v15.5.0) (2023-03-01)


### Features

* **app:** add "Previous/Next Page" links to guide pages ([01bd3fd](https://github.com/skoropadas/ng-doc/commit/01bd3fde26452e28e5283540739814a37fa5aeae)), closes [#19](https://github.com/skoropadas/ng-doc/issues/19)
* **app:** display protected keyword ([56b8f4c](https://github.com/skoropadas/ng-doc/commit/56b8f4cbb3c9316c94a721c7c6a3102b4c767317)), closes [#13](https://github.com/skoropadas/ng-doc/issues/13)
* **ui-kit:** add more types of button ([7708737](https://github.com/skoropadas/ng-doc/commit/77087377bc3d975c7202273e8e557cb53196c670))

## [15.4.1](https://github.com/skoropadas/ng-doc/compare/v15.4.0...v15.4.1) (2023-02-26)


### Performance Improvements

* **app:** add minification for HTML files ([c51ad6d](https://github.com/skoropadas/ng-doc/commit/c51ad6db127f330e0482764325858453f1debe91))
* **app:** remove unused languages imports for highlight.js ([ab93672](https://github.com/skoropadas/ng-doc/commit/ab93672e0d5e07aa4e378054929d9974253a2dbf))
* **builder:** change imports from `@ng-doc/core` ([44b949c](https://github.com/skoropadas/ng-doc/commit/44b949c9e488e4520852bdb8874fc9e7cbf5712a))
* **builder:** reduce delays ([12a8fcf](https://github.com/skoropadas/ng-doc/commit/12a8fcf986b911ca4aef4e4e57d597a2af188a07))
* **builder:** replace `prettier` with `js-beautify` to reduce bundle size ([da688e5](https://github.com/skoropadas/ng-doc/commit/da688e58595dba6ebc04d48e7ecefb03e6ad99a5))

# [15.4.0](https://github.com/skoropadas/ng-doc/compare/v15.3.2...v15.4.0) (2023-02-24)


### Features

* **app:** add dark purple theme ([fce107f](https://github.com/skoropadas/ng-doc/commit/fce107ff6faf6929e3fc1f85826e007d34e21cba))
* **app:** add more options to configure `demo` action ([2ce8826](https://github.com/skoropadas/ng-doc/commit/2ce88267ca1790a2c96ef1299f169461cd430919)), closes [#16](https://github.com/skoropadas/ng-doc/issues/16)

## [15.3.2](https://github.com/skoropadas/ng-doc/compare/v15.3.1...v15.3.2) (2023-02-20)


### Bug Fixes

* **builder:** types to some properties are defined as any ([5bc231c](https://github.com/skoropadas/ng-doc/commit/5bc231c35178c0da391e8cd1418a9f77d8221a06))

## [15.3.1](https://github.com/skoropadas/ng-doc/compare/v15.3.0...v15.3.1) (2023-02-20)


### Bug Fixes

* **project:** push a stuck release ([c66a867](https://github.com/skoropadas/ng-doc/commit/c66a86723ff05c9e665a09b62c95763ae61c9acd))

# [15.3.0](https://github.com/skoropadas/ng-doc/compare/v15.2.0...v15.3.0) (2023-02-20)


### Features

* **app:** add `NgDocCustomNavbarDirective`, `NgDocCustomSidebarDirective` for custom components ([f5ae230](https://github.com/skoropadas/ng-doc/commit/f5ae230be0bda793fce50a0888520165844a2365))
* **project:** add playground feature ([f750580](https://github.com/skoropadas/ng-doc/commit/f7505807740a8742bd897f1069c004c9c8f77a53)), closes [#12](https://github.com/skoropadas/ng-doc/issues/12)

# [15.2.0](https://github.com/skoropadas/ng-doc/compare/v15.1.1...v15.2.0) (2023-02-10)


### Features

* **app:** add glass effect to the header ([0833db3](https://github.com/skoropadas/ng-doc/commit/0833db3aba6204a46107f0cb4dc80cf65e8680b4))
* **app:** entities in the api list are sorted by type and name ([c2ae928](https://github.com/skoropadas/ng-doc/commit/c2ae92857065bceb4ddf6ee12155311c830cfced))
* **ui-kit:** add `NgDocScrollService` that allows to block document scroll ([e644459](https://github.com/skoropadas/ng-doc/commit/e6444598b28a667fa2b5e0dcf003e905a3288e62))

## [15.1.1](https://github.com/skoropadas/ng-doc/compare/v15.1.0...v15.1.1) (2023-02-09)


### Bug Fixes

* **app:** toc visual fixes, now it is easier to visually determine the level of the element ([449c0f0](https://github.com/skoropadas/ng-doc/commit/449c0f016d416cdbd709e1a310e776123e99955f))
* **builder:** using the `browser` builder, `ng build` completes successfully but doesn't exit ([25bebac](https://github.com/skoropadas/ng-doc/commit/25bebac31a7b2af76c1f30204cbe5b4b3defd79c)), closes [#7](https://github.com/skoropadas/ng-doc/issues/7)

# [15.1.0](https://github.com/skoropadas/ng-doc/compare/v15.0.1...v15.1.0) (2023-02-08)


### Bug Fixes

* **app:** copy code button changes style based on global theme ([c2e2f4e](https://github.com/skoropadas/ng-doc/commit/c2e2f4ef2cdcb9e6ae39a2cb13dc15e4ef7715e6))
* **core:** search bar shows "Unknown" ([ee53a18](https://github.com/skoropadas/ng-doc/commit/ee53a18fe063b4aeb57d50d8ac529328ebfa6b7a)), closes [#6](https://github.com/skoropadas/ng-doc/issues/6)
* **ui-kit:** the primary color is too bright for the light theme ([e5e2c74](https://github.com/skoropadas/ng-doc/commit/e5e2c7494f0479e97c06c34155771bc5e62aed49))


### Features

* **ng-doc:** add links on each page to edit guides or API documentation ([9bc230a](https://github.com/skoropadas/ng-doc/commit/9bc230ac081d05318019477b6fe4ba8528c2971f)), closes [#3](https://github.com/skoropadas/ng-doc/issues/3)

## [15.0.1](https://github.com/skoropadas/ng-doc/compare/v15.0.0...v15.0.1) (2023-02-02)


### Bug Fixes

* **builder:** demo viewer doesn't show source code ([73ffe77](https://github.com/skoropadas/ng-doc/commit/73ffe7760b010863f84d9e00f561817e2232cdcd))

# [15.0.0](https://github.com/skoropadas/ng-doc/compare/v14.0.0...v15.0.0) (2023-02-01)


### Bug Fixes

* **api:** ng-doc displays private-public properties that have been set by the Angular Compiler ([0a82d7e](https://github.com/skoropadas/ng-doc/commit/0a82d7eaf5118d7a72b75f1ab324be3508cf184f))
* **api:** remove `override` keyword from function presentation ([379d65b](https://github.com/skoropadas/ng-doc/commit/379d65b6f3a4a79fcd7355cfceeaa4c462659b42))
* **api:** types in api list filter are not sorted ([16d5fee](https://github.com/skoropadas/ng-doc/commit/16d5fee3e51441b759f2892e06942c4c93fd13eb))
* **app:** toc is not stretched to full height ([1dce071](https://github.com/skoropadas/ng-doc/commit/1dce071ff8cc535e12a5a313297f52e6ebd61e5f))
* **app:** toc selection bar cut off ([f582991](https://github.com/skoropadas/ng-doc/commit/f5829915864a6a27e270d3e7457bcacd95722d19))
* **app:** tooltips on API pages are not centered ([2965224](https://github.com/skoropadas/ng-doc/commit/2965224c6fa17e072cabad16dabcee632452e74c))
* **builder:** added path to API entity is not watched for changes ([8723bc7](https://github.com/skoropadas/ng-doc/commit/8723bc70be85a91bff149c1ca0c1d03daca80fc4))
* **builder:** all classes are abstract on the API page ([d4f3462](https://github.com/skoropadas/ng-doc/commit/d4f346223927a442673181b4acc46823696bcaa0))
* **builder:** api not updating automatically when files change ([1dcf640](https://github.com/skoropadas/ng-doc/commit/1dcf64089ce413b1d133622f40fad0d9ebae519a))
* **builder:** builder freezes if rendering fails ([b8cbd72](https://github.com/skoropadas/ng-doc/commit/b8cbd723397be8456874629de5d66561fd7ee070))
* **builder:** pages paths now uses sourceRoot folder by default ([564a89e](https://github.com/skoropadas/ng-doc/commit/564a89e0877777da10a6c2c0a9604f98e3b12523))
* **builder:** the dependency file was assembled incorrectly ([3afda1d](https://github.com/skoropadas/ng-doc/commit/3afda1dbb5865e866a9e04d5c7c9adec7cdb1d11))
* **builder:** wrong links generated for duplicate class names ([f8c34e2](https://github.com/skoropadas/ng-doc/commit/f8c34e273fc944d4c0a1f741e69880b8376cf5d3)), closes [#1](https://github.com/skoropadas/ng-doc/issues/1)
* **demo:** demo recreates component every change detection cycle ([4421c7f](https://github.com/skoropadas/ng-doc/commit/4421c7f711e0c75d3518f7a826ab6e2e06a643c4))
* **dependencies:** dependency file doesn't generate assets when it was just created ([e408606](https://github.com/skoropadas/ng-doc/commit/e408606c5a464d8400be9d440fa71eff109332e1))
* **keywords:** ng-doc generates links not only for typescript code examples ([8646fb8](https://github.com/skoropadas/ng-doc/commit/8646fb82ccdcb0aafba4e6cf820f3e82b10dc7a1))
* **ng-doc:** `ng-doc` doesn't forget pages that have been moved to another directory ([6ba172e](https://github.com/skoropadas/ng-doc/commit/6ba172ee316c93893bb15fcb1f1ff3da18f0db36))
* **ng-doc:** add `allowSyntheticDefaultImports` to ng-add ([026e411](https://github.com/skoropadas/ng-doc/commit/026e4116ddd72cf90e4611d512cf4850f9cd3d0c))
* **ng-doc:** add cdk to dependencies for `@ng-doc/app` ([7f80a8c](https://github.com/skoropadas/ng-doc/commit/7f80a8c1f4aba4a9f1a780f8534996ec69884fa4))
* **ng-doc:** add npm access for packages ([0217c88](https://github.com/skoropadas/ng-doc/commit/0217c88c9e440dc7836e033cfcfa95ab63ef2487))
* **ng-doc:** add raw-loader to the builder dependencies ([a234b8e](https://github.com/skoropadas/ng-doc/commit/a234b8e920b3dccbbca03e2827971b5b4d0ca194))
* **ng-doc:** add README.md for builder ([a13325f](https://github.com/skoropadas/ng-doc/commit/a13325fbaccf495de35a084df2a39c70a81eb522))
* **ng-doc:** add schema for `ng-add` command ([00ed2de](https://github.com/skoropadas/ng-doc/commit/00ed2debeeb6b88c9a4673634d8b73846fff7545))
* **ng-doc:** angular dependencies for `ng-doc/app` ([fc0f36e](https://github.com/skoropadas/ng-doc/commit/fc0f36ecfcea1c0c618fb577eb10df28b55ee6f9))
* **ng-doc:** doesn't render all entities ([99d0562](https://github.com/skoropadas/ng-doc/commit/99d0562cea5227faca2ed2bd114515fd29292be4))
* **ng-doc:** downgrade `chalk` version ([bc604ed](https://github.com/skoropadas/ng-doc/commit/bc604edc127fb50a5c1988cb1434803725f914b3))
* **ng-doc:** fix @ng-doc/add schematics ([a705cc7](https://github.com/skoropadas/ng-doc/commit/a705cc70c7195db813388cca0b1ee791e32c29e7))
* **ng-doc:** fixes for schematics ([af031e3](https://github.com/skoropadas/ng-doc/commit/af031e316a668ae21ca2af78236cc66b2ab3fd79))
* **ng-doc:** make package public ([0c4984c](https://github.com/skoropadas/ng-doc/commit/0c4984ca8122c55373378551410c656b5d3e12e1))
* **ng-doc:** move ng-add schematics to the external library ([066a548](https://github.com/skoropadas/ng-doc/commit/066a54891705117a434772b8e4116646a62e47e0))
* **ng-doc:** ng-add depends on nx ([2515fa9](https://github.com/skoropadas/ng-doc/commit/2515fa9e89722450b9e9fafad1ef0820da86c215))
* **ng-doc:** ng-add doesn't update assets ([1bd745f](https://github.com/skoropadas/ng-doc/commit/1bd745fcd86cc8fb297d11950b25fb9d446b221b))
* **ng-doc:** ng-doc doesn't update the indexes when page content has been updated ([31280f8](https://github.com/skoropadas/ng-doc/commit/31280f8aab9695604df395c5d9737ca3f75045b3))
* **ng-doc:** ng-doc- destroys dependency entity after build ([d62d6c5](https://github.com/skoropadas/ng-doc/commit/d62d6c5f516d64b2691607ee76c26db4770a81eb))
* **ng-doc:** non peer dependencies array ([a3e733e](https://github.com/skoropadas/ng-doc/commit/a3e733e84ba8d352382550f3f27d2571f1f7706d))
* **ng-doc:** project fixes for default angular app ([4361ae0](https://github.com/skoropadas/ng-doc/commit/4361ae07b28ea41a2404d7b66a47fa66e29afe88))
* **ng-doc:** project fixes for default angular app ([83c571a](https://github.com/skoropadas/ng-doc/commit/83c571abb840b6625f90dec5b03d473f6a2adbc8))
* **ng-doc:** release config ([193dac2](https://github.com/skoropadas/ng-doc/commit/193dac2792a483d5b8f6e692e3b21f3a4f3f1089))
* **ng-doc:** release fixes ([653bcb9](https://github.com/skoropadas/ng-doc/commit/653bcb938aed9542acc9da454f4e6c058d8914d8))
* **ng-doc:** remove reference to builder ([7e4d7bc](https://github.com/skoropadas/ng-doc/commit/7e4d7bcf27d13a1d968c39e8a1db46f8ed5d31bf))
* **ng-doc:** rename `ng-doc-add` library ([a91449b](https://github.com/skoropadas/ng-doc/commit/a91449b677fe817ba7f7d46ed225817373f4381a))
* **ng-doc:** search doesnt show results ([af416fd](https://github.com/skoropadas/ng-doc/commit/af416fde6db507f5142dbcafa392569cc685f06f))
* **ng-doc:** several created entities are rendered incorrectly ([6761e4f](https://github.com/skoropadas/ng-doc/commit/6761e4fb156421e514966905e22ad7ad94e95e38))
* **ng-doc:** the css tab in the demo is still invisible after adding styles ([ad678a7](https://github.com/skoropadas/ng-doc/commit/ad678a7ec978e8b8606e7e867e0d3828b0e638cd))
* **ng-doc:** trigger for final beta ([c3e5e3b](https://github.com/skoropadas/ng-doc/commit/c3e5e3b597ee6361a2dd97372b05fe0f0894adfc))
* **ng-doc:** update angular dependencies ([2db13ff](https://github.com/skoropadas/ng-doc/commit/2db13ff70d704d3c935bb596f7465e84c0255319))
* **ng-doc:** update packages dependencies ([3124b4e](https://github.com/skoropadas/ng-doc/commit/3124b4e788644eb2ff4cb0795546fe8b25a4b63e))
* **page:** ng-doc doesn't forget about removed demos ([cc60604](https://github.com/skoropadas/ng-doc/commit/cc606046c318ce9f6601cab8b75cfc9c76b37390))
* **schematics:** auto import category creates incorrect import ([bfc2e3e](https://github.com/skoropadas/ng-doc/commit/bfc2e3eb67ae9805d69ab82d291442e538edafda))
* **schematics:** category parameter raise an error if there is no category in the folder ([1701fa4](https://github.com/skoropadas/ng-doc/commit/1701fa4642a203dcbd6bbb2f2a348f400b218f12))
* **schematics:** generated dependency file has invalid import of the page ([86e641b](https://github.com/skoropadas/ng-doc/commit/86e641b7d775790b9027274e60675939ab68b608))
* **tags:** add color for `@Injectable` decorator ([03ef2bb](https://github.com/skoropadas/ng-doc/commit/03ef2bb0d5cfcde4ff71081ababadb5a91842e98))


### Features

* **api:** add accessors section for classes and interfaces ([b1a4610](https://github.com/skoropadas/ng-doc/commit/b1a4610204d3def2ccdb92e38181e2c21df7e3d1))
* **api:** add constructor API for classes ([cf2083e](https://github.com/skoropadas/ng-doc/commit/cf2083e34e7363e91a5416680d0f2144f76a241a))
* **api:** add constructor API for classes ([b3f1411](https://github.com/skoropadas/ng-doc/commit/b3f1411d58182cd2ab83455f1202199247fd7100))
* **api:** add more types for classes implementing angular entities ([c5101bb](https://github.com/skoropadas/ng-doc/commit/c5101bbe29b7af80cb2a2fbba526cbdeefd58450))
* **api:** add tooltips for properties badges ([3812f14](https://github.com/skoropadas/ng-doc/commit/3812f14eabea75349db8f95ef1a11507d319f325))
* **api:** constructor parameters now display overrides, inherited and implements states ([f8445b4](https://github.com/skoropadas/ng-doc/commit/f8445b4bdcf7d00ffd0372119e453b53c19319b0))
* **api:** improvements for class and interface APIs ([c522ed2](https://github.com/skoropadas/ng-doc/commit/c522ed22243d645bc5d09131c870d9d698582a30))
* **app:** add shortcut for search field ([fb3fecc](https://github.com/skoropadas/ng-doc/commit/fb3fecc9eb85d4c8dff44554dd14352281708d17))
* **app:** add simple animation for dot in sidebar items ([7c2b154](https://github.com/skoropadas/ng-doc/commit/7c2b154dd55f9b9e547abf4f1c5bc0811389224b))
* **app:** add titles for guidelines and api pages ([2ed2f0d](https://github.com/skoropadas/ng-doc/commit/2ed2f0d3eea0f9dd2462ad5034c958f631688585))
* **app:** table of contents improvements and fixes ([e646dc0](https://github.com/skoropadas/ng-doc/commit/e646dc08a1106bc14756d905cd66cfc5557dabb3))
* **demo:** demo code will now be processed by the keyword processor ([fdbb8ad](https://github.com/skoropadas/ng-doc/commit/fdbb8ad1d8c3bd9a3a1a7f3d3d4c56d42e255a71))
* **ng-doc:** `ng-doc` is out! ([60af222](https://github.com/skoropadas/ng-doc/commit/60af222b8f3711a0ebdc9bf04a4a71c6f0cf8867))
* **ng-doc:** add `ThemeToggle` component ([d2ac6d3](https://github.com/skoropadas/ng-doc/commit/d2ac6d3a222940a6a3a19582ad965821529a5d51))
* **project:** public release ([8a01852](https://github.com/skoropadas/ng-doc/commit/8a0185288851a48fa08d615d331d6eca7e6f2a53))
* **tags:** add `Overridden` keyword for overridden methods and properties ([1fff33f](https://github.com/skoropadas/ng-doc/commit/1fff33fbdc7556089a22f478da491e091bed80e7))
* **ui-kit:** add `NgDocHotkeyDirective` for binding shortcuts ([e931994](https://github.com/skoropadas/ng-doc/commit/e931994febd1fbdb520238bd88945336950662d5))


### Performance Improvements

* **builder:** improve builder performance ([2543469](https://github.com/skoropadas/ng-doc/commit/25434695678754b895c30744435c407742bcc2a8))


### BREAKING CHANGES

* **ng-doc:** bump major version
