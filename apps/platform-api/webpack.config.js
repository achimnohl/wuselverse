const { composePlugins, withNx } = require('@nx/webpack');
const TsconfigPathsPlugin = require('tsconfig-paths-webpack-plugin');
const path = require('path');

module.exports = composePlugins(withNx(), (config) => {
  // Configure webpack to resolve TypeScript path mappings
  config.resolve = config.resolve || {};
  config.resolve.plugins = config.resolve.plugins || [];
  config.resolve.plugins.push(
    new TsconfigPathsPlugin({
      configFile: path.resolve(__dirname, '../../tsconfig.base.json'),
      extensions: ['.ts', '.tsx', '.js', '.jsx']
    })
  );
  
  return config;
});
