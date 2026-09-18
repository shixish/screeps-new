process.env.TS_NODE_PROJECT = require("path").resolve(__dirname, "tsconfig.test.json");
process.env.TS_NODE_COMPILER_OPTIONS = JSON.stringify({ module: "commonjs" });

require("ts-node").register({
  project: process.env.TS_NODE_PROJECT,
  transpileOnly: true,
  compilerOptions: { module: "commonjs" },
  moduleTypes: {
    "**/*": "cjs"
  }
});

module.exports = {
  require: ["test/setup-mocha.cjs", "tsconfig-paths/register"],
  extension: ["ts"],
  spec: "test/unit/**/*.ts",
  ignore: ["test/unit/main.test.ts"],
  timeout: 5000,
  exit: true,
  recursive: true,
  ui: "bdd",
  reporter: "spec",
  bail: true,
  "full-trace": true
};
