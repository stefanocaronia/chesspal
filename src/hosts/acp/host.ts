// What a host's driver tells the protocol's client: the program's arguments, how its tools are read, and how its player signs in.
import type { ToolKind } from "../chat.ts";
import { isObject, type Message } from "../lines.ts";

/** A host spoken to by the Agent Client Protocol, as its driver describes it. */
export interface AcpHost
{
    /** The host's name, as the table's log says it. */
    name: string;
    /** The program's arguments after its own, which make it speak the protocol on its input and output. */
    args: string[];
    /** A tool call's name for the table and its kind, from all the agent said of it and the chat's session: for a command of the chesspal server, the command's name alone. */
    toolOf(call: Message, session: string | undefined): { name: string; kind: ToolKind; };
    /** The paths a call of kind read asks for, as given, "." for the folder it runs in; none where nothing says what it reads. Any not text is outside. */
    pathsOf(call: Message): unknown[];
    /** The tools a call ran within itself, which the agent names only at its end; none for most calls. */
    innerTools(call: Message): { name: string; kind: ToolKind; failed: boolean; }[];
    /** For a host that tells a subagent's work among its chat's updates: the subagent's session an update is of, undefined for the AI's own. */
    childOf?(update: Message): string | undefined;
    /** The subagent's session a call of kind agent started, as its end names it. */
    childStarted?(call: Message): string | undefined;
    /** How the player signs the host in, for a chat it refuses as not signed in, never in a terminal: "sign in from … itself". */
    login: string;
    /** For a host whose error for a player not signed in is not known yet: words of an error that say so, beside the protocol's own code. */
    signInWords?: RegExp;
    /** For a host that lists the models of many providers: a model's provider, and whether it is paid apart for each answer, by its id. */
    modelMarks?(id: string): { group?: string; metered?: true; };
    /** How early a model is kept, lowest first, before the list is cut: the first not paid apart is the one a chat proposes. All alike by default. */
    modelRank?(id: string): number;
}

// The protocol's own kinds of tool calls, as the table's kinds: a search may be of files or of the web, and is held to the folder as a read. A thought may
// be a subagent, and a switch of mode may leave the table's limits: both are of kind other, never allowed.
const protocolKinds: Record<string, ToolKind> = {
    read: "read",
    search: "read",
    fetch: "fetch",
    execute: "shell",
    edit: "write",
    delete: "write",
    move: "write",
    think: "other",
    switch_mode: "other",
};

/** A call's kind as the protocol names it, for a host whose own names of tools are not known; any other is of kind other. */
export function kindOfCall(call: Message): ToolKind
{
    return typeof call.kind === "string" ? protocolKinds[call.kind] ?? "other" : "other";
}

// The fields of an input that name a path, by any name a host gives one: path, filePath, file_path, dirPath, file, directory, cwd, root.
const pathField = /path|file|dir|folder|cwd|root/i;

/** A pattern of files that leaves the folder it is read from, among the paths of a call: never inside, said as written. */
export function patternOutside(pattern: unknown): { outside: string; }
{
    return { outside: String(pattern) };
}

/** How a path among a call's paths is said to the player. */
export function pathWords(path: unknown): string
{
    return isObject(path) && typeof path.outside === "string" ? path.outside : String(path);
}

/** The paths any call names: its locations, and each field of its input that names a path or a list of them. */
export function pathsOfCall(call: Message): unknown[]
{
    const input = isObject(call.rawInput) ? call.rawInput : {};
    const locations = Array.isArray(call.locations) ? call.locations.filter(isObject).map((location) => location.path) : [];
    const named = Object.entries(input).filter(([key]) => pathField.test(key)).flatMap(([, value]) => (Array.isArray(value) ? value : [value]));
    return [...locations, ...named].filter((path) => path !== undefined && path !== null);
}
