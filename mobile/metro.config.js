// Metro, the app's bundler. Expo's defaults, plus the website's album code:
// Metro watches ../src and takes files from it through sharedCode.js, which
// lets in only the files listed in ../src/shared/sharedModules.ts.
const { getDefaultConfig } = require('expo/metro-config');
const { WEB_SRC, makeResolveRequest } = require('./sharedCode');

const config = getDefaultConfig(__dirname);

config.watchFolders = [...(config.watchFolders ?? []), WEB_SRC];
config.resolver.resolveRequest = makeResolveRequest();

module.exports = config;
