// Metro, the app's bundler. Expo's defaults, plus the website's album code:
// Metro watches ../src and takes files from it through sharedCode.js, which
// lets in only the files listed in ../src/shared/sharedModules.ts. And
// 'megy-golden-pages' (goldenPages.js): the golden test pages, in a build
// made with -GoldenPages only.
const { getDefaultConfig } = require('expo/metro-config');
const { WEB_SRC, makeResolveRequest } = require('./sharedCode');
const { GOLDEN_MODULE, goldenModuleFile } = require('./goldenPages');

const config = getDefaultConfig(__dirname);

config.watchFolders = [...(config.watchFolders ?? []), WEB_SRC];
const resolveShared = makeResolveRequest();
config.resolver.resolveRequest = (context, moduleName, platform) =>
  moduleName === GOLDEN_MODULE
    ? { type: 'sourceFile', filePath: goldenModuleFile() }
    : resolveShared(context, moduleName, platform);

module.exports = config;
