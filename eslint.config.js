import stylistic from "@stylistic/eslint-plugin";
import typescriptParser from "@typescript-eslint/parser";
import { builtinModules } from "node:module";

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
            "no-restricted-globals": ["error", ...["process", "Buffer", "require", "__dirname", "__filename", "global"].map((name) => ({ name, message: "The chess core runs in the browser too: no Node." }))],
            "no-restricted-imports": ["error", {
                patterns: [
                    { group: ["node:*", ...builtinModules], message: "The chess core runs in the browser too: no Node." },
                    { group: ["../*"], message: "The chess core imports only its own files and chess.js: commands, server and CLI use the core, never the other way." },
                ],
            }],
        },
    },
    // The MCP server speaks on stdout: commands return values, and only the CLI prints.
    {
        files: ["src/commands/**/*.ts", "src/server/**/*.ts"],
        rules: { "no-console": "error" },
    },
];
