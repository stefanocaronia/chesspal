// What a command is, and the reading of its input schema that the command line and the MCP server share.
import { z } from "zod";
import type { Context } from "./context.ts";

/** A command is defined once: the command line and the MCP server are generated from it (D-5), and later the page's actions. */
export interface Command<Schema extends z.ZodObject = z.ZodObject, Result = unknown>
{
    name: string;
    /** Written for an AI: what the command does (the first sentence, shown in the list of commands), when to use it, an example. */
    description: string;
    input: Schema;
    /** The command changes nothing: hosts may run it without asking. */
    readOnly?: boolean;
    /** The command deletes or overwrites what the player keeps, such as a game: hosts may ask first. */
    destructive?: boolean;
    /** Calling the command again with the same input changes nothing more. */
    idempotent?: boolean;
    /** Hosts load the tool at once instead of on demand: for the ones the AI calls at the start of every chat. */
    alwaysLoad?: boolean;
    /** Its answer shows the chat the game as it is: the chat may move on it, and on no other (D-71). */
    showsGame?: boolean;
    /**
     * The agents that call it apart from the chat, as ponder (D-72), by their names: the doorbell's record of what the chat has read stays as it was, and the
     * server refuses it to the chat and to other agents (Priya, review of T-112).
     */
    byAgents?: readonly string[];
    /** The agents that call it besides the chat, as the analyst analyse_game (D-89): their calls leave the doorbell's record of what the chat has read as it was. */
    sharedWith?: readonly string[];
    /** The only host the MCP server offers it to, by the client's name, as ponder to Claude Code: elsewhere its description would cost tokens for nothing. */
    host?: string;
    /** Only the command line has it, as init: the MCP server leaves it out, and its description costs the AI no tokens. */
    cliOnly?: boolean;
    /** Fields the command line takes as positional arguments, in order. */
    positionals?: Extract<keyof Schema["shape"], string>[];
    /** Returns a value, never prints: the MCP server speaks on stdout, and only the command line writes there. */
    run(input: z.infer<Schema>, context: Context): Result | Promise<Result>;
    /** Plain-text rendering of the result, for the AI and the terminal alike; the context, for a command that speaks to the player, as init. */
    format(result: Result, context?: Context): string;
}

// A command of any input and result, as the lists of commands hold them.
export type AnyCommand = Command<any, any>;

/** Checks a command's types where it is written; the command is used as it is. */
export function defineCommand<Schema extends z.ZodObject, Result>(command: Command<Schema, Result>): Command<Schema, Result>
{
    return command;
}

/** One sentence of the AI's, kept in a PGN comment: no brackets or braces, which would break it. */
export function sentence(most: number): z.ZodString
{
    return z.string().trim().min(1, "write one sentence").max(most, `write one sentence of ${most} characters at most`).regex(/^[^[\]{}]*$/, "write it without [ ] { }");
}

/**
 * Why an input is refused, in words an AI can act on, the same on the command line and in MCP: one sentence for each problem, each parameter written as
 * the caller writes it (colour, --colour).
 */
export function inputProblems(command: string, issues: readonly z.core.$ZodIssue[], given: Record<string, unknown>, written: (name: string) => string): string
{
    return issues.map((issue) => inputIssue(command, issue, given, written)).join(" ");
}

/**
 * What keeps a field of a command's input from being given on the command line: one named no-x, read as turning x off, or json, read as answering in JSON;
 * undefined for any other. A positional is never an option, so json is its name freely.
 */
export function commandLineFieldProblem(command: string, name: string, positional: boolean): string | undefined
{
    if (name.startsWith("no-")) {
        return `${command} has a field named ${name}, and none may start with no-, which the command line reads as turning ${name.slice(3)} off: rename it.`;
    }

    return name === "json" && !positional ? `${command} has a field named json, which the command line reads as answering in JSON: rename it.` : undefined;
}

/** Whether a field of a command's input is a flag, true or false, as --hidden. */
export function isBoolean(field: z.ZodType): boolean
{
    return baseDefinition(field).type === "boolean";
}

/** A list option can be given more than once, as in --tag a --tag b. */
export function isList(field: z.ZodType): boolean
{
    return baseDefinition(field).type === "array";
}

/** The type of a field of a command's input, past optional, default and nullable: string, boolean, array… */
export function baseType(field: z.ZodType): string
{
    return baseDefinition(field).type;
}

/** Whether a field takes numbers, alone or in a list: the command line reads them as text and turns them into numbers. */
export function takesNumbers(field: z.ZodType): boolean
{
    const definition = baseDefinition(field) as { type: string; element?: z.ZodType; };
    return definition.type === "number" || (definition.type === "array" && definition.element !== undefined && baseType(definition.element) === "number");
}

function inputIssue(command: string, issue: z.core.$ZodIssue, given: Record<string, unknown>, written: (name: string) => string): string
{
    const path = issue.path.map(String).join(".");

    if (issue.code === "unrecognized_keys") {
        return path === "" ? `${command} has no parameter ${issue.keys.map(written).join(", ")}.` : `${written(path)} has no ${issue.keys.join(", ")}.`;
    }

    // A parameter left out, whatever zod calls it.
    if (issue.path.length === 1 && given[path] === undefined) {
        return `${command} needs ${written(path)}.`;
    }

    return path === "" ? `${issue.message}.` : `${written(path)}: ${issue.message}.`;
}

function baseDefinition(field: z.ZodType): { type: string; innerType?: z.ZodType; }
{
    let definition = field.def as { type: string; innerType?: z.ZodType; };

    while (definition.innerType && ["optional", "default", "nullable"].includes(definition.type)) {
        definition = definition.innerType.def as typeof definition;
    }

    return definition;
}
