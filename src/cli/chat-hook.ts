// `chesspal chat`, the SessionStart hook of Claude Code and Codex (D-57): it writes how the chat started, new, cleared, resumed or compacted, for new_game to read.
import { saveChatStart } from "../games/index.ts";

/** Reads the hook's input and writes how the chat started; a failure is told on stderr and never stops the chat. */
export async function recordChatStart(input: NodeJS.ReadableStream = process.stdin, folder = process.cwd(), now = new Date()): Promise<void>
{
    try {
        const hook = parsed(await textOf(input));
        saveChatStart(folder, {
            source: typeof hook.source === "string" ? hook.source : "startup",
            at: now.toISOString(),
            ...(typeof hook.session_id === "string" ? { session: hook.session_id } : {}),
            ...(typeof hook.transcript_path === "string" ? { transcript: hook.transcript_path } : {}),
        });
    } catch (error) {
        process.stderr.write(`Chesspal could not note how the chat started: ${(error as Error).message}\n`);
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
