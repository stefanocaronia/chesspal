// What a host's driver tells the protocol's client: the program's arguments, and how its tools are read.
import type { ToolKind } from "../chat.ts";
import { isObject, type Message } from "./protocol.ts";

/** A host spoken to by the Agent Client Protocol, as its driver describes it. */
export interface AcpHost
{
    /** The program's arguments after its own, which make it speak the protocol on its input and output. */
    args: string[];
    /** A tool call's name for the table and its kind, from all the agent said of it: for a command of the chesspal server, the command's name alone. */
    toolOf(call: Message): { name: string; kind: ToolKind; };
    /** The paths a call of kind read asks for, as given; none where it reads the folder it runs in. */
    pathsOf(call: Message): unknown[];
    /** The tools a call ran within itself, which the agent names only at its end; none for most calls. */
    innerTools(call: Message): { name: string; kind: ToolKind; failed: boolean; }[];
}

// The protocol's own kinds of tool calls, as the table's kinds: a search may be of files or of the web, and is held to the folder as a read.
const protocolKinds: Record<string, ToolKind> = { read: "read", search: "read", fetch: "fetch", execute: "shell", edit: "write", delete: "write", move: "write" };

/** A call's kind as the protocol names it, for a host whose own names of tools are not known; any other is of kind other. */
export function kindOfCall(call: Message): ToolKind
{
    return typeof call.kind === "string" ? protocolKinds[call.kind] ?? "other" : "other";
}

/** The paths any call names: its locations, and its input's path or file. */
export function pathsOfCall(call: Message): unknown[]
{
    const input = isObject(call.rawInput) ? call.rawInput : {};
    const locations = Array.isArray(call.locations) ? call.locations.filter(isObject).map((location) => location.path) : [];
    return [...locations, input.filePath, input.file_path, input.path].filter((path) => path !== undefined);
}
