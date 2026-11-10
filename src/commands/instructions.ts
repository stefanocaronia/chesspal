// The opponent's instructions, which the MCP server gives so that they follow the version installed (D-102).
import { z } from "zod";
import { lastChatStart } from "../games/index.ts";
import { opponentInstructions } from "../host-files/index.ts";
import type { Context } from "./context.ts";
import { defineCommand } from "./registry.ts";

/** How to play as the player's opponent, which the chat reads before its first reply and again after a summary (D-102). */
export const instructions = defineCommand({
    name: "instructions",
    description: "How to play as the player's opponent at this table: the tools, the board page, how to talk. Call it before your first reply in every chat, "
        + "and again after the conversation is summarized; then call `status`.",
    input: z.object({}),
    readOnly: true,
    idempotent: true,
    alwaysLoad: true,
    run: (input, context): string => {
        context.told?.add(readKey(lastChatStart(context.folder)?.at));
        opponentText ??= opponentInstructions();
        return opponentText;
    },
    format: (text) => text,
});

/**
 * Whether the chat has read the opponent's instructions since it started, or was cleared or summarized, as its start keys them (D-57); without the host's
 * note of it, since the MCP server started. Always on the command line, which keeps nothing.
 */
export function instructionsRead(context: Context, chatStart: string | undefined): boolean
{
    return context.told === undefined || context.told.has(readKey(chatStart));
}

// The opponent's instructions, read from the package once.
let opponentText: string | undefined;

function readKey(chatStart: string | undefined): string
{
    return `instructions ${chatStart ?? ""}`;
}
