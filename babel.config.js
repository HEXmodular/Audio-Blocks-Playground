module.exports = function (api) {
  const isTest = api.env('test');

  return {
    presets: [
      ['@babel/preset-env', {
        targets: { node: 'current' },
        // Preserve ES modules for build, convert to CommonJS for Jest tests
        modules: isTest ? 'commonjs' : false,
      }],
      // If you're using TypeScript (which you are, based on jest.config.cjs)
      // you might also need @babel/preset-typescript if ts-jest isn't handling all JS/TS transforms.
      // However, ts-jest is usually sufficient for .ts/.tsx files.
      // For .js files from node_modules (like tone), preset-env is key.
    ],
  };
};
