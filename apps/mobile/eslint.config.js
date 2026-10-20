const expoConfig = require("eslint-config-expo/flat");

module.exports = [
  ...expoConfig,

  { rules: { "react/no-unescaped-entities": "off" } },
  { ignores: ["node_modules/**", ".expo/**", ".export-check/**", "dist/**"] },
  {

    files: ["tests/**/*.ts", "src/api/**/*.ts", "src/lib/**/*.ts"],
    rules: { "import/no-unresolved": "off" },
  },
];
