// The `chesspal` command line: a command's input read from the arguments, its result written for a person.
import { parseArgs, type ParseArgsConfig } from "node:util";
import type { z } from "zod";
import { type AnyCommand, baseType, commandLineFieldProblem, commands, type Context, defaultContext, inputProblems, isBoolean, isList, takesNumbers } from "../commands/index.ts";
import { rerunIfChanged } from "../games/index.ts";
import { version } from "../version.ts";

export interface CommandLineResult
{
    output: string;
    exitCode: number;
}

// The commands that exist only on the command line: cli.ts starts the table, opens its page, puts its icon, starts the server, the doorbell or the chat's
// note, when one comes alone.
const mcpDescription = "Start the MCP server for an AI host. Through it the host uses these commands as tools; the host starts it, with no options.";
const listenDescription = "Wait for the player's move on the board page and wake the chat. Claude Code starts it at the end of each turn, and Codex with --codex, as init sets them up.";
const chatDescription = "Note how the chat started: new, cleared, resumed or compacted. Claude Code and Codex run it when a chat starts, as init sets them up.";
const tableDescription = "Serve the board page with no chat, until no browser has had it open for five minutes. `chesspal` alone starts it apart and opens the page.";
const openDescription = "Open the board page as `chesspal` alone does, without asking about the icon: what the icon runs.";
const iconDescription = "Put Chesspal's icon on the desktop and in the menu: it opens the board page as `chesspal` alone does, with no terminal.";
// Those of them that take no options, by name.
const plainCommands = new Map([["mcp", mcpDescription], ["chat", chatDescription], ["table", tableDescription], ["open", openDescription], ["icon", iconDescription]]);

/** The `chesspal` command line: finds the command, validates its input, runs it and renders the result. */
export async function runCommandLine(argv: string[], context: Context = defaultContext(), list: AnyCommand[] = commands): Promise<CommandLineResult>
{
    const [commandName, ...args] = argv;

    if (commandName === undefined || commandName === "--help" || commandName === "-h") {
        return success(generalHelp(list));
    }

    if (commandName === "--version" || commandName === "-v") {
        return success(version);
    }

    const plain = plainCommands.get(commandName);

    if (plain !== undefined) {
        // A host that adds options to mcp would get this text instead of the protocol: it must see the failure.
        const help = `chesspal ${commandName}\n\n${plain}`;
        return args.length === 0 || args.includes("--help") || args.includes("-h") ? success(help) : failure(`chesspal ${commandName} takes no options: ${args.join(" ")}.\n\n${help}`);
    }

    if (commandName === "listen") {
        const help = `chesspal listen [--codex]\n\n${listenDescription}`;
        const known = args.every((arg) => ["--codex", "--help", "-h"].includes(arg));
        return known ? success(help) : failure(`chesspal listen takes only --codex: ${args.join(" ")}.\n\n${help}`);
    }

    const command = list.find((candidate) => candidate.name === commandName);

    if (!command) {
        return failure(`Unknown command "${commandName}".\n\n${generalHelp(list)}`);
    }

    if (args.includes("--help") || args.includes("-h")) {
        return success(commandHelp(command));
    }

    try {
        return success(await runCommand(command, args, context));
    } catch (error) {
        return failure(error instanceof Error ? error.message : String(error));
    }
}

async function runCommand(command: AnyCommand, args: string[], context: Context): Promise<string>
{
    const { input, asJson } = readArguments(command, args);
    const parsed = command.input.safeParse(input);

    if (!parsed.success) {
        const positionals = command.positionals ?? [];
        const written = (name: string): string => (positionals.includes(name) ? `<${name}>` : `--${name}`);
        throw refused(command, inputProblems(command.name, parsed.error.issues, input, written));
    }

    // A game another process changed under the command is read again, and the command run once more.
    const result: unknown = await rerunIfChanged(() => command.run(parsed.data, context));
    return asJson ? JSON.stringify(result, null, 2) : command.format(result, context);
}

/** An input refused, in the words the MCP server uses (inputProblems), with the command's usage. */
function refused(command: AnyCommand, problems: string): Error
{
    return new Error(`${problems} Nothing changed.\nUsage: ${usage(command)}\nRun \`chesspal ${command.name} --help\` for its options.`);
}

/** The command line's own refusals, from parseArgs, in the same words: an unknown option is a parameter the command does not have. */
function parsedArguments<Config extends ParseArgsConfig>(command: AnyCommand, config: Config): ReturnType<typeof parseArgs<Config>>
{
    try {
        return parseArgs(config);
    } catch (error) {
        const { code, message } = error as { code?: string; message: string; };
        const option = /'(-[^' ]+)/.exec(message)?.[1] ?? "";

        if (code === "ERR_PARSE_ARGS_UNKNOWN_OPTION") {
            // A positional written as an option: the command has it, in another place.
            const name = option.replace(/^-+/, "");
            throw refused(
                command,
                command.positionals?.includes(name) === true
                    ? `Give ${name} as <${name}>, without ${option}.`
                    : inputProblems(command.name, [{ code: "unrecognized_keys", keys: [option], path: [], message } as z.core.$ZodIssue], {}, (key) => key),
            );
        }

        throw refused(command, message.endsWith("argument missing") ? `${option} needs a value.` : `${message}${message.endsWith(".") ? "" : "."}`);
    }
}

