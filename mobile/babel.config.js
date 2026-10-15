module.exports = function (api) {
  const isTest = api.env("test");
  return {
    presets: ["babel-preset-expo"],
    // @icp-sdk/core ships `static {}` class blocks, which Jest's transform
    // doesn't lower by default. Metro (Hermes) handles them in the app build.
    plugins: isTest ? ["@babel/plugin-transform-class-static-block"] : [],
  };
};
