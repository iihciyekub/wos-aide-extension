'use strict';

const { merge } = require('webpack-merge');
const TerserPlugin = require('terser-webpack-plugin');

const common = require('./webpack.common.js');
const PATHS = require('./paths');

// Merge webpack configuration files
const config = merge(common, {
  entry: {
    popup: PATHS.src + '/popup.js',
    contentScript: PATHS.src + '/contentScript.js',
    background: PATHS.src + '/background.js',
    injected: PATHS.src + '/injected.js',
    'z-Wos': PATHS.src + '/z-Wos.js',
    'z-Wos-loader': PATHS.src + '/z-Wos-loader.js',
    'wos-proxy-marker': PATHS.src + '/wos-proxy-marker.js',
    'pub-fun': PATHS.src + '/pub-fun.js',
    'z-easyscholar': PATHS.src + '/z-easyscholar.js',
    'z-easyscholar-loader': PATHS.src + '/z-easyscholar-loader.js',
    'z-wos-doi-query': PATHS.src + '/z-wos-doi-query.js',
    'z-chat': PATHS.src + '/z-chat.js',
    'z-doi-pdf-download': PATHS.src + '/z-doi-pdf-download.js',
    'chatgpt-prompts-quickload': PATHS.src + '/chatgpt-prompts-quickload.js',
    'module-bridge': PATHS.src + '/module-bridge.js',
    'module-registry': PATHS.src + '/module-registry.js',
  },
  optimization: {
    minimize: true,
    minimizer: [
      new TerserPlugin({
        terserOptions: {
          format: {
            comments: false, // Remove all comments
          },
          compress: {
            drop_console: false, // Keep console.log (set to true to remove them too)
          },
        },
        extractComments: false, // Don't extract comments to separate files
      }),
    ],
  },
});

module.exports = config;