function readArguments(command: AnyCommand, args: string[]): { input: Record<string, unknown>; asJson: boolean; }
{
    const positionals = command.positionals ?? [];
    const options: Record<string, { type: "string" | "boolean"; multiple?: boolean; }> = { json: { type: "boolean" } };

    for (const [name, field] of inputFields(command)) {
        const problem = commandLineFieldProblem(command.name, name, positionals.includes(name));

        if (problem !== undefined) {
            throw new Error(problem);
        }

        if (!positionals.includes(name)) {
            options[name] = { type: isBoolean(field) ? "boolean" : "string", multiple: isList(field) };
        }
    }

    // A flag is turned off as --no-hidden, as the MCP server takes hidden: false.
    const parsed = parsedArguments(command, { args, options, allowPositionals: true, allowNegative: true, strict: true, tokens: true });
    const extra = parsed.positionals.slice(positionals.length);

    if (extra.length > 0) {
        // A text given in several words: quote it. A word from a list is not a text.
        const last = positionals.at(-1);
        const freeText = last !== undefined && baseType(command.input.shape[last] as z.ZodType) === "string";
        const quoted = parsed.positionals.slice(positionals.length - 1).join(" ");
        throw refused(command, `Unexpected argument: ${extra.join(" ")}.${freeText ? ` Put a value with spaces in quotes, such as "${quoted}".` : ""}`);
    }

    checkRepeatedOptions(command, parsed.tokens, options);

    const input: Record<string, unknown> = {};

    for (const [name, value] of Object.entries(parsed.values)) {
        if (name !== "json") {
            input[name] = value;
        }
    }

    positionals.forEach((name, index) => {
        if (parsed.positionals[index] !== undefined) {
            input[name] = parsed.positionals[index];
        }
    });

    // The command line reads every value as text: a field that takes numbers gets them, and a text that is no number stays, for the schema to refuse.
    for (const [name, field] of inputFields(command)) {
        const value = input[name];

        if (value !== undefined && takesNumbers(field)) {
            input[name] = Array.isArray(value) ? value.map(number) : number(value);
        }
    }

    return { input, asJson: parsed.values.json === true };
}

function number(value: unknown): unknown
{
    return typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value)) ? Number(value) : value;
}

/** An option that takes one value must not be given twice: the first value would be lost without a word. */
function checkRepeatedOptions(command: AnyCommand, tokens: { kind: string; name?: string; }[], options: Record<string, { multiple?: boolean; }>): void
{
    const given: string[] = [];

    for (const token of tokens) {
        if (token.kind !== "option" || token.name === undefined || options[token.name]?.multiple === true) {
            continue;
        }

        if (given.includes(token.name)) {
            throw refused(command, `Give --${token.name} only once.`);
        }

        given.push(token.name);
    }
}

function inputFields(command: AnyCommand): [string, z.ZodType][]
{
    return Object.entries(command.input.shape as Record<string, z.ZodType>);
}

/** The commands, each with the first sentence of its description. */
function generalHelp(list: AnyCommand[]): string
{
    const width = Math.max("listen".length, ...list.map((command) => command.name.length));
    const line = (name: string, description: string): string => `  ${name.padEnd(width)} ${firstSentence(description)}`;
    return [
        `chesspal ${version}`,
        "",
        "Run `chesspal` alone to open the board page in your browser.",
        "",
        "Commands:",
        ...list.map((command) => line(command.name, command.description)),
        line("table", tableDescription),
        line("open", openDescription),
        line("icon", iconDescription),
        line("mcp", mcpDescription),
        line("listen", listenDescription),
        line("chat", chatDescription),
        "",
        "Run `chesspal <command> --help` for its options.",
    ].join("\n");
}

function commandHelp(command: AnyCommand): string
{
    const positionals = command.positionals ?? [];
    const optionLines = inputFields(command).map(([name, field]) => {
        const flag = positionals.includes(name) ? `<${name}>` : `--${name}${isBoolean(field) ? "" : " <value>"}${isList(field) ? "..." : ""}`;
        return `  ${flag.padEnd(20)} ${field.description ?? ""}`;
    });
    return [usage(command), "", command.description, "", ...optionLines, `  ${"--json".padEnd(20)} print the result as JSON`].join("\n");
}

function usage(command: AnyCommand): string
{
    return ["chesspal", command.name, ...(command.positionals ?? []).map((name) => `<${name}>`), "[options]"].join(" ");
}

function firstSentence(text: string): string
{
    const end = text.search(/[.!?](\s|$)/);
    return end === -1 ? text : text.slice(0, end + 1);
}

function success(output: string): CommandLineResult
{
    return { output, exitCode: 0 };
}

function failure(output: string): CommandLineResult
{
    return { output, exitCode: 1 };
}
