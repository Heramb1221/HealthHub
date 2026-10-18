const expoConfig = require("eslint-config-expo/flat");

module.exports = [
  ...expoConfig,
  // Apostrophes in React Native <Text> are fine; this rule targets HTML rendering.
  { rules: { "react/no-unescaped-entities": "off" } },
  { ignores: ["node_modules/**", ".expo/**", ".export-check/**", "dist/**"] },
  {
    // Node test files import ".ts" paths directly (type stripping), which the import resolver can't see.
    files: ["tests/**/*.ts", "src/api/**/*.ts", "src/lib/**/*.ts"],
    rules: { "import/no-unresolved": "off" },
  },
];
