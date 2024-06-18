import { HostTree } from '@angular-devkit/schematics';
import { SchematicTestRunner, UnitTestTree } from '@angular-devkit/schematics/testing';
import { createProject, createSourceFile, saveActiveProject, setActiveProject } from 'ng-morph';
import { join } from 'path';

const collectionPath: string = join(__dirname, '../../migration.json');

describe('project-migration', () => {
  let host: UnitTestTree;
  let runner: SchematicTestRunner;

  beforeEach(() => {
    host = new UnitTestTree(new HostTree());
    runner = new SchematicTestRunner('schematics', collectionPath);

    setActiveProject(createProject(host));

    createSourceFile('package.json', '{"dependencies": {"@angular/core": "~17.0.0"}}');
    createSourceFile(
      '.gitignore',
      `
# System Files
.DS_Store
Thumbs.db

# Cache
.angular
.ng-doc

.nx/cache
`,
    );
    createSourceFile(
      'my-app/tsconfig.app.json',
      `{
 "extends": "../tsconfig.json",
 "files": ["src/main.ts", "src/polyfills.ts"],
 "include": ["src/**/*.d.ts"],
 "exclude": ["**/*.test.ts", "**/*.spec.ts"]
}
`,
    );
    createSourceFile(
      'tsconfig.json',
      `{
 "compilerOptions": {
"paths": {
  "@ng-doc/add": ["libs/add/src/index.ts"],
  "@ng-doc/app": ["libs/app/index.ts"],
  "@ng-doc/generated": [".ng-doc/ng17/index.ts"],
  "@ng-doc/generated/*": [".ng-doc/ng17/*"]
 }
 }
}
`,
    );
    createSourceFile(
      'angular.json',
      `{
  "$schema": "./node_modules/@angular/cli/lib/config/schema.json",
  "version": 1,
  "newProjectRoot": "projects",
  "projects": {
    "ng17": {
      "projectType": "application",
      "schematics": {},
      "root": "",
      "sourceRoot": "src",
      "prefix": "app",
      "architect": {
        "build": {
          "builder": "@ng-doc/builder:browser",
          "options": {
            "outputPath": "dist/ng17",
            "index": "src/index.html",
            "main": "src/main.ts",
            "polyfills": "zone.js",
            "tsConfig": "my-app/tsconfig.app.json",
            "assets": [
              "src/favicon.ico",
              "src/assets",
              {
                "glob": "**/*",
                "input": "dist/libs/app/assets",
                "output": "assets/ng-doc/app"
              },
              {
      					"glob": "**/*",
      					"input": ".ng-doc/ng-doc/assets",
      					"output": "assets/ng-doc"
      				}
            ],
            "styles": [
              "src/styles.css"
            ],
            "scripts": []
          },
          "configurations": {
            "production": {
              "budgets": [
                {
                  "type": "initial",
                  "maximumWarning": "500kb",
                  "maximumError": "1mb"
                },
                {
                  "type": "anyComponentStyle",
                  "maximumWarning": "2kb",
                  "maximumError": "4kb"
                }
              ],
              "outputHashing": "all"
            },
            "development": {
            	"buildOptimizer": false,
            	"vendorChunk": true,
              "optimization": false,
              "extractLicenses": false,
              "sourceMap": true
            }
          },
          "defaultConfiguration": "production"
        },
        "serve": {
          "builder": "@ng-doc/builder:dev-server",
          "configurations": {
            "production": {
              "browserTarget": "ng17:build:production"
            },
            "development": {
              "browserTarget": "ng17:build:development"
            }
          },
          "defaultConfiguration": "development"
        },
        "extract-i18n": {
          "builder": "@angular-devkit/build-angular:extract-i18n",
          "options": {
            "browserTarget": "ng17:build"
          }
        },
        "test": {
          "builder": "@angular-devkit/build-angular:karma",
          "options": {
            "polyfills": [
              "zone.js",
              "zone.js/testing"
            ],
            "tsConfig": "tsconfig.spec.json",
            "assets": [
              "src/favicon.ico",
              "src/assets"
            ],
            "styles": [
              "src/styles.css"
            ],
            "scripts": []
          }
        }
      }
    }
  }
}
`,
    );

    saveActiveProject();
  });

  it('should migrate ng-doc.page.ts', async () => {
    const tree: UnitTestTree = await runner.runSchematic('migration-v18', {}, host);

    host.create(
      'page/index.md',
      `
    # {{ NgDocPage.title }}
    Content`,
    );
    host.create(
      'page/ng-doc.page.ts',
      `import { NgDocPage } from '@ng-doc/core';

const Page: NgDocPage = {
  title: \`Page\`,
  mdFile: './index.md',
  keyword: 'MyPage'
};

export default Page;
`,
    );

    saveActiveProject();

    expect(tree.readContent('page/index.md')).toEqual(``);
    expect(tree.readContent('page/ng-doc.page.ts')).toEqual(``);
  });
});
