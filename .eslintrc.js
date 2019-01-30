"use strict";

const baseRules = require("eslint-config-lydell");

module.exports = {
  root: true,
  plugins: ["prettier"],
  parserOptions: {
    ecmaVersion: 2018,
  },
  env: {
    es6: true,
    node: true,
  },
  rules: Object.assign({}, baseRules(), {
    "prettier/prettier": "error",
  }),
};
