const path = require("path");
const webpack = require("webpack");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const CopyPlugin = require("copy-webpack-plugin");

const isDevelopment = process.env.NODE_ENV !== "production";
const network = process.env.DFX_NETWORK || (isDevelopment ? "local" : "ic");

function initCanisterEnv() {
  let localCanisters, prodCanisters;
  try {
    localCanisters = require(path.resolve(".dfx", "local", "canister_ids.json"));
  } catch (error) {
    console.log("No local canister_ids.json found.");
  }
  try {
    prodCanisters = require(path.resolve("canister_ids.json"));
  } catch (error) {
    console.log("No production canister_ids.json found.");
  }

  const canisterConfig = network === "local" ? localCanisters : prodCanisters;

  return Object.entries(canisterConfig || {}).reduce((prev, current) => {
    const [canisterName, canisterDetails] = current;
    if (canisterDetails[network]) {
      prev[canisterName.toUpperCase() + "_CANISTER_ID"] = canisterDetails[network];
    }
    return prev;
  }, {});
}

const canisterEnvVariables = initCanisterEnv();

const internetIdentityUrl =
  network === "local"
    ? `http://localhost:4943/?canisterId=${canisterEnvVariables["INTERNET_IDENTITY_CANISTER_ID"]}`
    : "https://identity.ic0.app";

module.exports = {
  entry: "./src/homegentic_frontend/src/index.tsx",
  mode: isDevelopment ? "development" : "production",
  devtool: isDevelopment ? "source-map" : false,
  output: {
    filename: "bundle.js",
    path: path.join(__dirname, "dist"),
    publicPath: "/",
  },
  resolve: {
    extensions: [".tsx", ".ts", ".js", ".jsx"],
    fallback: {
      assert: require.resolve("assert/"),
      buffer: require.resolve("buffer/"),
      events: require.resolve("events/"),
      stream: require.resolve("stream-browserify/"),
      util: require.resolve("util/"),
    },
  },
  module: {
    rules: [
      {
        test: /\.(ts|tsx)$/,
        loader: "ts-loader",
        exclude: /node_modules/,
      },
      {
        test: /\.css$/,
        use: ["style-loader", "css-loader"],
      },
      {
        test: /\.(png|svg|jpg|jpeg|gif|ico)$/,
        type: "asset/resource",
      },
    ],
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: "./src/homegentic_frontend/assets/index.html",
      filename: "index.html",
    }),
    new CopyPlugin({
      patterns: [
        {
          from: "src/homegentic_frontend/assets",
          to: ".",
          filter: (resourcePath) => !resourcePath.endsWith("index.html"),
        },
      ],
    }),
    new webpack.EnvironmentPlugin({
      NODE_ENV: "development",
      DFX_NETWORK: network,
      II_URL: internetIdentityUrl,
      ...canisterEnvVariables,
    }),
    new webpack.ProvidePlugin({
      Buffer: ["buffer", "Buffer"],
      process: "process/browser",
    }),
  ],
  devServer: {
    port: 3000,
    historyApiFallback: true,
    proxy: {
      "/api": {
        target: "http://localhost:4943",
        changeOrigin: true,
      },
    },
  },
};
