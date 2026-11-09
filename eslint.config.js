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
    // The page runs in the browser: it uses the chess core and asks the server for the rest. Its files sit in src/page and in one level of folders below.
    {
        files: ["src/page/*.ts", "src/page/*.tsx"],
        rules: {
            "no-restricted-imports": ["error", {
                patterns: [
                    { group: ["node:*", ...builtinModules], message: "The page runs in the browser: no Node." },
                    { regex: "^\\.\\./(?!core/index\\.ts$)", message: "The page imports only its own files and the chess core: the rest it asks the server for." },
                ],
            }],
        },
    },
    {
        files: ["src/page/*/**/*.ts", "src/page/*/**/*.tsx"],
        rules: {
            "no-restricted-imports": ["error", {
                patterns: [
                    { group: ["node:*", ...builtinModules], message: "The page runs in the browser: no Node." },
                    { regex: "^\\.\\./\\.\\./(?!core/index\\.ts$)", message: "The page imports only its own files and the chess core: the rest it asks the server for." },
                ],
            }],
        },
    },
    // The games on disk sit below the commands, and print nothing: the MCP server speaks on stdout.
    {
        files: ["src/games/**/*.ts"],
        rules: {
            "no-console": "error",
            "no-restricted-imports": ["error", {
                patterns: [
                    { group: ["../commands/*", "../server/*", "../cli/*"], message: "The games module sits below the commands: they use it, never the other way." },
                    { group: ["../profiles/*"], message: "The profiles use the games, never the other way: pass the game folder in." },
                ],
            }],
        },
    },
    // The profiles sit below the commands, beside the games, and print nothing.
    {
        files: ["src/profiles/**/*.ts"],
        rules: {
            "no-console": "error",
            "no-restricted-imports": ["error", {
                patterns: [{ group: ["../commands/*", "../server/*", "../cli/*"], message: "The profiles module sits below the commands: they use it, never the other way." }],
            }],
        },
    },
    // The MCP server speaks on stdout: commands return values, and only the CLI prints.
    {
        files: ["src/commands/**/*.ts", "src/server/**/*.ts"],
        rules: { "no-console": "error" },
    },
    // The server and the command line reach the commands through their index, which says in one place what they use.
    {
        files: ["src/server/**/*.ts", "src/cli/**/*.ts", "src/index.ts"],
        rules: {
            "no-restricted-imports": ["error", {
                patterns: [{ regex: "^\\.\\.?/(?:\\.\\./)*commands/(?!index\\.ts$)", message: "Import the commands from commands/index.ts, exporting there what is missing." }],
            }],
        },
    },
];
