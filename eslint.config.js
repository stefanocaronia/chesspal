import stylistic from "@stylistic/eslint-plugin";
import typescriptParser from "@typescript-eslint/parser";

// Only the layout rules dprint cannot apply: braces always, a blank line around block statements, at most one blank line.
export default [
    { ignores: ["**/dist/", "node_modules/", "project/", "tmp/"] },
    {
        files: ["**/*.ts", "**/*.tsx", "**/*.js", "**/*.mjs"],
        languageOptions: { parser: typescriptParser },
        plugins: { "@stylistic": stylistic },
        rules: {
            curly: ["error", "all"],
            "@stylistic/padding-line-between-statements": [
                "error",
                { blankLine: "always", prev: "*", next: "block-like" },
                { blankLine: "always", prev: "block-like", next: "*" },
            ],
            "@stylistic/no-multiple-empty-lines": ["error", { max: 1, maxBOF: 0, maxEOF: 0 }],
        },
    },
    // The chess core runs in the browser too (D-17, D-18): no Node, no console.
    {
        files: ["src/core/**/*.ts"],
        rules: {
            "no-console": "error",
            "no-restricted-globals": ["error", { name: "process", message: "The chess core runs in the browser too: no Node." }],
            "no-restricted-imports": ["error", { patterns: [{ group: ["node:*", "fs", "path"], message: "The chess core runs in the browser too: no Node." }] }],
        },
    },
    // The MCP server speaks on stdout: commands return values, and only the CLI prints.
    {
        files: ["src/commands/**/*.ts", "src/server/**/*.ts"],
        rules: { "no-console": "error" },
    },
];
