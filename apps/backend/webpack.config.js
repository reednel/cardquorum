const { NxAppWebpackPlugin } = require('@nx/webpack/app-plugin');
const { join } = require('path');
const CopyPlugin = require('copy-webpack-plugin');

module.exports = {
  output: {
    path: join(__dirname, '../../dist/apps/backend'),
    clean: true,
    ...(process.env.NODE_ENV !== 'production' && {
      devtoolModuleFilenameTemplate: '[absolute-resource-path]',
    }),
  },
  plugins: [
    new NxAppWebpackPlugin({
      target: 'node',
      compiler: 'tsc',
      main: './src/main.ts',
      tsConfig: './tsconfig.app.json',
      assets: ['./src/assets'],
      optimization: false,
      outputHashing: 'none',
      generatePackageJson: true,
      sourceMap: true,
      additionalEntryPoints: [{ entryName: 'migrate', entryPath: './src/migrate.ts' }],
      runtimeDependencies: ['tslib'],
    }),
    new CopyPlugin({
      patterns: [
        {
          from: join(__dirname, '../../libs/db/migrations'),
          to: join(__dirname, '../../dist/apps/backend/migrations'),
        },
      ],
    }),
  ],
};
