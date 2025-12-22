# [21.0.0](https://github.com/ng-doc/ng-doc/compare/v20.2.0...v21.0.0) (2025-12-22)


### Features

* **angular:** angular 21 support ([2497bc2](https://github.com/ng-doc/ng-doc/commit/2497bc2e9942d64aea2ab383802ad1cb07733dc9)), closes [#313](https://github.com/ng-doc/ng-doc/issues/313)


### BREAKING CHANGES

* **angular:** increase Angular major version

# [20.2.0](https://github.com/ng-doc/ng-doc/compare/v20.1.1...v20.2.0) (2025-12-19)


### Bug Fixes

* **package:** bump version of Mermaid to 10.9.5 ([#310](https://github.com/ng-doc/ng-doc/issues/310)) ([2a06f6d](https://github.com/ng-doc/ng-doc/commit/2a06f6d5118fb2606bfc54bc86900c860b48fb71)), closes [#309](https://github.com/ng-doc/ng-doc/issues/309)


### Features

* **playgrounds:** add `model` support ([1a6631f](https://github.com/ng-doc/ng-doc/commit/1a6631f85ed6b966e78c953864c7f1c392812bdb)), closes [#300](https://github.com/ng-doc/ng-doc/issues/300)
* remove `@angular/animation` dependency ([a45a5cb](https://github.com/ng-doc/ng-doc/commit/a45a5cbe094da99bc5219ead468b19226a0a9e76)), closes [#303](https://github.com/ng-doc/ng-doc/issues/303)

## [20.1.1](https://github.com/ng-doc/ng-doc/compare/v20.1.0...v20.1.1) (2025-11-02)


### Bug Fixes

* upgrade to @ng-web-apis/common@4.x and refactor deprecations ([#306](https://github.com/ng-doc/ng-doc/issues/306)) ([09917b1](https://github.com/ng-doc/ng-doc/commit/09917b18b5c030679eef48a66264e338f6b2a88e))

# [20.1.0](https://github.com/ng-doc/ng-doc/compare/v20.0.2...v20.1.0) (2025-06-25)


### Bug Fixes

* make shiki instance static in highlighter service ([#291](https://github.com/ng-doc/ng-doc/issues/291)) ([d9bbeaf](https://github.com/ng-doc/ng-doc/commit/d9bbeafe107dc626c6aa7bebb74ee226f7d7495f)), closes [#277](https://github.com/ng-doc/ng-doc/issues/277)
* ng-doc-tab was being removed when using grouped code blocks on guide pages ([#292](https://github.com/ng-doc/ng-doc/issues/292)) ([fba1054](https://github.com/ng-doc/ng-doc/commit/fba1054f69598437e180209658364c504f1b3beb))
* using base-href with ssg was breaking build ([#290](https://github.com/ng-doc/ng-doc/issues/290)) ([215778e](https://github.com/ng-doc/ng-doc/commit/215778e1fdfaa08d14d83fe786ce7c6dd91531e9)), closes [#263](https://github.com/ng-doc/ng-doc/issues/263)


### Features

* make category div a html button ([#289](https://github.com/ng-doc/ng-doc/issues/289)) ([ef3b71d](https://github.com/ng-doc/ng-doc/commit/ef3b71d465cce4c656e07ebce62cad854334fe0d)), closes [#257](https://github.com/ng-doc/ng-doc/issues/257)

## [20.0.2](https://github.com/ng-doc/ng-doc/compare/v20.0.1...v20.0.2) (2025-06-25)


### Bug Fixes

* ng-doc-ignore-line regex was working only for one digit number ([#288](https://github.com/ng-doc/ng-doc/issues/288)) ([b4f0482](https://github.com/ng-doc/ng-doc/commit/b4f0482c2d900e36cf96948acd4cafcebb53742a)), closes [#283](https://github.com/ng-doc/ng-doc/issues/283)

## [20.0.1](https://github.com/ng-doc/ng-doc/compare/v20.0.0...v20.0.1) (2025-06-24)


### Bug Fixes

* add missing nested category file imports ([#285](https://github.com/ng-doc/ng-doc/issues/285)) ([4dd6984](https://github.com/ng-doc/ng-doc/commit/4dd6984354cf3f50f892bf4af7fb3b491b276d62)), closes [#284](https://github.com/ng-doc/ng-doc/issues/284)

# [20.0.0](https://github.com/ng-doc/ng-doc/compare/v19.3.0...v20.0.0) (2025-06-15)


### Bug Fixes

* custom sematic-release plugins ([21a85a6](https://github.com/ng-doc/ng-doc/commit/21a85a6856271d27ad0ce25c98df51f9d8bbaad8))
* update sematic-release packages ([520e3e2](https://github.com/ng-doc/ng-doc/commit/520e3e200c043894450140ade05b8a448175b05b))


### Features

* **angular:** angular 20 support ([15202bc](https://github.com/ng-doc/ng-doc/commit/15202bc4db174db7ebaa02b3dfdc86db81465af6)), closes [#278](https://github.com/ng-doc/ng-doc/issues/278)


### BREAKING CHANGES

* **angular:** increase Angular major version

# [19.3.0](https://github.com/ng-doc/ng-doc/compare/v19.2.0...v19.3.0) (2025-06-14)


### Bug Fixes

* keywords don't support unicode characters ([370f2b2](https://github.com/ng-doc/ng-doc/commit/370f2b20a902afb3df878b2d0242ea2ea5c703a0)), closes [#274](https://github.com/ng-doc/ng-doc/issues/274)
* url in JSDoc breaks NgDocActions.playground ([2cefdd5](https://github.com/ng-doc/ng-doc/commit/2cefdd5bdfe90f75ec615175bcf84f48c902cd27)), closes [#281](https://github.com/ng-doc/ng-doc/issues/281)


### Features

* support for configuring providers for NgDocCategory ([78da9b2](https://github.com/ng-doc/ng-doc/commit/78da9b2728bb19934368fd1304e1ce4b415662b2)), closes [#195](https://github.com/ng-doc/ng-doc/issues/195)

# [19.2.0](https://github.com/ng-doc/ng-doc/compare/v19.1.0...v19.2.0) (2025-04-20)


### Bug Fixes

* **add:** automatic project configuration doesn't work ([111965c](https://github.com/ng-doc/ng-doc/commit/111965c6069e2b9485e7e20d4891df5a48dc4824)), closes [#273](https://github.com/ng-doc/ng-doc/issues/273)
* items inside collapsed expander were clickable ([#271](https://github.com/ng-doc/ng-doc/issues/271)) ([7a30f0f](https://github.com/ng-doc/ng-doc/commit/7a30f0f14b3e8b3a2a9585b840e9efeb5745493e))
* status tag visible in description ([#270](https://github.com/ng-doc/ng-doc/issues/270)) ([bc764fa](https://github.com/ng-doc/ng-doc/commit/bc764fab9f3d800dbd23acc20c7249fc8a34dd17)), closes [#269](https://github.com/ng-doc/ng-doc/issues/269)


### Features

* properties tables for Type Alias Declarations ([#261](https://github.com/ng-doc/ng-doc/issues/261)) ([aa3b658](https://github.com/ng-doc/ng-doc/commit/aa3b65851d2956408333e64a90b5b4ad2fe7cb9a)), closes [#259](https://github.com/ng-doc/ng-doc/issues/259)

# [19.1.0](https://github.com/ng-doc/ng-doc/compare/v19.0.1...v19.1.0) (2024-12-23)


### Bug Fixes

* **app:** mermaid has no text inside shapes ([#254](https://github.com/ng-doc/ng-doc/issues/254)) ([6eef471](https://github.com/ng-doc/ng-doc/commit/6eef471af8034dd140ef433fa4b93190784b5164)), closes [#253](https://github.com/ng-doc/ng-doc/issues/253)
* **builder:** at-rule (@) should not be evaluated inside code block ([cb4cd1e](https://github.com/ng-doc/ng-doc/commit/cb4cd1eb7d2088665de772b8924507b5e903576a)), closes [#232](https://github.com/ng-doc/ng-doc/issues/232)
* **builder:** multi-line param documentation doesn't display correctly ([1300b07](https://github.com/ng-doc/ng-doc/commit/1300b073598bd1612746d9a17384bfa79c11c518)), closes [#240](https://github.com/ng-doc/ng-doc/issues/240)
* **builder:** playground doesn't show values for user controls ([7185dc5](https://github.com/ng-doc/ng-doc/commit/7185dc50723b1c632bfcdc173d2dc3f9c6163dda)), closes [#235](https://github.com/ng-doc/ng-doc/issues/235)
* **builder:** specifying API Reference Page route Causing Asset Not Found ([dac0b6d](https://github.com/ng-doc/ng-doc/commit/dac0b6dafa07afe343ca10d72d266565c1a08b7f)), closes [#236](https://github.com/ng-doc/ng-doc/issues/236)


### Features

* **app:** make collapsed sidebar links SEO-friendly ([3217d5a](https://github.com/ng-doc/ng-doc/commit/3217d5a31168a96c4950b0073a6bb12425e4c54e))
* **builder:** add a call signatures support for interfaces API ([e132eaa](https://github.com/ng-doc/ng-doc/commit/e132eaa38a01fb39479b7314a355f4031eb9412d)), closes [#238](https://github.com/ng-doc/ng-doc/issues/238)

## [19.0.1](https://github.com/ng-doc/ng-doc/compare/v19.0.0...v19.0.1) (2024-12-09)


### Bug Fixes

* **builder:** isStandalone helper does not work with Angular new default value ([6ed4afe](https://github.com/ng-doc/ng-doc/commit/6ed4afeeabf1cbec940f730429bd807f8adb2c65)), closes [#252](https://github.com/ng-doc/ng-doc/issues/252)
* **builder:** isStandalone helper does not work with Angular new default value ([71af521](https://github.com/ng-doc/ng-doc/commit/71af521d2069b80a4487b948eb25de11ee53a662)), closes [#252](https://github.com/ng-doc/ng-doc/issues/252)

# [19.0.0](https://github.com/ng-doc/ng-doc/compare/v18.5.0...v19.0.0) (2024-12-08)


### Features

* **angular:** bump major version ([34aa025](https://github.com/ng-doc/ng-doc/commit/34aa025f509a67c847dd8873b7d2853cf913f3c1))


### BREAKING CHANGES

* **angular:** Angular 19 dependency

# [18.5.0](https://github.com/ng-doc/ng-doc/compare/v18.4.0...v18.5.0) (2024-12-08)


### Features

* **angular:** bump major version ([c094454](https://github.com/ng-doc/ng-doc/commit/c0944540cbc7cb415a8385d1fb709622fa7e7c13))

# [18.4.0](https://github.com/ng-doc/ng-doc/compare/v18.3.1...v18.4.0) (2024-12-08)


### Bug Fixes

* **project:** lock angular version for the `add` package ([bd7202d](https://github.com/ng-doc/ng-doc/commit/bd7202dc27e3e9f8c70869734a233ae05057149c))


### Features

* **angular:** add support for Angular 19 ([ab392d4](https://github.com/ng-doc/ng-doc/commit/ab392d4bd25d74a2cc91a769735ef33c1b7b69c3)), closes [#247](https://github.com/ng-doc/ng-doc/issues/247)

## [18.3.1](https://github.com/ng-doc/ng-doc/compare/v18.3.0...v18.3.1) (2024-11-26)


### Bug Fixes

* **project:** lock angular version to avoid dependency conflicts ([173063e](https://github.com/ng-doc/ng-doc/commit/173063e85aaa69e31f02521eac3243111ad64cd5))

# [18.3.0](https://github.com/ng-doc/ng-doc/compare/v18.2.0...v18.3.0) (2024-10-14)


### Features

* **builder:** added support for gitlab repos ([#231](https://github.com/ng-doc/ng-doc/issues/231)) ([39b20db](https://github.com/ng-doc/ng-doc/commit/39b20dbe9c2275107adfacc818cec0f7fa48b5a9))

# [18.2.0](https://github.com/ng-doc/ng-doc/compare/v18.1.1...v18.2.0) (2024-10-06)


### Bug Fixes

* **project:** single quote in page title breaks a build ([040b9b7](https://github.com/ng-doc/ng-doc/commit/040b9b7ff40781395af41398d29ac2907cf786b4)), closes [#223](https://github.com/ng-doc/ng-doc/issues/223)
* update @parcel/watcher version ([#225](https://github.com/ng-doc/ng-doc/issues/225)) ([c7f5717](https://github.com/ng-doc/ng-doc/commit/c7f57174c057e66d6caf014b92a1c4f591c5e083)), closes [#222](https://github.com/ng-doc/ng-doc/issues/222)


### Features

* **builder:** add support for `[@example](https://github.com/example)` tag ([#229](https://github.com/ng-doc/ng-doc/issues/229)) ([5d7440f](https://github.com/ng-doc/ng-doc/commit/5d7440f48922fd50e65df721c2169584355cfe86)), closes [#221](https://github.com/ng-doc/ng-doc/issues/221)
* **builder:** add support for `[@remarks](https://github.com/remarks)` tag ([#220](https://github.com/ng-doc/ng-doc/issues/220)) ([7958769](https://github.com/ng-doc/ng-doc/commit/79587690036c5c31fd5f372b5b77196e63c8d91e)), closes [#218](https://github.com/ng-doc/ng-doc/issues/218)
* **builder:** add support for `[@returns](https://github.com/returns)` tag ([#228](https://github.com/ng-doc/ng-doc/issues/228)) ([8dd4fd1](https://github.com/ng-doc/ng-doc/commit/8dd4fd1a716da998b34e6f7f7fc946f9569cc3c3)), closes [#219](https://github.com/ng-doc/ng-doc/issues/219)

## [18.1.1](https://github.com/ng-doc/ng-doc/compare/v18.1.0...v18.1.1) (2024-10-01)


### Bug Fixes

* **project:** bump patch version to fix NPM release ([196d237](https://github.com/ng-doc/ng-doc/commit/196d237338d198484e8ca1e2c228b21499d3af69))

# [18.1.0](https://github.com/ng-doc/ng-doc/compare/v18.0.9...v18.1.0) (2024-09-30)


### Bug Fixes

* **app:** resolving properly anchor links when using base-href ([#217](https://github.com/ng-doc/ng-doc/issues/217)) ([005c575](https://github.com/ng-doc/ng-doc/commit/005c575e92fba675ca661922573b072e41af8cc1)), closes [#216](https://github.com/ng-doc/ng-doc/issues/216)
* **keywords-loader:** adjust ng-keywords-loader to different api manifest structure ([#211](https://github.com/ng-doc/ng-doc/issues/211)) ([d9dc0aa](https://github.com/ng-doc/ng-doc/commit/d9dc0aa0d41242ef2b9c3824db6620ccc6a80b45)), closes [#210](https://github.com/ng-doc/ng-doc/issues/210)


### Features

* **keywords-loader:** add rxjs keywords loader ([#209](https://github.com/ng-doc/ng-doc/issues/209)) ([d96da81](https://github.com/ng-doc/ng-doc/commit/d96da817f7c3928cbd3e118bbdca7f4aebb50328))

## [18.0.9](https://github.com/ng-doc/ng-doc/compare/v18.0.8...v18.0.9) (2024-09-29)


### Bug Fixes

* **app:** treat links with `mailto:` prefix as external ([#215](https://github.com/ng-doc/ng-doc/issues/215)) ([23d7dee](https://github.com/ng-doc/ng-doc/commit/23d7dee60d733d341b5d837247324fe6e6ad0207)), closes [#194](https://github.com/ng-doc/ng-doc/issues/194)

## [18.0.8](https://github.com/ng-doc/ng-doc/compare/v18.0.7...v18.0.8) (2024-09-25)


### Bug Fixes

* **project:** bump patch version ([8845b9e](https://github.com/ng-doc/ng-doc/commit/8845b9ecc91351b8ada6c59947b6b65dcec822e7))

## [18.0.7](https://github.com/ng-doc/ng-doc/compare/v18.0.6...v18.0.7) (2024-09-24)


### Bug Fixes

* **project:** bump patch version ([937cc28](https://github.com/ng-doc/ng-doc/commit/937cc2888c30a3f2deb842dbb24b7c613d11b5d4))

## [18.0.6](https://github.com/ng-doc/ng-doc/compare/v18.0.5...v18.0.6) (2024-09-24)


### Bug Fixes

* **project:** bump patch version ([11a3173](https://github.com/ng-doc/ng-doc/commit/11a31731e15c86de880af12ffdb4da5340049f7c))

## [18.0.5](https://github.com/ng-doc/ng-doc/compare/v18.0.4...v18.0.5) (2024-09-24)


### Bug Fixes

* **builder:** generated folder is empty if a project doesn't contain pages ([4030683](https://github.com/ng-doc/ng-doc/commit/403068337c9031d70dc956757593eea53e8d5f48))

## [18.0.4](https://github.com/ng-doc/ng-doc/compare/v18.0.3...v18.0.4) (2024-09-24)


### Bug Fixes

* **add:** add schematic adds incorrect layout ([eb84266](https://github.com/ng-doc/ng-doc/commit/eb84266dcc70fe49d1bb97bfa07cbd6a30348100))
* **builder:** remove html-minifier vulnerability ([a560471](https://github.com/ng-doc/ng-doc/commit/a56047113674551559f084b77091d2a50f51614c)), closes [#206](https://github.com/ng-doc/ng-doc/issues/206)

## [18.0.3](https://github.com/ng-doc/ng-doc/compare/v18.0.2...v18.0.3) (2024-09-03)


### Bug Fixes

* **builder:** categories with the same folder name merges into one ([913af70](https://github.com/ng-doc/ng-doc/commit/913af701283f9f446fdbd32f13a7cf8d8821e74e)), closes [#204](https://github.com/ng-doc/ng-doc/issues/204)

## [18.0.2](https://github.com/ng-doc/ng-doc/compare/v18.0.1...v18.0.2) (2024-08-26)


### Bug Fixes

* **app:** page tabs overlap sidebar on mobile ([ec2fe13](https://github.com/ng-doc/ng-doc/commit/ec2fe132ee612ab3cd9e280288e4cf3e50333223))
* **app:** white glow on the sidebar when the dark theme is enabled on mobile ([1127d1c](https://github.com/ng-doc/ng-doc/commit/1127d1c5ffe9cc7a078b9bfacc685a9f9b187650))
* **builder:** missing entries in routes in CI/CD ([92f706d](https://github.com/ng-doc/ng-doc/commit/92f706da4cdf61509f21649f7eacdaf7d47223a3))
* **builder:** the app does not update when pages are added or removed ([6598ade](https://github.com/ng-doc/ng-doc/commit/6598aded7e4c3a0ad25487256fc811ca2adf759a))

## [18.0.1](https://github.com/ng-doc/ng-doc/compare/v18.0.0...v18.0.1) (2024-08-23)


### Bug Fixes

* **project:** bump patch version ([073384a](https://github.com/ng-doc/ng-doc/commit/073384a892970958036546101425f9ed2d0a64f7))

# [18.0.0](https://github.com/ng-doc/ng-doc/compare/v17.6.16...v18.0.0) (2024-08-23)


### Bug Fixes

* **project:** package versions and various small bugs ([1fefbd4](https://github.com/ng-doc/ng-doc/commit/1fefbd4a461c3d236dfd2e8f87b70057b8e32320))
* **project:** sync package-lock.json ([39098d9](https://github.com/ng-doc/ng-doc/commit/39098d9723d6fa3eeaa043ba6070a43edb8b37bf))
* **project:** theme by default feature ([5debaab](https://github.com/ng-doc/ng-doc/commit/5debaab9155176cfb7d777190bbaaa79937b28cb))


### Features

* **angular:** bump major version ([446d203](https://github.com/ng-doc/ng-doc/commit/446d203a4a8b9fc3f3b3d57a7ccb9d5588b4dde9))
* ngDoc18 ([144fb19](https://github.com/ng-doc/ng-doc/commit/144fb19696f691741198abf9f103892bdd07296c))


### BREAKING CHANGES

* **angular:** bump major version
* API changes

## [17.6.16](https://github.com/ng-doc/ng-doc/compare/v17.6.15...v17.6.16) (2024-07-18)


### Bug Fixes

* **builder:** build failed after update to the latest Angular and NgDoc version ([cd28db6](https://github.com/ng-doc/ng-doc/commit/cd28db6881b0679af2e8c9003129d34c5429fa6b)), closes [#192](https://github.com/ng-doc/ng-doc/issues/192)

## [17.6.15](https://github.com/ng-doc/ng-doc/compare/v17.6.14...v17.6.15) (2024-07-17)


### Bug Fixes

* **builder:** add support for Angular 18.1 ([30365c7](https://github.com/ng-doc/ng-doc/commit/30365c7d29be0c58b1c7c9fe9c94ff13d53f3d74)), closes [#189](https://github.com/ng-doc/ng-doc/issues/189)

## [17.6.14](https://github.com/ng-doc/ng-doc/compare/v17.6.13...v17.6.14) (2024-06-17)


### Bug Fixes

* **app:** anchor scrolling doesn't work for Chinese and Cyrillic characters ([5cb20e2](https://github.com/ng-doc/ng-doc/commit/5cb20e2f09f20b2b7cf8deef418e762a8970b6e5)), closes [#172](https://github.com/ng-doc/ng-doc/issues/172)

## [17.6.13](https://github.com/ng-doc/ng-doc/compare/v17.6.12...v17.6.13) (2024-06-14)


### Bug Fixes

* **ng-add:** undefined project in assets and tsconfig paths ([#160](https://github.com/ng-doc/ng-doc/issues/160)) ([df214a3](https://github.com/ng-doc/ng-doc/commit/df214a38fe8a8eb773b02f78c6ccdfad8029c017)), closes [#115](https://github.com/ng-doc/ng-doc/issues/115)

## [17.6.12](https://github.com/ng-doc/ng-doc/compare/v17.6.11...v17.6.12) (2024-06-14)


### Bug Fixes

* allows customizing the title of the API page ([#170](https://github.com/ng-doc/ng-doc/issues/170)) ([0bc22b5](https://github.com/ng-doc/ng-doc/commit/0bc22b5d4b585db2963b9d597f6549e15e8342af))

## [17.6.11](https://github.com/ng-doc/ng-doc/compare/v17.6.10...v17.6.11) (2024-06-06)


### Bug Fixes

* **app:** home icon in breadcrumb has invalid path ([8a9bb7e](https://github.com/ng-doc/ng-doc/commit/8a9bb7eacc539796b44afa69191193b476d40e58)), closes [#167](https://github.com/ng-doc/ng-doc/issues/167)

## [17.6.10](https://github.com/ng-doc/ng-doc/compare/v17.6.9...v17.6.10) (2024-05-27)


### Bug Fixes

* **builder:** cannot read properties of undefined (reading 'relative') ([42506f5](https://github.com/ng-doc/ng-doc/commit/42506f545f2363b3c87f042d51f166d2df105c31))

## [17.6.9](https://github.com/ng-doc/ng-doc/compare/v17.6.8...v17.6.9) (2024-05-27)


### Bug Fixes

* **app:** category imports break a build for Angular 17.3 and above ([e4163d4](https://github.com/ng-doc/ng-doc/commit/e4163d4079f1f61e1f77d8455e4f553d65c32eaf))

## [17.6.8](https://github.com/ng-doc/ng-doc/compare/v17.6.7...v17.6.8) (2024-05-08)


### Bug Fixes

* **app:** table of contents link does not work properly with `baseHref` ([f65fc1f](https://github.com/ng-doc/ng-doc/commit/f65fc1ffc11b36297377621bea6f7695816f20f7)), closes [#159](https://github.com/ng-doc/ng-doc/issues/159)

## [17.6.7](https://github.com/ng-doc/ng-doc/compare/v17.6.6...v17.6.7) (2024-05-03)


### Bug Fixes

* **builder:** setting `hidden: true` for the page doesn't have an effect ([6cf9aaa](https://github.com/ng-doc/ng-doc/commit/6cf9aaa62c17a38747393fe2590e60308a1f8c2d)), closes [#158](https://github.com/ng-doc/ng-doc/issues/158)

## [17.6.6](https://github.com/ng-doc/ng-doc/compare/v17.6.5...v17.6.6) (2024-05-01)


### Bug Fixes

* **builder:** eliminate dev-server schema validation error ([#153](https://github.com/ng-doc/ng-doc/issues/153)) ([68a9039](https://github.com/ng-doc/ng-doc/commit/68a903978db98ae5181b3b2891e3b4b3c2728159)), closes [#147](https://github.com/ng-doc/ng-doc/issues/147)

## [17.6.5](https://github.com/ng-doc/ng-doc/compare/v17.6.4...v17.6.5) (2024-04-30)


### Bug Fixes

* **builder:** playground templates do not support direct input directive binding (e.g., `<img [ngDocRotator]="true"/>`) ([ab8bcb2](https://github.com/ng-doc/ng-doc/commit/ab8bcb2303ceb01f023b05b442ae614de078a313))

## [17.6.4](https://github.com/ng-doc/ng-doc/compare/v17.6.3...v17.6.4) (2024-04-27)


### Bug Fixes

* **builder:** builder doesn't ignore inputs used for the component in the playground template ([75c89d0](https://github.com/ng-doc/ng-doc/commit/75c89d0632f55e1d525404421b3508ba3cc1c2a2)), closes [#156](https://github.com/ng-doc/ng-doc/issues/156)

## [17.6.3](https://github.com/ng-doc/ng-doc/compare/v17.6.2...v17.6.3) (2024-04-24)


### Bug Fixes

* **app:** input aliasing selector renders in playground template using property name ([d7cf81e](https://github.com/ng-doc/ng-doc/commit/d7cf81e918e768eb4f2cb3f5f46047bc75285428)), closes [#155](https://github.com/ng-doc/ng-doc/issues/155)

## [17.6.2](https://github.com/ng-doc/ng-doc/compare/v17.6.1...v17.6.2) (2024-04-22)


### Bug Fixes

* **builder:** imports in generated APIs lead to a build error for latest angular version ([1b4bdf6](https://github.com/ng-doc/ng-doc/commit/1b4bdf694f0c5bea6ca8f63cfe1c99f8363ce9f6))

## [17.6.1](https://github.com/ng-doc/ng-doc/compare/v17.6.0...v17.6.1) (2024-04-17)


### Bug Fixes

* **builder:** imports in `ng-doc.routing.ts` lead to a build error for latest angular version ([61effbf](https://github.com/ng-doc/ng-doc/commit/61effbfdf14830780ec938f2bf322588758e481c)), closes [#154](https://github.com/ng-doc/ng-doc/issues/154)

# [17.6.0](https://github.com/ng-doc/ng-doc/compare/v17.5.7...v17.6.0) (2024-04-14)


### Features

* **ui:** nunito font was removed, now UI uses system fonts by default ([32d3e11](https://github.com/ng-doc/ng-doc/commit/32d3e11f953a950e58c50067e839bacddd4b14ca)), closes [#152](https://github.com/ng-doc/ng-doc/issues/152)

## [17.5.7](https://github.com/ng-doc/ng-doc/compare/v17.5.6...v17.5.7) (2024-04-08)


### Bug Fixes

* **builder:** builder configuration doesn't support .js extension ([94773ac](https://github.com/ng-doc/ng-doc/commit/94773acf33f9d26a0cead5b027313a7de982643c)), closes [#148](https://github.com/ng-doc/ng-doc/issues/148)

## [17.5.6](https://github.com/ng-doc/ng-doc/compare/v17.5.5...v17.5.6) (2024-04-03)


### Bug Fixes

* **builder:** playgrounds break the build for the Angular 17.3 version ([54e8711](https://github.com/ng-doc/ng-doc/commit/54e87111bc7fae970370f03ea19f5aca822c1bdd)), closes [#144](https://github.com/ng-doc/ng-doc/issues/144)

## [17.5.5](https://github.com/ng-doc/ng-doc/compare/v17.5.4...v17.5.5) (2024-03-06)


### Bug Fixes

* **demo:** demos don't extract code from the new `styleUrl` property ([b8061f0](https://github.com/ng-doc/ng-doc/commit/b8061f05f6df77ce434fe0ca153af7efbe2cce65)), closes [#140](https://github.com/ng-doc/ng-doc/issues/140)
* **playgrounds:** recreating playground's demos doesn't work ([9b4bdb7](https://github.com/ng-doc/ng-doc/commit/9b4bdb7beef0026544a43d69e31be1787deb4219)), closes [#138](https://github.com/ng-doc/ng-doc/issues/138)

## [17.5.4](https://github.com/ng-doc/ng-doc/compare/v17.5.3...v17.5.4) (2024-03-03)


### Bug Fixes

* **builder:** input signals that have `undefined` in type are not displayed in playgrounds ([07dd7f6](https://github.com/ng-doc/ng-doc/commit/07dd7f62c42766c8c8aeac021159f306a9a7729f)), closes [#137](https://github.com/ng-doc/ng-doc/issues/137)

## [17.5.3](https://github.com/ng-doc/ng-doc/compare/v17.5.2...v17.5.3) (2024-03-02)


### Bug Fixes

* **builder:** builder doesnt format the code if application uses prettier >=2.x.x ([4df1eda](https://github.com/ng-doc/ng-doc/commit/4df1eda986412ab800173f32450015fce4ce8e17)), closes [#136](https://github.com/ng-doc/ng-doc/issues/136)

## [17.5.2](https://github.com/ng-doc/ng-doc/compare/v17.5.1...v17.5.2) (2024-02-27)


### Bug Fixes

* **app:** search icon is not displayed in the navbar for mobile and tablet views ([dcd3d6d](https://github.com/ng-doc/ng-doc/commit/dcd3d6dfc28fe8b668eb66ab68fed6014a9b6ad5))

## [17.5.1](https://github.com/ng-doc/ng-doc/compare/v17.5.0...v17.5.1) (2024-02-21)


### Bug Fixes

* **builder:** multiple API Configurations causes build error ([3389546](https://github.com/ng-doc/ng-doc/commit/33895468031007d43ca966ace815be5cfb9c9707)), closes [#133](https://github.com/ng-doc/ng-doc/issues/133)

# [17.5.0](https://github.com/ng-doc/ng-doc/compare/v17.4.0...v17.5.0) (2024-02-17)


### Features

* **builder:** add `inputs` property for `demo` and `demoPane` actions ([21a80cd](https://github.com/ng-doc/ng-doc/commit/21a80cdf52ade014afa388a5356ff6dc06264866)), closes [#132](https://github.com/ng-doc/ng-doc/issues/132)

# [17.4.0](https://github.com/ng-doc/ng-doc/compare/v17.3.2...v17.4.0) (2024-02-16)


### Features

* **builder:** add `excludeByTsDocsTags` function to filter out nodes based on TS documentation tags ([#131](https://github.com/ng-doc/ng-doc/issues/131)) ([2a55f57](https://github.com/ng-doc/ng-doc/commit/2a55f5717087309192bd0e012c9e707503b68d68))

## [17.3.2](https://github.com/ng-doc/ng-doc/compare/v17.3.1...v17.3.2) (2024-02-15)


### Bug Fixes

* **ui-kit:** checkbox always displays checked state ([5f752fe](https://github.com/ng-doc/ng-doc/commit/5f752fe83d71b207edec82fcba2c7f629b5ea228))
* **ui-kit:** remove redundant input in button component ([f0335dd](https://github.com/ng-doc/ng-doc/commit/f0335dddeb10f1b508d3d4f904e95ba71b647fd9))

## [17.3.1](https://github.com/ng-doc/ng-doc/compare/v17.3.0...v17.3.1) (2024-02-13)


### Bug Fixes

* **builder:** add missed name options in schemas ([#130](https://github.com/ng-doc/ng-doc/issues/130)) ([f35ed2c](https://github.com/ng-doc/ng-doc/commit/f35ed2c66452d731782a043c538fbca66a2adbe8))

# [17.3.0](https://github.com/ng-doc/ng-doc/compare/v17.2.3...v17.3.0) (2024-01-18)


### Features

* **builder:** add support for `input` signal ([#129](https://github.com/ng-doc/ng-doc/issues/129)) ([a4042af](https://github.com/ng-doc/ng-doc/commit/a4042afe14d5936ddbcf37f559421a8ea8026bc4))

## [17.2.3](https://github.com/ng-doc/ng-doc/compare/v17.2.2...v17.2.3) (2024-01-12)


### Bug Fixes

* **ui-kit:** update @ngneat/until-destroy dependency ([e2d1d5c](https://github.com/ng-doc/ng-doc/commit/e2d1d5cf240089e64bcb1dedb1fa6ab2fa9935d1)), closes [#127](https://github.com/ng-doc/ng-doc/issues/127)

## [17.2.2](https://github.com/ng-doc/ng-doc/compare/v17.2.1...v17.2.2) (2024-01-07)


### Bug Fixes

* **app:** table of content is not displayed ([f08373d](https://github.com/ng-doc/ng-doc/commit/f08373d4cf169be8f1c31d07e05f5d2c8364da4d))

## [17.2.1](https://github.com/ng-doc/ng-doc/compare/v17.2.0...v17.2.1) (2023-12-27)


### Bug Fixes

* **add:** add schematics don't add HttpClient provider by default ([1dccda3](https://github.com/ng-doc/ng-doc/commit/1dccda344824e8793a98ea81b28ae8450e1c3c94))

# [17.2.0](https://github.com/ng-doc/ng-doc/compare/v17.1.3...v17.2.0) (2023-12-18)


### Features

* **project:** add SSR support ([#119](https://github.com/ng-doc/ng-doc/issues/119)) ([2e16359](https://github.com/ng-doc/ng-doc/commit/2e16359de6b5cc11d48459c0f9f30e26ac8084a2)), closes [#114](https://github.com/ng-doc/ng-doc/issues/114)

## [17.1.3](https://github.com/ng-doc/ng-doc/compare/v17.1.2...v17.1.3) (2023-12-01)


### Bug Fixes

* **app:** inputs with type `string` display model incorrectly ([948dae6](https://github.com/ng-doc/ng-doc/commit/948dae6df8cb01f2238900446830f10666a2542e))
* **builder:** playgrounds don't support `@Input` accessors ([d5c12c8](https://github.com/ng-doc/ng-doc/commit/d5c12c8f000f6c71b958c09b297dde0b8b331e28)), closes [#116](https://github.com/ng-doc/ng-doc/issues/116)
* **core:** playground fails with errors for some specific input types ([1ec8668](https://github.com/ng-doc/ng-doc/commit/1ec86686728fae65bc17200370839dd99c8283c8))

## [17.1.2](https://github.com/ng-doc/ng-doc/compare/v17.1.1...v17.1.2) (2023-11-21)


### Bug Fixes

* **add:** automatic installation of the library does not add the default layout ([544c66a](https://github.com/ng-doc/ng-doc/commit/544c66af47068c61d9b54985986f454a65aacf4c))

## [17.1.1](https://github.com/ng-doc/ng-doc/compare/v17.1.0...v17.1.1) (2023-11-21)


### Bug Fixes

* **add:** automatic installation of the library does not add the default layout ([3c10464](https://github.com/ng-doc/ng-doc/commit/3c10464cd70abfff61c687b3fc40bacb0f7e1bdf))

# [17.1.0](https://github.com/ng-doc/ng-doc/compare/v17.0.0...v17.1.0) (2023-11-21)


### Bug Fixes

* **add:** imports of default modules in some cases are added to the wrong file ([50f691a](https://github.com/ng-doc/ng-doc/commit/50f691aa2dc304d16bd3f9fabfb79a196730207e))
* **add:** migration and adding ng-doc leads to warnings ([7cfe6d6](https://github.com/ng-doc/ng-doc/commit/7cfe6d6aadd190238d64639d0e69422a95928756))
* **ui-kit:** fix ``@angular/cdk` version ([bd4573a](https://github.com/ng-doc/ng-doc/commit/bd4573a026228d5d6ea02e05c36dfe387f2ca58e))


### Continuous Integration

* **angular:** add Angular 17 support. Vite + ESBuild is now used by default, and support for Webpack has been removed. Please follow the migration instructions https://ng-doc.com/docs/getting-started/migrations ([b6bdd6d](https://github.com/ng-doc/ng-doc/commit/b6bdd6dbd46eb9c92698041d024499e44e6f322e)), closes [#109](https://github.com/ng-doc/ng-doc/issues/109)


### BREAKING CHANGES

* **angular:** Angular 17

# [18.0.0](https://github.com/ng-doc/ng-doc/compare/v17.0.0...v18.0.0) (2023-11-21)


### Bug Fixes

* **add:** imports of default modules in some cases are added to the wrong file ([50f691a](https://github.com/ng-doc/ng-doc/commit/50f691aa2dc304d16bd3f9fabfb79a196730207e))
* **add:** migration and adding ng-doc leads to warnings ([7cfe6d6](https://github.com/ng-doc/ng-doc/commit/7cfe6d6aadd190238d64639d0e69422a95928756))
* **ui-kit:** fix ``@angular/cdk` version ([bd4573a](https://github.com/ng-doc/ng-doc/commit/bd4573a026228d5d6ea02e05c36dfe387f2ca58e))


### Continuous Integration

* **angular:** add Angular 17 support. Vite + ESBuild is now used by default, and support for Webpack has been removed. Please follow the migration instructions https://ng-doc.com/docs/getting-started/migrations ([b6bdd6d](https://github.com/ng-doc/ng-doc/commit/b6bdd6dbd46eb9c92698041d024499e44e6f322e)), closes [#109](https://github.com/ng-doc/ng-doc/issues/109)


### BREAKING CHANGES

* **angular:** Angular 17

# [17.0.0](https://github.com/ng-doc/ng-doc/compare/v16.18.0...v17.0.0) (2023-11-20)


### Continuous Integration

* **angular:** add Angular 17 support. Vite + ESBuild is now used by default, and support for Webpack has been removed. Please follow the migration instructions https://ng-doc.com/docs/getting-started/migrations ([ca98292](https://github.com/ng-doc/ng-doc/commit/ca982921177f0103a4dba15d7ea315cb37e4c804)), closes [#109](https://github.com/ng-doc/ng-doc/issues/109)


### BREAKING CHANGES

* **angular:** Angular 17

# [16.18.0](https://github.com/ng-doc/ng-doc/compare/v16.17.0...v16.18.0) (2023-11-20)


### Features

* **core,app:** can disable fullscreen routes in the page configuration ([a5849d2](https://github.com/ng-doc/ng-doc/commit/a5849d2144199ea3b3b0b45edbf49635e582ce17)), closes [#106](https://github.com/ng-doc/ng-doc/issues/106)
* **project:** add Angular 17 support. Vite + ESBuild is now used by default, and support for Webpack has been removed. Please follow the migration instructions https://ng-doc.com/docs/getting-started/migrations ([#109](https://github.com/ng-doc/ng-doc/issues/109)) ([c40e247](https://github.com/ng-doc/ng-doc/commit/c40e2478a21d63465662927bd1f8ef129326cfbe))

# [16.17.0](https://github.com/ng-doc/ng-doc/compare/v16.16.0...v16.17.0) (2023-11-18)


### Features

* **core,app:** can disable fullscreen routes in the page configuration ([0e31089](https://github.com/ng-doc/ng-doc/commit/0e31089ab79466336e256a0d98f33db52cc412cc)), closes [#106](https://github.com/ng-doc/ng-doc/issues/106)

# [16.16.0](https://github.com/ng-doc/ng-doc/compare/v16.15.1...v16.16.0) (2023-09-20)


### Bug Fixes

* **app:** theme service throws warning if light theme is selected by default ([f6ca077](https://github.com/ng-doc/ng-doc/commit/f6ca0776d7c69c228f5ab2886ac7f9deb743c36b))


### Features

* **project:** add fullscreen mode for demos ([c557f17](https://github.com/ng-doc/ng-doc/commit/c557f1770653550e4a3348ec2a23b884088f67e8)), closes [#84](https://github.com/ng-doc/ng-doc/issues/84)


### Performance Improvements

* **builder:** builder no longer writes files to disk if their content hasn't changed, which slightly speeds up the application rebuild process ([5a80548](https://github.com/ng-doc/ng-doc/commit/5a805487be43fce6d76d73d0396228cf6a746829))

## [16.15.1](https://github.com/ng-doc/ng-doc/compare/v16.15.0...v16.15.1) (2023-09-08)


### Bug Fixes

* **app:** playgrounds for pipes display changed inputs in demo's template in wrong order ([fb51e9d](https://github.com/ng-doc/ng-doc/commit/fb51e9d07d10ceaddd8d99a6678ac6fb3fa7c86f))
* **app:** playgrounds for pipes don't display default values for inputs in the production ([4f2a271](https://github.com/ng-doc/ng-doc/commit/4f2a27175f8994bdffd77dde5442efb8ab15e6ec))
* **app:** toc throws an error if page has no headings ([77334e5](https://github.com/ng-doc/ng-doc/commit/77334e58f1c98fa4baf3ca941c8b5c2606884e91))

# [16.15.0](https://github.com/ng-doc/ng-doc/compare/v16.14.0...v16.15.0) (2023-09-04)


### Features

* **app:** add `alert` blockquote type ([fbd607a](https://github.com/ng-doc/ng-doc/commit/fbd607a284118cc85bc01aa969c9aa35965d8f48))
* **app:** blockquotes were redesigned ([64a8577](https://github.com/ng-doc/ng-doc/commit/64a8577923eb479aabf861004bf6eee3136c9164))
* **app:** design has been updated, and now the elements better complement each other and are easier to customize ([96f540d](https://github.com/ng-doc/ng-doc/commit/96f540de8a5ba56ef7fb7ded22ccc7163091148c))
* **app:** theme service has been improved, now you can enable or disable auto theming using `NgDocThemeService`, or define your own themes for auto theming ([5e7959f](https://github.com/ng-doc/ng-doc/commit/5e7959f4f0dafd2440dab59226df5e5f20bc4f3d))
* **playground:** playground displays "Reset" button only if form is changed ([5d13545](https://github.com/ng-doc/ng-doc/commit/5d13545fcc9364ede8721575ab63f887f4c845a0))


### BREAKING CHANGES

* **app:** The CSS color palette variables
`--ng-doc-<color>-<shade>` have been removed because they were redundant
and mostly cluttered the CSS

# [16.14.0](https://github.com/ng-doc/ng-doc/compare/v16.13.1...v16.14.0) (2023-09-04)


### Bug Fixes

* **app:** dark-purple theme was removed ([fb9cffe](https://github.com/ng-doc/ng-doc/commit/fb9cffe01f3f491c24717cc39175a9356effa2c8))
* **app:** styles from ng-doc affect other components ([270eafd](https://github.com/ng-doc/ng-doc/commit/270eafd22b135355418d647de5e2914118ebe526))
* **builder:** builder crashes with an error when trying to load files on Windows ([d564c84](https://github.com/ng-doc/ng-doc/commit/d564c84bc06fece6a6e0d60ab7dd1a6d1b98765e)), closes [#102](https://github.com/ng-doc/ng-doc/issues/102)


### Features

* **app:** code blocks and code block groups were redesigned ([a228922](https://github.com/ng-doc/ng-doc/commit/a2289227e367dcec723b08dc4062eae60fc3b36e))


### BREAKING CHANGES

* **app:** `dark-purple` theme was removed

## [16.13.1](https://github.com/ng-doc/ng-doc/compare/v16.13.0...v16.13.1) (2023-09-01)


### Bug Fixes

* **processor:** add `provideMainPageProcessor` function ([ca3cd76](https://github.com/ng-doc/ng-doc/commit/ca3cd76ee195b89cd6bf18a196152edd1ae393c4))

# [16.13.0](https://github.com/ng-doc/ng-doc/compare/v16.12.1...v16.13.0) (2023-08-31)


### Bug Fixes

* **add:** schematic doesn't import `NgDocRootComponent` component ([c07b389](https://github.com/ng-doc/ng-doc/commit/c07b3894458da69f94922866fdceac72cd5564ec))
* **add:** schematic doesn't provide `provideNgDocApp` configuration ([6d698d7](https://github.com/ng-doc/ng-doc/commit/6d698d77ce93ddc8c909366861d716b90a38e683))
* **builder:** ESM page compilation ([#100](https://github.com/ng-doc/ng-doc/issues/100)) ([3a4b36a](https://github.com/ng-doc/ng-doc/commit/3a4b36ad676974b904519e7f6d70c5e5b83b308e))


### Features

* **project:** page layout components (page navigation, breadcrumbs, table of content) can be replaced with your own. Project was converted to standalone ([#101](https://github.com/ng-doc/ng-doc/issues/101)) ([d7aad28](https://github.com/ng-doc/ng-doc/commit/d7aad2899216490c6a1a0de64d09b10dfa3ebf15)), closes [#88](https://github.com/ng-doc/ng-doc/issues/88) [#66](https://github.com/ng-doc/ng-doc/issues/66)
* **styles:** change margin of various page blocks to improve spacing and readability, add `--ng-doc-page-block-margin` variable that can be used to change it globally ([1441f89](https://github.com/ng-doc/ng-doc/commit/1441f8908bb2ddcdc41938280fea40d8d7f05f42))


### BREAKING CHANGES

* **project:** All modules were removed, you should use provider
functions instead. Please read the "Migration" article to know more.

## [16.12.1](https://github.com/ng-doc/ng-doc/compare/v16.12.0...v16.12.1) (2023-08-24)


### Bug Fixes

* **builder:** app cannot be built if some of the playground properties imports entity from Angular package ([dc57891](https://github.com/ng-doc/ng-doc/commit/dc57891ee6f5beabfa3e66c2293fa20b2f297373)), closes [#99](https://github.com/ng-doc/ng-doc/issues/99)

# [16.12.0](https://github.com/ng-doc/ng-doc/compare/v16.11.1...v16.12.0) (2023-08-20)


### Bug Fixes

* **project:** providers inside a component is not recognized in playgrounds ([26705a6](https://github.com/ng-doc/ng-doc/commit/26705a6f548627813953428afdc0aa7c709a785a)), closes [#96](https://github.com/ng-doc/ng-doc/issues/96)


### Features

* **playgrounds:** add `controls` property to playgrounds to define inputs that NgDoc doesn't recognize, and `hiddenInputs` to hide specific inputs in the playground ([1cdcca9](https://github.com/ng-doc/ng-doc/commit/1cdcca9aad52f805baadb7ab3c1db8981a42cb49)), closes [#97](https://github.com/ng-doc/ng-doc/issues/97)

## [16.11.1](https://github.com/ng-doc/ng-doc/compare/v16.11.0...v16.11.1) (2023-08-13)


### Bug Fixes

* **project:** providers inside a component is not recognized in playgrounds ([fcf8298](https://github.com/ng-doc/ng-doc/commit/fcf8298ecbde5fd09c909790247b49998d7f379d)), closes [#96](https://github.com/ng-doc/ng-doc/issues/96)

# [16.11.0](https://github.com/ng-doc/ng-doc/compare/v16.10.0...v16.11.0) (2023-08-07)


### Bug Fixes

* **playgrounds:** the component created in the playground with the set values of `defaults` or `inputs` receives `undefined` in the `ngOnChanges` hook for the set inputs ([2b21918](https://github.com/ng-doc/ng-doc/commit/2b2191845b20fbbb9acd66c633725d049895ea1d))
* **schematics:** schematics incorrectly import parent category on Windows ([59293ee](https://github.com/ng-doc/ng-doc/commit/59293ee9d8ff6a6bf2676bee52062b7b94b0ef28))


### Features

* **builder:** add support for `ng-doc-ignore-line` comment to remove some lines of code from demo or code blocks ([#93](https://github.com/ng-doc/ng-doc/issues/93)) ([8b668b2](https://github.com/ng-doc/ng-doc/commit/8b668b270558cc375993c337560b64b3b3dae83a)), closes [#83](https://github.com/ng-doc/ng-doc/issues/83)
* **builder:** add support for `Route` interface for the `route` property of the page configuration ([#94](https://github.com/ng-doc/ng-doc/issues/94)) ([65c1bd7](https://github.com/ng-doc/ng-doc/commit/65c1bd7288288dd74070e1bdf1ff785e250bb264)), closes [#89](https://github.com/ng-doc/ng-doc/issues/89)
* **builder:** add support for loading snippets from files ([f8889db](https://github.com/ng-doc/ng-doc/commit/f8889dbcfcc5cd6ec3c76c7dc61d3721706f69df))
* **builder:** add support for query parameters for the keywords ([#95](https://github.com/ng-doc/ng-doc/issues/95)) ([d0da419](https://github.com/ng-doc/ng-doc/commit/d0da4195685bff617e0782bf1157c3c94ad332d8)), closes [#86](https://github.com/ng-doc/ng-doc/issues/86)
* **builder:** add support for the keywords for the API configuration ([4166685](https://github.com/ng-doc/ng-doc/commit/416668519a72943ce1a1f293f304bc2146d1910f))
* **demo:** the snippets have been reworked and their syntax has been changed also new features have been added, such as icons, language switching, etc. The previous syntax is still supported, but it is recommended to migrate to the new one ([#92](https://github.com/ng-doc/ng-doc/issues/92)) ([2cc98cf](https://github.com/ng-doc/ng-doc/commit/2cc98cfa2b41d2d81df00334b5052a49ef7002f6))

# [16.10.0](https://github.com/ng-doc/ng-doc/compare/v16.9.0...v16.10.0) (2023-07-18)


### Bug Fixes

* **app:** `search` and `menu icons are missed for the mobile view ([886e1ae](https://github.com/ng-doc/ng-doc/commit/886e1ae4166da61fd77df85991dd8437ef16f28f))
* **schematics:** `order` property in generate category has a string type ([b5aa730](https://github.com/ng-doc/ng-doc/commit/b5aa730424dee55249746749ad72dc78f2927b49))


### Features

* **builder:** add ability to set different ng-doc configuration files for different build targets ([bb0c8d0](https://github.com/ng-doc/ng-doc/commit/bb0c8d04167ca3456c1f6813b07cb923bec0e57d))

# [16.9.0](https://github.com/ng-doc/ng-doc/compare/v16.8.1...v16.9.0) (2023-07-08)


### Features

* **ui-kit:** add icons support for code blocks and code block groups ([687b4cc](https://github.com/ng-doc/ng-doc/commit/687b4cc35772d6758995f8183ac03c8d9a157817))
* **ui-kit:** add the ability to add custom icons to the documentation ([30c4012](https://github.com/ng-doc/ng-doc/commit/30c40120c9b20401ba011865c4cbb737f1c6b6a5))


### Performance Improvements

* **ui-kit:** remove all unused icon from `ui-kit` library ([8b01fec](https://github.com/ng-doc/ng-doc/commit/8b01fec513f817114caf658db0827c5fd12a2bf1))

## [16.8.1](https://github.com/ng-doc/ng-doc/compare/v16.8.0...v16.8.1) (2023-07-07)


### Bug Fixes

* **playgrounds:** playground does not display inputs defined in parent classes ([#81](https://github.com/ng-doc/ng-doc/issues/81)) ([31b882a](https://github.com/ng-doc/ng-doc/commit/31b882a0279db793fe9defe092dccde05f69cb54))

# [16.8.0](https://github.com/ng-doc/ng-doc/compare/v16.7.2...v16.8.0) (2023-07-07)


### Bug Fixes

* **schematics:** using slashes in the `title` leads to changing the final directory where the generated file will be placed ([1436ff9](https://github.com/ng-doc/ng-doc/commit/1436ff9c34161291967bb281d40aa21c38433648))


### Features

* **page-processors:** page processor is now a public API and can be used for dynamically creating components within pages, check documentation for more details ([8f98d6e](https://github.com/ng-doc/ng-doc/commit/8f98d6e9eeedf0618b90b106e03c808fb480b2ce))
* **playgrounds:** add more opportunities to configure playgrounds, making them more dynamic and reusable ([#80](https://github.com/ng-doc/ng-doc/issues/80)) ([cc661fb](https://github.com/ng-doc/ng-doc/commit/cc661fbb23e14e41f6949091204a671893453a6e))
* **project:** configuration format simplification for all NgDoc files like `ng-doc.page.ts`, `ng-doc.category.ts`, `ng-doc.api.ts` and `ng-doc.config.ts`. Please read migrations article to know how to migrate to the new conifg format ([e12f4a4](https://github.com/ng-doc/ng-doc/commit/e12f4a4335909e949c55397768a6f68158a3a40f)), closes [#75](https://github.com/ng-doc/ng-doc/issues/75)
* **schematics:** add `--name` flag for `page` and `category` schematics that can be used to provide variable name ([4188b7b](https://github.com/ng-doc/ng-doc/commit/4188b7bf8a50b3b4e041e1c40909c7a3c43b05ff)), closes [#75](https://github.com/ng-doc/ng-doc/issues/75)

## [16.7.2](https://github.com/ng-doc/ng-doc/compare/v16.7.1...v16.7.2) (2023-07-05)


### Bug Fixes

* **builder:** playgrounds do not dynamically update the list of inputs when the `dev-server` is running, and used class is included in the API list ([d25a410](https://github.com/ng-doc/ng-doc/commit/d25a41063db76cbd6bea99a3cb4886c444269139))
* **playgrounds:** playgrounds do not recognize dynamic default values, such as the result of a function call or a value from a constructor variable ([dd5381b](https://github.com/ng-doc/ng-doc/commit/dd5381b4dbd3c418fa98faf7cec4c1a86dd8c249)), closes [#76](https://github.com/ng-doc/ng-doc/issues/76)
* **ui-kit:** the text of the tabs overlaps with the overlay created by the sidebar ([d66f649](https://github.com/ng-doc/ng-doc/commit/d66f649d7fa3c1a80b85ab24594ec3e9254d3bcd))
* **utils:** keywords used in the inline code are processed not as a whole, but by attempting to find occurrences ([024f43f](https://github.com/ng-doc/ng-doc/commit/024f43fdc4828d7b6c30d1ae884335c59e8c2fef))

## [16.7.1](https://github.com/ng-doc/ng-doc/compare/v16.7.0...v16.7.1) (2023-07-03)


### Bug Fixes

* **builder:** generated links for the accessors via keywords have incorrect label ([da70a1b](https://github.com/ng-doc/ng-doc/commit/da70a1b9b28d24f7c1aa52d333ea6cdd609472be))
* **builder:** some code presentations or files that were loaded to the code blocks have empty line at the end ([7382b73](https://github.com/ng-doc/ng-doc/commit/7382b73e5aef03da52c67abc59decf9a69fa9e15))

# [16.7.0](https://github.com/ng-doc/ng-doc/compare/v16.6.6...v16.7.0) (2023-07-02)


### Bug Fixes

* **builder:** code blocks parameters don't support some characters ([b91d26f](https://github.com/ng-doc/ng-doc/commit/b91d26f97d2fe02f0fd708d27f6659d560736d70))
* **builder:** code blocks parameters don't support some characters ([77a989c](https://github.com/ng-doc/ng-doc/commit/77a989cabbec7f06ecb31e2acd266ad2c56ce1a9))


### Features

* **project:** code blocks can now be grouped using tabs ([f9d2ef1](https://github.com/ng-doc/ng-doc/commit/f9d2ef1f270f4f61773bb73699216e38ec17b6bb))
* **project:** code blocks can now be grouped using tabs ([11c0ed1](https://github.com/ng-doc/ng-doc/commit/11c0ed143aa8c098e28e03943437382f2a6767f2))

## [16.6.6](https://github.com/ng-doc/ng-doc/compare/v16.6.5...v16.6.6) (2023-07-01)


### Bug Fixes

* **builder:** fix tests ([0aca03c](https://github.com/ng-doc/ng-doc/commit/0aca03cb1121ec8418abf1f8bfd8908f714c452f))
* **builder:** generated files via schematics have some miss alignments ([062cb0d](https://github.com/ng-doc/ng-doc/commit/062cb0d60d7becfd3523a58369667d9229b2c613))
* **builder:** schematics don't work in the root folder of the repository ([2caeef6](https://github.com/ng-doc/ng-doc/commit/2caeef6821f72cc7b2263d6959037466f95c7e96)), closes [#71](https://github.com/ng-doc/ng-doc/issues/71)
* **builder:** some symbols in the page and category titles cause a built error ([d230811](https://github.com/ng-doc/ng-doc/commit/d23081109d9f75aab4d3e532031161d49616ebfd)), closes [#73](https://github.com/ng-doc/ng-doc/issues/73)

## [16.6.5](https://github.com/ng-doc/ng-doc/compare/v16.6.4...v16.6.5) (2023-06-26)


### Bug Fixes

* **project:** add schematic fails on brand new angular 16.1 app ([a6dd29d](https://github.com/ng-doc/ng-doc/commit/a6dd29dacefa07d118d72074c9f267e18d6915a6)), closes [#69](https://github.com/ng-doc/ng-doc/issues/69)

## [16.6.4](https://github.com/ng-doc/ng-doc/compare/v16.6.3...v16.6.4) (2023-06-24)


### Bug Fixes

* **builder:** parsimmon package is not installed after adding ng-doc to the project ([b5a030b](https://github.com/ng-doc/ng-doc/commit/b5a030b0d8772f51d6e161ff15364488194d5a4f))

## [16.6.3](https://github.com/ng-doc/ng-doc/compare/v16.6.2...v16.6.3) (2023-06-21)


### Bug Fixes

* **builder:** build gets stuck if there are no file entities ([388eda0](https://github.com/ng-doc/ng-doc/commit/388eda069b173c5190154d95537da49c7b1525d2)), closes [#67](https://github.com/ng-doc/ng-doc/issues/67)

## [16.6.2](https://github.com/ng-doc/ng-doc/compare/v16.6.1...v16.6.2) (2023-06-21)


### Bug Fixes

* **builder:** playgrounds autogeneration does not support Angular 16 required inputs ([c36a348](https://github.com/ng-doc/ng-doc/commit/c36a348397a4b9101bedcd63b182c51184177c21)), closes [#68](https://github.com/ng-doc/ng-doc/issues/68)
* **keywords-loaders:** remove warning about experimental fetch method ([9c72b0b](https://github.com/ng-doc/ng-doc/commit/9c72b0bf35d10a4ad7e539a87823fcef7340a079))

## [16.6.1](https://github.com/ng-doc/ng-doc/compare/v16.6.0...v16.6.1) (2023-06-14)


### Bug Fixes

* **app:** the code block is not displayed correctly in playgrounds ([a0e6d92](https://github.com/ng-doc/ng-doc/commit/a0e6d929d4ce55baa19fdcc24f421b8d78f29ad5))

# [16.6.0](https://github.com/ng-doc/ng-doc/compare/v16.5.1...v16.6.0) (2023-06-14)


### Bug Fixes

* **app:** decorators in API pages are displayed without a gap ([e697bd0](https://github.com/ng-doc/ng-doc/commit/e697bd0961b84cd777a5acedea95068436c59d1a))


### Features

* **app:** the copy button in the code block is now visible only when you hover the cursor ([18fae7e](https://github.com/ng-doc/ng-doc/commit/18fae7ebd2238cdb87305c772d82fec7ce278ef7))
* **builder:** add lines highlighter. You can use this feature to highlight any line of code inside your code blocks ([66bd91f](https://github.com/ng-doc/ng-doc/commit/66bd91f1b2aae90343111411c90f9f590c25c039))
* **builder:** add option to change the output folder for the documentation application ([4069b47](https://github.com/ng-doc/ng-doc/commit/4069b47972d0e972bba2d12330d7965f45b97de9)), closes [#65](https://github.com/ng-doc/ng-doc/issues/65)
* **builder:** builder adds lines to the code blocks ([c3cefcb](https://github.com/ng-doc/ng-doc/commit/c3cefcba5d538cdd4e9d1a4ac7eb99928947df41))

## [16.5.1](https://github.com/ng-doc/ng-doc/compare/v16.5.0...v16.5.1) (2023-06-09)


### Bug Fixes

* **builder:** config loader requires `swc` packages ([7a4b06a](https://github.com/ng-doc/ng-doc/commit/7a4b06ae36a1a85cc7290e43fb91b5249bd91faf))

# [16.5.0](https://github.com/ng-doc/ng-doc/compare/v16.4.3...v16.5.0) (2023-06-09)


### Bug Fixes

* **builder:** anchor is removed for external links ([f0a62b4](https://github.com/ng-doc/ng-doc/commit/f0a62b464e58179adaaf5fe2a49f1be5e317feb1))
* **builder:** application `build` command doesn't exit ([cf83777](https://github.com/ng-doc/ng-doc/commit/cf837779757f28b1a8e55de7f7b63bdbff00095e)), closes [#64](https://github.com/ng-doc/ng-doc/issues/64)
* **builder:** builder doesn't collect exported declarations from barrel files ([553291c](https://github.com/ng-doc/ng-doc/commit/553291c6a8232c595218e81f3fe2bdf05633faac))
* **builder:** builder doesn't rebuild page after changes if it was restored from cache ([295e3ee](https://github.com/ng-doc/ng-doc/commit/295e3eececa7ec80bbb8b09f6e8c2b424f736524))
* **builder:** entities with errors or warnings are cached ([57a4648](https://github.com/ng-doc/ng-doc/commit/57a46484d936a7ee008f40eb4b8d3a2de2cde01f))
* **builder:** the cache is not invalidated after removing `.ng-doc` folder ([7ccc0be](https://github.com/ng-doc/ng-doc/commit/7ccc0be9e9644d12de683cdad6d4d902a5addd38)), closes [#58](https://github.com/ng-doc/ng-doc/issues/58)
* **builder:** the delay of the tooltip before opening has been increased to 1 second ([bfc67cc](https://github.com/ng-doc/ng-doc/commit/bfc67cccb7f9e4c22c139c19c25437b50a929a75))


### Features

* **app:** external links now display the special icon ([ebc7b46](https://github.com/ng-doc/ng-doc/commit/ebc7b4696a0debefc485caf8a18cd4e89f63bad3))
* **builder:** add `keywordLoaders` to the builder configuration file that allows you to specify async loaders for global keywords ([1ef5f74](https://github.com/ng-doc/ng-doc/commit/1ef5f742bf8310c5f7b12c370017c914d7335bb3))
* **project:** add `ngDocKeywordsLoader` to integrate your documentation with third-party documentation that was created with NgDoc ([6968045](https://github.com/ng-doc/ng-doc/commit/696804504c9d3483e69ca0191a90a285b42c3a52))
* **project:** add `ngKeywordsLoader` to integrate your documentation with the Angular documentation ([a0d3863](https://github.com/ng-doc/ng-doc/commit/a0d3863e8eba1e4ec3022d3ef9ada7b32aa7e0b9))


### Performance Improvements

* **app:** `js-beautify` library was replaces with `esthetic` library, which reduces the bundle size and improves html formatting for playgrounds ([bb17556](https://github.com/ng-doc/ng-doc/commit/bb17556bd65ec369e634cf7a593e77f6ae922903))
* **core:** remove `rxjs` dependency that affects the bundle size ([2368a00](https://github.com/ng-doc/ng-doc/commit/2368a00b59b3c2b9b3929f39eeb7049bd0bc97ba))

## [16.4.3](https://github.com/ng-doc/ng-doc/compare/v16.4.2...v16.4.3) (2023-06-07)


### Bug Fixes

* **builder:** application `build` command doesn't exit ([7928134](https://github.com/ng-doc/ng-doc/commit/79281347a43ee998d44796fa285fbc924eee548d)), closes [#64](https://github.com/ng-doc/ng-doc/issues/64)

## [16.4.2](https://github.com/ng-doc/ng-doc/compare/v16.4.1...v16.4.2) (2023-06-06)


### Bug Fixes

* **app:** playgrounds break with an injector error when creating ([2edf223](https://github.com/ng-doc/ng-doc/commit/2edf22371106ffbfc898fee1937d55e683be579b))

## [16.4.1](https://github.com/ng-doc/ng-doc/compare/v16.4.0...v16.4.1) (2023-06-06)


### Bug Fixes

* **app:** playgrounds can't find type controls ([953a08b](https://github.com/ng-doc/ng-doc/commit/953a08bbe7e48d3df17da4395716912d95aea907))

# [16.4.0](https://github.com/ng-doc/ng-doc/compare/v16.3.6...v16.4.0) (2023-06-06)


### Features

* **builder:** builder and error/warning output have been improved, now the builder is more stable and it's easier to understand where you are haveing problems ([#61](https://github.com/ng-doc/ng-doc/issues/61)) ([7d11c79](https://github.com/ng-doc/ng-doc/commit/7d11c7971b5cf65ecd7b964155602480e91f0dcc))
* **project:** add support for directives and pipes to playgrounds ([#62](https://github.com/ng-doc/ng-doc/issues/62)) ([28b0930](https://github.com/ng-doc/ng-doc/commit/28b0930ba4a7bda271e83a7526c1f747dceb26b7)), closes [#60](https://github.com/ng-doc/ng-doc/issues/60)
* **project:** now you can specify the anchors for the keywords that can create a link to the page's section or API member  ([#63](https://github.com/ng-doc/ng-doc/issues/63)) ([a16d5d4](https://github.com/ng-doc/ng-doc/commit/a16d5d48a0411fc5d048f7131a3f1d007c936989)), closes [#2](https://github.com/ng-doc/ng-doc/issues/2)

## [16.3.6](https://github.com/ng-doc/ng-doc/compare/v16.3.5...v16.3.6) (2023-06-02)


### Bug Fixes

* **project:** minimatch has wrong version in dependencies ([d271d02](https://github.com/ng-doc/ng-doc/commit/d271d0225c1f210e32e69c1a94dd3df049532728))

## [16.3.5](https://github.com/ng-doc/ng-doc/compare/v16.3.4...v16.3.5) (2023-06-01)


### Bug Fixes

* **builder:** builder doesn't see file changes on Windows machines ([673bf83](https://github.com/ng-doc/ng-doc/commit/673bf83836acc6d4344de1ed452a54d75fb7f43a))
* **builder:** builder doesn't see file changes on Windows machines ([e82a7cc](https://github.com/ng-doc/ng-doc/commit/e82a7cc5129537603b86f75c1ffe932a1d97a4c0))

## [16.3.4](https://github.com/ng-doc/ng-doc/compare/v16.3.3...v16.3.4) (2023-05-30)


### Bug Fixes

* **builder:** add `@angular/cdk` to the dependencies of the `ui-kit` package ([9fb07e6](https://github.com/ng-doc/ng-doc/commit/9fb07e66b3849d95a6beb4786ffa2e99d28809fb))
* **builder:** disable `cache` feature by default as it is unstable for the production ([89a04dc](https://github.com/ng-doc/ng-doc/commit/89a04dcc600d3f38f595c564dbab92de5826b8ea))
* **builder:** playground doesn't update inputs based on source code changes in development mode ([f9a5966](https://github.com/ng-doc/ng-doc/commit/f9a5966764b9e52f20603fb27b594299b106e26d))

## [16.3.3](https://github.com/ng-doc/ng-doc/compare/v16.3.2...v16.3.3) (2023-05-30)


### Bug Fixes

* **builder:** playground doesn`t change components inputs in production if production target builds application from dist folder ([3fd3060](https://github.com/ng-doc/ng-doc/commit/3fd30603aae2e2666caaf724cc2c00d8f98edb1d))

## [16.3.2](https://github.com/ng-doc/ng-doc/compare/v16.3.1...v16.3.2) (2023-05-29)


### Bug Fixes

* **builder:** update `@orama/*` packages to the stable ones ([7a3159f](https://github.com/ng-doc/ng-doc/commit/7a3159f5982841718d6e2e08f3b4bf12d961046a))
* **builder:** update version of `rxjs` dependency which will install the latest version of `tslib` ([16fde16](https://github.com/ng-doc/ng-doc/commit/16fde16a5fcc1c4761b9dc78f3895be0d3225e3b))

## [16.3.1](https://github.com/ng-doc/ng-doc/compare/v16.3.0...v16.3.1) (2023-05-29)


### Bug Fixes

* **app:** some icons are not displayed ([689b194](https://github.com/ng-doc/ng-doc/commit/689b1947fd5adcf6fa496e39f117a168cdde0353))

# [16.3.0](https://github.com/ng-doc/ng-doc/compare/v16.2.1...v16.3.0) (2023-05-29)


### Bug Fixes

* **builder:** add missing dependencies ([cf7d42a](https://github.com/ng-doc/ng-doc/commit/cf7d42a768dffaabbc3a2d0ceda5974ec5f887eb))


### Features

* **project:** pages now are standalone, which means you can import/register Angular dependencies in the page itself and if  you use standalone components, you don't need to import anything! Please see migration guide to know how to migrate ([#57](https://github.com/ng-doc/ng-doc/issues/57))! ([#56](https://github.com/ng-doc/ng-doc/issues/56)) ([21e6c17](https://github.com/ng-doc/ng-doc/commit/21e6c17741080d0590ea5942e9d62150b199ae12)), closes [#42](https://github.com/ng-doc/ng-doc/issues/42) [#52](https://github.com/ng-doc/ng-doc/issues/52)

## [16.2.1](https://github.com/ng-doc/ng-doc/compare/v16.2.0...v16.2.1) (2023-05-26)


### Bug Fixes

* **builder:** the builder throws an error if the demo code has certain javascript characters ([cf86d3b](https://github.com/ng-doc/ng-doc/commit/cf86d3b83a5dd18f386d443ae53f77da35271218))

# [16.2.0](https://github.com/ng-doc/ng-doc/compare/v16.1.1...v16.2.0) (2023-05-25)


### Features

* **builder:** cache is here! Now NgDoc caches build results and next time it will use them or rebuild only necessary pages instead of rebuilding everything from scratch ([83a6caa](https://github.com/ng-doc/ng-doc/commit/83a6caa22af8b2909f2ab1785a1377da2924a850)), closes [#44](https://github.com/ng-doc/ng-doc/issues/44)

## [16.1.1](https://github.com/ng-doc/ng-doc/compare/v16.1.0...v16.1.1) (2023-05-21)


### Bug Fixes

* **core:** playgrounds cannot import `formatHtml` function dynamically ([e58b5ea](https://github.com/ng-doc/ng-doc/commit/e58b5ea7696fb8409166a5c5f05a8b2c5cac11c9))

# [16.1.0](https://github.com/ng-doc/ng-doc/compare/v16.0.2...v16.1.0) (2023-05-21)


### Bug Fixes

* **app:** `arrow-up`, `arrow-down` hotkeys don't work for the search input ([ea58bd5](https://github.com/ng-doc/ng-doc/commit/ea58bd56372ea231ea1b8ad370f4515ca256deca))
* **app:** browser console has various warnings ([a41927e](https://github.com/ng-doc/ng-doc/commit/a41927eea9bcf48987159bba059f548a54e199f0))


### Features

* **builder:** add experimental esbuild support, now you can configure the builder by specifying `angularBuilder` property in the `ng-doc.config.ts` file ([57f40a2](https://github.com/ng-doc/ng-doc/commit/57f40a28604fa9965ca306a2aba6019b7eac1348)), closes [#42](https://github.com/ng-doc/ng-doc/issues/42)
* **builder:** external packages now can be provided in the configuration file, to make them available in your code for file entities ([4f0c1b2](https://github.com/ng-doc/ng-doc/commit/4f0c1b2e87b9ec1a10efafff3ec0d5d83321202d))
* **builder:** the current state of the build is now displayed in the console ([#49](https://github.com/ng-doc/ng-doc/issues/49)) ([9e8f4bf](https://github.com/ng-doc/ng-doc/commit/9e8f4bf16d7a2985c7c894f6e1d735e891df65ab))


### Performance Improvements

* **app:** `@orama/*` packages that are using for search have been updated, resulting in a reduced size of the main bundle. However, now it is necessary to manually import the stemmer from `@orama/stemmers` for languages other than English ([8a0f69c](https://github.com/ng-doc/ng-doc/commit/8a0f69c1f3279f230f953e2dc8fb4b08b236022a))

## [16.0.2](https://github.com/ng-doc/ng-doc/compare/v16.0.1...v16.0.2) (2023-05-10)


### Bug Fixes

* **app:** footer is not at the bottom of the page if its content is smaller than the screen height ([ec5b768](https://github.com/ng-doc/ng-doc/commit/ec5b7686bd4ca47135bc857b7426c8e0bb461a39))

## [16.0.1](https://github.com/ng-doc/ng-doc/compare/v16.0.0...v16.0.1) (2023-05-09)


### Bug Fixes

* **project:** bump version ([28c6b03](https://github.com/ng-doc/ng-doc/commit/28c6b03e89ee3d44d8c066873bfb340dd201f876))

# [16.0.0](https://github.com/ng-doc/ng-doc/compare/v15.13.0...v16.0.0) (2023-05-09)


### Bug Fixes

* **app:** api list filter is too small on mobile devices ([c1d7668](https://github.com/ng-doc/ng-doc/commit/c1d766835ac0805a84d8df9de57b9341c544e680))
* **app:** search doesn't work in `ES2022` projects ([dec2325](https://github.com/ng-doc/ng-doc/commit/dec2325aad0ff0bb95d636ea0d8c116a02bee07d))


### Features

* **app:** update angular dependencies ([c4e1da6](https://github.com/ng-doc/ng-doc/commit/c4e1da65746f659c147fb68fa2abdf23ffb6087d))
* **project:** angular 16 support ([f785944](https://github.com/ng-doc/ng-doc/commit/f7859446c63e4a1208047080751c122133153708))
* **project:** angular 16 support ([3b4f6d4](https://github.com/ng-doc/ng-doc/commit/3b4f6d437427fb65b4eb117523b0009e1602fb5a)), closes [#43](https://github.com/ng-doc/ng-doc/issues/43)


### BREAKING CHANGES

* **project:** Angular 16

# [15.13.0](https://github.com/skoropadas/ng-doc/compare/v15.12.0...v15.13.0) (2023-04-29)


### Bug Fixes

* **app:** long bread crumbs do not break correctly on a new line ([386911a](https://github.com/skoropadas/ng-doc/commit/386911a206b027e60f102c436e18110d055d10b9))
* **builder:** links based on keywords are not created for code examples in demos ([ca9480d](https://github.com/skoropadas/ng-doc/commit/ca9480decb89f5a5bf6bc42c4b6eaaac53d7c012))
* **builder:** update `nunjucks` package version to fix vulnerability ([6d8066a](https://github.com/skoropadas/ng-doc/commit/6d8066a60a2db614e2388eed1415d59e02d87ccf))


### Features

* **app:** you can provide `auto` as the `defaultTheme` and the theme will be selected automatically based on the user's OS settings ([1f55720](https://github.com/skoropadas/ng-doc/commit/1f55720d8aab141bb56d76c1c1a669cf9f3baeb7))
* **layout:** sidebar and root component were improved, now you can customize or disable some features ([e7692f3](https://github.com/skoropadas/ng-doc/commit/e7692f3f30bf41c91d601f20150f6a1a36ca95c4))

# [15.12.0](https://github.com/skoropadas/ng-doc/compare/v15.11.3...v15.12.0) (2023-04-20)


### Features

* **playgrounds:** the controls used in playgrounds are now sorted primarily by type and then by name, which should make playgrounds pretty. It is now also possible to specify the order for custom type controls ([009f462](https://github.com/skoropadas/ng-doc/commit/009f46225d4f370687ecda2cb00bcfff8914114a))


### Performance Improvements

* **builder:** the Entity API search for exported declarations has been optimized, now it is twice as fast. For ng-doc documentation, it used to take 6 - 7 seconds, now ~3 seconds ([0d905c4](https://github.com/skoropadas/ng-doc/commit/0d905c44c771df5d2c961119f0dcd66051550f5d))

## [15.11.3](https://github.com/skoropadas/ng-doc/compare/v15.11.2...v15.11.3) (2023-04-15)


### Bug Fixes

* **builder:** ng-doc throws an error "CodeBlockWriter is not a constructor" during development ([52aee4a](https://github.com/skoropadas/ng-doc/commit/52aee4adeef9f753dd3e88c61ff5c825baa67d0b))

## [15.11.2](https://github.com/skoropadas/ng-doc/compare/v15.11.1...v15.11.2) (2023-04-15)


### Bug Fixes

* **project:** dependency versions are not locked ([c4e2d59](https://github.com/skoropadas/ng-doc/commit/c4e2d596e777625f861922751f420c28a5fc6f95)), closes [#41](https://github.com/skoropadas/ng-doc/issues/41)

## [15.11.1](https://github.com/skoropadas/ng-doc/compare/v15.11.0...v15.11.1) (2023-04-14)


### Bug Fixes

* **builder:** keywords links are not created for code blocks with `ts` extension ([aa97451](https://github.com/skoropadas/ng-doc/commit/aa974513ca191e45dd2676bf572d4f78e8a88cc2))

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
