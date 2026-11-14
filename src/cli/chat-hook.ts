// `chesspal chat`, the SessionStart hook of Claude Code, Codex and Antigravity (D-57): it writes how the chat started, new, cleared, resumed or compacted,
// for new_game to read.
import { type ChatStart, loadGame, saveChatStart } from "../games/index.ts";
import { dataFolder } from "../home/index.ts";
import { gameFolder } from "../profiles/index.ts";

/**
 * Reads the hook's input and writes how the chat started; a failure is told on stderr and never stops the chat. Antigravity names its chat a conversation,
 * new at every start, /clear too, and runs the hook in .agents: the chat's folder is the one its input names. The game in progress is read from the data
 * folder `home`.
 */
export async function recordChatStart(input: NodeJS.ReadableStream = process.stdin, folder = process.cwd(), now = new Date(), home = dataFolder): Promise<void>
{
    try {
        const hook = parsed(await textOf(input));
        const conversation = typeof hook.conversationId === "string" ? hook.conversationId : undefined;
        const session = typeof hook.session_id === "string" ? hook.session_id : conversation;
        const transcript = typeof hook.transcript_path === "string" ? hook.transcript_path : typeof hook.transcriptPath === "string" ? hook.transcriptPath : undefined;
        const source = typeof hook.source === "string" ? hook.source : "startup";
        saveChatStart(conversation !== undefined && typeof hook.cwd === "string" ? hook.cwd : folder, {
            source,
            at: now.toISOString(),
            ...(session === undefined ? {} : { session }),
            ...(transcript === undefined ? {} : { transcript }),
            // Only a chat that starts clean needs to know where it started in the game: the others skip the reading.
            ...(source === "startup" || source === "clear" ? gameInProgress(home) : {}),
        });
    } catch (error) {
        process.stderr.write(`Chesspal could not note how the chat started: ${(error as Error).message}\n`);
    }
}

/** The game in progress as the chat starts, by its start and its plies; none when there is none, or it cannot be read. */
function gameInProgress(home: () => string): Pick<ChatStart, "game">
{
    try {
        const current = loadGame(gameFolder(home()));
        return current === undefined ? {} : { game: { started: current.started, plies: current.game.record.moves.length } };
    } catch {
        return {};
    }
}

async function textOf(input: NodeJS.ReadableStream): Promise<string>
{
    let text = "";

    for await (const chunk of input) {
        text += String(chunk);
    }

    return text;
}

function parsed(text: string): Record<string, unknown>
{
    try {
        const value: unknown = JSON.parse(text);
        return typeof value === "object" && value !== null ? value as Record<string, unknown> : {};
    } catch {
        return {};
    }
}
