import stylistic from "@stylistic/eslint-plugin";
import typescriptParser from "@typescript-eslint/parser";
import { builtinModules } from "node:module";

// Every folder of src outside the page is a module: the others reach it only through its index.ts, and it never reaches into the folder above it,
// but for src/version.ts, which must sit at the root to find package.json. The page is one Preact app built on its own; the tests may reach any file.
const boundaries = [
    { regex: "^(?:\\./|(?:\\.\\./)+)(?:[^./][^/]*/)+(?!index\\.ts$)[^/]+$", message: "Import another folder through its index.ts, exporting there what is missing." },
    { regex: "^(?:\\.\\./)+(?!version\\.ts$)[^/]+$", message: "A folder never imports the files of the folder above it: move what both use into a folder of its own, with its index.ts." },
    {
        regex: "^(?:\\./|(?:\\.\\./)+)(?!server/)[^./][^/]*/[^/]+/(?:[^/]+/)*index\\.ts$",
        message: "Reach a folder through the index.ts of the folder that holds it: only server/, which just groups its modules, is entered further down.",
    },
];

// The commands, the server and the command line, from a module below them at any depth of its folders.
const aboveCommands = "^(?:\\.\\./)+(?:commands|server|cli)/";

// no-restricted-imports does not see import(), with which the command line loads each module late: the same boundaries, through the syntax.
const lateBoundaries = boundaries.map(({ regex, message }) => ({ selector: `ImportExpression[source.value=/${regex.replaceAll("/", "\\x2F")}/]`, message }));

// The commands' folders by steps, from the bottom: each imports only the folders of a lower step, never one of its own step or above, nor commands/index.ts.
const commandsSteps = [["registry"], ["answers"], ["setup", "profiles", "talk"], ["game", "analysis"]];
const commandsOrder = commandsSteps.flatMap((step, index) =>
    step.map((folder) => {
        const notBelow = commandsSteps.slice(index).flat().filter((other) => other !== folder).map((other) => `../${other}/*`);
        const message = "The commands' folders go one way: registry, answers, then setup, profiles and talk, then game and analysis; each imports only the steps below it.";
        return {
            files: [`src/commands/${folder}/**/*.ts`],
            rules: {
                "no-restricted-imports": ["error", {
                    patterns: [
                        { group: [...notBelow, "../../commands/*"], message },
                        ...boundaries,
                    ],
                }],
            },
        };
    })
);

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
    // The modules' boundaries; a block below that sets its own imports repeats them, since its options replace these.
    {
        files: ["src/**/*.ts"],
        ignores: ["src/page/**"],
        rules: { "no-restricted-imports": ["error", { patterns: boundaries }], "no-restricted-syntax": ["error", ...lateBoundaries] },
    },
    ...commandsOrder,
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
                    ...boundaries,
                ],
            }],
        },
    },
    // The page runs in the browser: it uses the chess core and asks the server for the rest. Its files sit in src/page and in two levels of folders below.
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
    {
        files: ["src/page/*/*/**/*.ts", "src/page/*/*/**/*.tsx"],
        rules: {
            "no-restricted-imports": ["error", {
                patterns: [
                    { group: ["node:*", ...builtinModules], message: "The page runs in the browser: no Node." },
                    { regex: "^\\.\\./\\.\\./\\.\\./(?!core/index\\.ts$)", message: "The page imports only its own files and the chess core: the rest it asks the server for." },
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
                    { regex: aboveCommands, message: "The games module sits below the commands: they use it, never the other way." },
                    { regex: "^(?:\\.\\./)+profiles/", message: "The profiles use the games, never the other way: pass the game folder in." },
                    ...boundaries,
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
                patterns: [{ regex: aboveCommands, message: "The profiles module sits below the commands: they use it, never the other way." }, ...boundaries],
            }],
        },
    },
    // The sites sit below the commands, beside the profiles whose types they fill, and print nothing.
    {
        files: ["src/sites/**/*.ts"],
        rules: {
            "no-console": "error",
            "no-restricted-imports": ["error", {
                patterns: [{ regex: aboveCommands, message: "The sites module sits below the commands: they use it, never the other way." }, ...boundaries],
            }],
        },
    },
    // The MCP server speaks on stdout: commands return values, and only the CLI prints.
    {
        files: ["src/commands/**/*.ts", "src/server/**/*.ts"],
        rules: { "no-console": "error" },
    },
];
