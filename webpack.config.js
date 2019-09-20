const path = require('path');

/** @type {import('webpack').Configuration} */
module.exports = {
  target: 'node',
  resolve: {
    mainFields: ['main', 'module'],
    extensions: ['.js', '.ts'],
  },
  node: {
    __dirname: false,
    __filename: false,
  },
  entry: './src/index.ts',
  output: {
    path: path.resolve(__dirname, 'lib'),
    filename: 'index.js',
    libraryTarget: 'commonjs',
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        exclude: /node_modules/,
        loader: 'ts-loader',
        options: {
          configFile: 'tsconfig.prod.json',
        },
      },
    ],
  },
  externals: {
    'coc.nvim': 'commonjs coc.nvim',
    trash: 'commonjs trash',
    open: 'commonjs open',
  },
};
