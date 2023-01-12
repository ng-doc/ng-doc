# [15.0.0-beta.32](https://github.com/skoropadas/ng-doc/compare/v15.0.0-beta.31...v15.0.0-beta.32) (2023-01-12)


### Bug Fixes

* **app:** toc is not stretched to full height ([1dce071](https://github.com/skoropadas/ng-doc/commit/1dce071ff8cc535e12a5a313297f52e6ebd61e5f))

# [15.0.0-beta.31](https://github.com/skoropadas/ng-doc/compare/v15.0.0-beta.30...v15.0.0-beta.31) (2023-01-12)


### Bug Fixes

* **api:** ng-doc displays private-public properties that have been set by the Angular Compiler ([0a82d7e](https://github.com/skoropadas/ng-doc/commit/0a82d7eaf5118d7a72b75f1ab324be3508cf184f))
* **api:** remove `override` keyword from function presentation ([379d65b](https://github.com/skoropadas/ng-doc/commit/379d65b6f3a4a79fcd7355cfceeaa4c462659b42))
* **api:** types in api list filter are not sorted ([16d5fee](https://github.com/skoropadas/ng-doc/commit/16d5fee3e51441b759f2892e06942c4c93fd13eb))
* **app:** tooltips on API pages are not centered ([2965224](https://github.com/skoropadas/ng-doc/commit/2965224c6fa17e072cabad16dabcee632452e74c))


### Features

* **api:** add more types for classes implementing angular entities ([c5101bb](https://github.com/skoropadas/ng-doc/commit/c5101bbe29b7af80cb2a2fbba526cbdeefd58450))
* **api:** constructor parameters now display overrides, inherited and implements states ([f8445b4](https://github.com/skoropadas/ng-doc/commit/f8445b4bdcf7d00ffd0372119e453b53c19319b0))
* **app:** table of contents improvements and fixes ([e646dc0](https://github.com/skoropadas/ng-doc/commit/e646dc08a1106bc14756d905cd66cfc5557dabb3))

# [15.0.0-beta.1](https://github.com/skoropadas/ng-doc/compare/v14.0.0...v15.0.0-beta.1) (2023-01-12)


### Bug Fixes

* **api:** ng-doc displays private-public properties that have been set by the Angular Compiler ([0a82d7e](https://github.com/skoropadas/ng-doc/commit/0a82d7eaf5118d7a72b75f1ab324be3508cf184f))
* **api:** remove `override` keyword from function presentation ([379d65b](https://github.com/skoropadas/ng-doc/commit/379d65b6f3a4a79fcd7355cfceeaa4c462659b42))
* **api:** types in api list filter are not sorted ([16d5fee](https://github.com/skoropadas/ng-doc/commit/16d5fee3e51441b759f2892e06942c4c93fd13eb))
* **app:** tooltips on API pages are not centered ([2965224](https://github.com/skoropadas/ng-doc/commit/2965224c6fa17e072cabad16dabcee632452e74c))
* **builder:** added path to API entity is not watched for changes ([8723bc7](https://github.com/skoropadas/ng-doc/commit/8723bc70be85a91bff149c1ca0c1d03daca80fc4))
* **builder:** all classes are abstract on the API page ([d4f3462](https://github.com/skoropadas/ng-doc/commit/d4f346223927a442673181b4acc46823696bcaa0))
* **builder:** api not updating automatically when files change ([1dcf640](https://github.com/skoropadas/ng-doc/commit/1dcf64089ce413b1d133622f40fad0d9ebae519a))
* **builder:** builder freezes if rendering fails ([b8cbd72](https://github.com/skoropadas/ng-doc/commit/b8cbd723397be8456874629de5d66561fd7ee070))
* **builder:** pages paths now uses sourceRoot folder by default ([564a89e](https://github.com/skoropadas/ng-doc/commit/564a89e0877777da10a6c2c0a9604f98e3b12523))
* **builder:** the dependency file was assembled incorrectly ([3afda1d](https://github.com/skoropadas/ng-doc/commit/3afda1dbb5865e866a9e04d5c7c9adec7cdb1d11))
* **demo:** demo recreates component every change detection cycle ([4421c7f](https://github.com/skoropadas/ng-doc/commit/4421c7f711e0c75d3518f7a826ab6e2e06a643c4))
* **dependencies:** dependency file doesn't generate assets when it was just created ([e408606](https://github.com/skoropadas/ng-doc/commit/e408606c5a464d8400be9d440fa71eff109332e1))
* **keywords:** ng-doc generates links not only for typescript code examples ([8646fb8](https://github.com/skoropadas/ng-doc/commit/8646fb82ccdcb0aafba4e6cf820f3e82b10dc7a1))
* **ng-doc:** `ng-doc` doesn't forget pages that have been moved to another directory ([c433a10](https://github.com/skoropadas/ng-doc/commit/c433a1007d07716833de2a987f9be63c7dc73a7a))
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
* **ng-doc:** release trigger ([e7ac592](https://github.com/skoropadas/ng-doc/commit/e7ac592fc2f5ddadceb6633d13d6a3790b4eeb00))
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
* **app:** table of contents improvements and fixes ([e646dc0](https://github.com/skoropadas/ng-doc/commit/e646dc08a1106bc14756d905cd66cfc5557dabb3))
* **demo:** demo code will now be processed by the keyword processor ([fdbb8ad](https://github.com/skoropadas/ng-doc/commit/fdbb8ad1d8c3bd9a3a1a7f3d3d4c56d42e255a71))
* **ng-doc:** `ng-doc` is out! ([60af222](https://github.com/skoropadas/ng-doc/commit/60af222b8f3711a0ebdc9bf04a4a71c6f0cf8867))
* **ng-doc:** add `ThemeToggle` component ([d2ac6d3](https://github.com/skoropadas/ng-doc/commit/d2ac6d3a222940a6a3a19582ad965821529a5d51))
* **tags:** add `Overridden` keyword for overridden methods and properties ([1fff33f](https://github.com/skoropadas/ng-doc/commit/1fff33fbdc7556089a22f478da491e091bed80e7))


### BREAKING CHANGES

* **ng-doc:** bump major version

# [15.0.0-beta.30](https://github.com/skoropadas/ng-doc/compare/v15.0.0-beta.29...v15.0.0-beta.30) (2023-01-08)


### Features

* **api:** add accessors section for classes and interfaces ([b1a4610](https://github.com/skoropadas/ng-doc/commit/b1a4610204d3def2ccdb92e38181e2c21df7e3d1))

# [15.0.0-beta.29](https://github.com/skoropadas/ng-doc/compare/v15.0.0-beta.28...v15.0.0-beta.29) (2023-01-08)


### Features

* **api:** add constructor API for classes ([cf2083e](https://github.com/skoropadas/ng-doc/commit/cf2083e34e7363e91a5416680d0f2144f76a241a))
* **api:** add constructor API for classes ([b3f1411](https://github.com/skoropadas/ng-doc/commit/b3f1411d58182cd2ab83455f1202199247fd7100))
* **api:** improvements for class and interface APIs ([c522ed2](https://github.com/skoropadas/ng-doc/commit/c522ed22243d645bc5d09131c870d9d698582a30))

# [15.0.0-beta.28](https://github.com/skoropadas/ng-doc/compare/v15.0.0-beta.27...v15.0.0-beta.28) (2023-01-04)


### Bug Fixes

* **keywords:** ng-doc generates links not only for typescript code examples ([8646fb8](https://github.com/skoropadas/ng-doc/commit/8646fb82ccdcb0aafba4e6cf820f3e82b10dc7a1))


### Features

* **api:** add tooltips for properties badges ([3812f14](https://github.com/skoropadas/ng-doc/commit/3812f14eabea75349db8f95ef1a11507d319f325))
* **demo:** demo code will now be processed by the keyword processor ([fdbb8ad](https://github.com/skoropadas/ng-doc/commit/fdbb8ad1d8c3bd9a3a1a7f3d3d4c56d42e255a71))

# [15.0.0-beta.27](https://github.com/skoropadas/ng-doc/compare/v15.0.0-beta.26...v15.0.0-beta.27) (2023-01-02)


### Bug Fixes

* **builder:** added path to API entity is not watched for changes ([8723bc7](https://github.com/skoropadas/ng-doc/commit/8723bc70be85a91bff149c1ca0c1d03daca80fc4))
* **tags:** add color for `@Injectable` decorator ([03ef2bb](https://github.com/skoropadas/ng-doc/commit/03ef2bb0d5cfcde4ff71081ababadb5a91842e98))


### Features

* **tags:** add `Overridden` keyword for overridden methods and properties ([1fff33f](https://github.com/skoropadas/ng-doc/commit/1fff33fbdc7556089a22f478da491e091bed80e7))

# [15.0.0-beta.26](https://github.com/skoropadas/ng-doc/compare/v15.0.0-beta.25...v15.0.0-beta.26) (2022-12-29)


### Bug Fixes

* **builder:** all classes are abstract on the API page ([d4f3462](https://github.com/skoropadas/ng-doc/commit/d4f346223927a442673181b4acc46823696bcaa0))
* **builder:** api not updating automatically when files change ([1dcf640](https://github.com/skoropadas/ng-doc/commit/1dcf64089ce413b1d133622f40fad0d9ebae519a))

# [15.0.0-beta.25](https://github.com/skoropadas/ng-doc/compare/v15.0.0-beta.24...v15.0.0-beta.25) (2022-12-23)


### Bug Fixes

* **ng-doc:** ng-doc- destroys dependency entity after build ([d62d6c5](https://github.com/skoropadas/ng-doc/commit/d62d6c5f516d64b2691607ee76c26db4770a81eb))
* **ng-doc:** several created entities are rendered incorrectly ([6761e4f](https://github.com/skoropadas/ng-doc/commit/6761e4fb156421e514966905e22ad7ad94e95e38))
* **ng-doc:** the css tab in the demo is still invisible after adding styles ([ad678a7](https://github.com/skoropadas/ng-doc/commit/ad678a7ec978e8b8606e7e867e0d3828b0e638cd))

# [15.0.0-beta.24](https://github.com/skoropadas/ng-doc/compare/v15.0.0-beta.23...v15.0.0-beta.24) (2022-12-23)


### Bug Fixes

* **ng-doc:** doesn't render all entities ([99d0562](https://github.com/skoropadas/ng-doc/commit/99d0562cea5227faca2ed2bd114515fd29292be4))

# [15.0.0-beta.23](https://github.com/skoropadas/ng-doc/compare/v15.0.0-beta.22...v15.0.0-beta.23) (2022-12-22)


### Bug Fixes

* **builder:** the dependency file was assembled incorrectly ([3afda1d](https://github.com/skoropadas/ng-doc/commit/3afda1dbb5865e866a9e04d5c7c9adec7cdb1d11))
* **schematics:** category parameter raise an error if there is no category in the folder ([1701fa4](https://github.com/skoropadas/ng-doc/commit/1701fa4642a203dcbd6bbb2f2a348f400b218f12))

# [15.0.0-beta.22](https://github.com/skoropadas/ng-doc/compare/v15.0.0-beta.21...v15.0.0-beta.22) (2022-12-22)


### Bug Fixes

* **page:** ng-doc doesn't forget about removed demos ([cc60604](https://github.com/skoropadas/ng-doc/commit/cc606046c318ce9f6601cab8b75cfc9c76b37390))

# [15.0.0-beta.21](https://github.com/skoropadas/ng-doc/compare/v15.0.0-beta.20...v15.0.0-beta.21) (2022-12-21)


### Bug Fixes

* **dependencies:** dependency file doesn't generate assets when it was just created ([e408606](https://github.com/skoropadas/ng-doc/commit/e408606c5a464d8400be9d440fa71eff109332e1))

# [15.0.0-beta.20](https://github.com/skoropadas/ng-doc/compare/v15.0.0-beta.19...v15.0.0-beta.20) (2022-12-20)


### Bug Fixes

* **ng-doc:** add README.md for builder ([a13325f](https://github.com/skoropadas/ng-doc/commit/a13325fbaccf495de35a084df2a39c70a81eb522))
* **ng-doc:** ng-doc doesn't update the indexes when page content has been updated ([31280f8](https://github.com/skoropadas/ng-doc/commit/31280f8aab9695604df395c5d9737ca3f75045b3))
* **schematics:** auto import category creates incorrect import ([bfc2e3e](https://github.com/skoropadas/ng-doc/commit/bfc2e3eb67ae9805d69ab82d291442e538edafda))

# [15.0.0-beta.19](https://github.com/skoropadas/ng-doc/compare/v15.0.0-beta.18...v15.0.0-beta.19) (2022-12-19)


### Bug Fixes

* **ng-doc:** trigger for final beta ([c3e5e3b](https://github.com/skoropadas/ng-doc/commit/c3e5e3b597ee6361a2dd97372b05fe0f0894adfc))

# [15.0.0-beta.18](https://github.com/skoropadas/ng-doc/compare/v15.0.0-beta.17...v15.0.0-beta.18) (2022-12-19)


### Bug Fixes

* **demo:** demo recreates component every change detection cycle ([4421c7f](https://github.com/skoropadas/ng-doc/commit/4421c7f711e0c75d3518f7a826ab6e2e06a643c4))

# [15.0.0-beta.17](https://github.com/skoropadas/ng-doc/compare/v15.0.0-beta.16...v15.0.0-beta.17) (2022-12-19)


### Bug Fixes

* **builder:** builder freezes if rendering fails ([b8cbd72](https://github.com/skoropadas/ng-doc/commit/b8cbd723397be8456874629de5d66561fd7ee070))
* **builder:** pages paths now uses sourceRoot folder by default ([564a89e](https://github.com/skoropadas/ng-doc/commit/564a89e0877777da10a6c2c0a9604f98e3b12523))
* **ng-doc:** `ng-doc` doesn't forget pages that have been moved to another directory ([6ba172e](https://github.com/skoropadas/ng-doc/commit/6ba172ee316c93893bb15fcb1f1ff3da18f0db36))
* **ng-doc:** ng-add doesn't update assets ([1bd745f](https://github.com/skoropadas/ng-doc/commit/1bd745fcd86cc8fb297d11950b25fb9d446b221b))
* **schematics:** generated dependency file has invalid import of the page ([86e641b](https://github.com/skoropadas/ng-doc/commit/86e641b7d775790b9027274e60675939ab68b608))

# [15.0.0-beta.16](https://github.com/skoropadas/ng-doc/compare/v15.0.0-beta.15...v15.0.0-beta.16) (2022-12-17)


### Bug Fixes

* **ng-doc:** `ng-doc` doesn't forget pages that have been moved to another directory ([c433a10](https://github.com/skoropadas/ng-doc/commit/c433a1007d07716833de2a987f9be63c7dc73a7a))

# [15.0.0-beta.15](https://github.com/skoropadas/ng-doc/compare/v15.0.0-beta.14...v15.0.0-beta.15) (2022-12-16)


### Bug Fixes

* **ng-doc:** update angular dependencies ([2db13ff](https://github.com/skoropadas/ng-doc/commit/2db13ff70d704d3c935bb596f7465e84c0255319))


### Features

* **ng-doc:** add `ThemeToggle` component ([d2ac6d3](https://github.com/skoropadas/ng-doc/commit/d2ac6d3a222940a6a3a19582ad965821529a5d51))

# [15.0.0-beta.14](https://github.com/skoropadas/ng-doc/compare/v15.0.0-beta.13...v15.0.0-beta.14) (2022-12-16)


### Bug Fixes

* **ng-doc:** add `allowSyntheticDefaultImports` to ng-add ([026e411](https://github.com/skoropadas/ng-doc/commit/026e4116ddd72cf90e4611d512cf4850f9cd3d0c))
* **ng-doc:** add raw-loader to the builder dependencies ([a234b8e](https://github.com/skoropadas/ng-doc/commit/a234b8e920b3dccbbca03e2827971b5b4d0ca194))
* **ng-doc:** remove reference to builder ([7e4d7bc](https://github.com/skoropadas/ng-doc/commit/7e4d7bcf27d13a1d968c39e8a1db46f8ed5d31bf))

# [15.0.0-beta.13](https://github.com/skoropadas/ng-doc/compare/v15.0.0-beta.12...v15.0.0-beta.13) (2022-12-16)


### Bug Fixes

* **ng-doc:** project fixes for default angular app ([4361ae0](https://github.com/skoropadas/ng-doc/commit/4361ae07b28ea41a2404d7b66a47fa66e29afe88))
* **ng-doc:** project fixes for default angular app ([83c571a](https://github.com/skoropadas/ng-doc/commit/83c571abb840b6625f90dec5b03d473f6a2adbc8))

# [15.0.0-beta.12](https://github.com/skoropadas/ng-doc/compare/v15.0.0-beta.11...v15.0.0-beta.12) (2022-12-16)


### Bug Fixes

* **ng-doc:** ng-add depends on nx ([2515fa9](https://github.com/skoropadas/ng-doc/commit/2515fa9e89722450b9e9fafad1ef0820da86c215))

# [15.0.0-beta.11](https://github.com/skoropadas/ng-doc/compare/v15.0.0-beta.10...v15.0.0-beta.11) (2022-12-16)


### Bug Fixes

* **ng-doc:** search doesnt show results ([af416fd](https://github.com/skoropadas/ng-doc/commit/af416fde6db507f5142dbcafa392569cc685f06f))

# [15.0.0-beta.10](https://github.com/skoropadas/ng-doc/compare/v15.0.0-beta.9...v15.0.0-beta.10) (2022-12-16)


### Bug Fixes

* **ng-doc:** fix @ng-doc/add schematics ([a705cc7](https://github.com/skoropadas/ng-doc/commit/a705cc70c7195db813388cca0b1ee791e32c29e7))

# [15.0.0-beta.9](https://github.com/skoropadas/ng-doc/compare/v15.0.0-beta.8...v15.0.0-beta.9) (2022-12-15)


### Bug Fixes

* **ng-doc:** release fixes ([653bcb9](https://github.com/skoropadas/ng-doc/commit/653bcb938aed9542acc9da454f4e6c058d8914d8))
* **ng-doc:** rename `ng-doc-add` library ([a91449b](https://github.com/skoropadas/ng-doc/commit/a91449b677fe817ba7f7d46ed225817373f4381a))

# [15.0.0-beta.8](https://github.com/skoropadas/ng-doc/compare/v15.0.0-beta.7...v15.0.0-beta.8) (2022-12-14)


### Bug Fixes

* **ng-doc:** move ng-add schematics to the external library ([066a548](https://github.com/skoropadas/ng-doc/commit/066a54891705117a434772b8e4116646a62e47e0))

# [15.0.0-beta.7](https://github.com/skoropadas/ng-doc/compare/v15.0.0-beta.6...v15.0.0-beta.7) (2022-12-14)


### Bug Fixes

* **ng-doc:** add cdk to dependencies for `@ng-doc/app` ([7f80a8c](https://github.com/skoropadas/ng-doc/commit/7f80a8c1f4aba4a9f1a780f8534996ec69884fa4))
* **ng-doc:** angular dependencies for `ng-doc/app` ([fc0f36e](https://github.com/skoropadas/ng-doc/commit/fc0f36ecfcea1c0c618fb577eb10df28b55ee6f9))
* **ng-doc:** fixes for schematics ([af031e3](https://github.com/skoropadas/ng-doc/commit/af031e316a668ae21ca2af78236cc66b2ab3fd79))

# [15.0.0-beta.6](https://github.com/skoropadas/ng-doc/compare/v15.0.0-beta.5...v15.0.0-beta.6) (2022-12-14)


### Bug Fixes

* **ng-doc:** add schema for `ng-add` command ([00ed2de](https://github.com/skoropadas/ng-doc/commit/00ed2debeeb6b88c9a4673634d8b73846fff7545))

# [15.0.0-beta.5](https://github.com/skoropadas/ng-doc/compare/v15.0.0-beta.4...v15.0.0-beta.5) (2022-12-14)


### Bug Fixes

* **ng-doc:** add npm access for packages ([0217c88](https://github.com/skoropadas/ng-doc/commit/0217c88c9e440dc7836e033cfcfa95ab63ef2487))

# [15.0.0-beta.4](https://github.com/skoropadas/ng-doc/compare/v15.0.0-beta.3...v15.0.0-beta.4) (2022-12-14)


### Bug Fixes

* **ng-doc:** release config ([193dac2](https://github.com/skoropadas/ng-doc/commit/193dac2792a483d5b8f6e692e3b21f3a4f3f1089))

# [15.0.0-beta.3](https://github.com/skoropadas/ng-doc/compare/v15.0.0-beta.2...v15.0.0-beta.3) (2022-12-14)


### Bug Fixes

* **ng-doc:** downgrade `chalk` version ([bc604ed](https://github.com/skoropadas/ng-doc/commit/bc604edc127fb50a5c1988cb1434803725f914b3))
* **ng-doc:** make package public ([0c4984c](https://github.com/skoropadas/ng-doc/commit/0c4984ca8122c55373378551410c656b5d3e12e1))
* **ng-doc:** non peer dependencies array ([a3e733e](https://github.com/skoropadas/ng-doc/commit/a3e733e84ba8d352382550f3f27d2571f1f7706d))
* **ng-doc:** update packages dependencies ([3124b4e](https://github.com/skoropadas/ng-doc/commit/3124b4e788644eb2ff4cb0795546fe8b25a4b63e))

# [15.0.0-beta.2](https://github.com/skoropadas/ng-doc/compare/v15.0.0-beta.1...v15.0.0-beta.2) (2022-12-14)


### Bug Fixes

* **ng-doc:** release trigger ([e7ac592](https://github.com/skoropadas/ng-doc/commit/e7ac592fc2f5ddadceb6633d13d6a3790b4eeb00))

# [15.0.0-beta.1](https://github.com/skoropadas/ng-doc/compare/v14.0.0...v15.0.0-beta.1) (2022-12-14)


### Features

* **ng-doc:** `ng-doc` is out! ([60af222](https://github.com/skoropadas/ng-doc/commit/60af222b8f3711a0ebdc9bf04a4a71c6f0cf8867))


### BREAKING CHANGES

* **ng-doc:** bump major version
