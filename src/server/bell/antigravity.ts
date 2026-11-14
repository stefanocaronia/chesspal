// Antigravity's Stop hook holds the chat until it ends: a message the player writes meanwhile waits behind it, and Esc leaves it running. Antigravity's own
// files tell either: the history of what the player typed, with the conversation it went to, and its log, which notes the conversation stopped.
import { closeSync, openSync, readSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/** Antigravity's own folder, where its command line keeps its history and its log. */
export function antigravityFolder(userHome = homedir()): string
{
    return join(userHome, ".gemini", "antigravity-cli");
}

/**
 * Watches, from now on, whether the player starts a new turn in the conversation: writes in the chat, or stops it with Esc. `started` resolves then, never
 * otherwise; `stop` ends the watch.
 */
export function watchNewTurn(conversation: string, folder = antigravityFolder(), every = 500): { started: Promise<void>; stop: () => void; }
{
    const history = join(folder, "history.jsonl");
    const log = join(folder, "cli.log");
    const read = { [history]: sizeOf(history), [log]: sizeOf(log) };
    let timer: NodeJS.Timeout | undefined;

    const started = new Promise<void>((done) => {
        timer = setInterval(() => {
            if (wrote(newText(history, read), conversation) || stopped(newText(log, read), conversation)) {
                clearInterval(timer);
                done();
            }
        }, every);
        timer.unref();
    });

    return { started, stop: () => clearInterval(timer) };
}

/** Whether these lines of Antigravity's history hold something the player typed in the conversation: a message, or a command such as /clear. */
function wrote(lines: string, conversation: string): boolean
{
    return lines.split("\n").some((line) => {
        try {
            return (JSON.parse(line) as { conversationId?: unknown; }).conversationId === conversation;
        } catch {
            return false;
        }
    });
}

/** Whether these lines of Antigravity's log say the conversation was stopped, as Esc does. */
function stopped(lines: string, conversation: string): boolean
{
    return lines.includes(`Cancelling conversation ${conversation}`);
}

/** What a file gained since it was last read, as `read` keeps its size; a file that shrank, written anew, is read from its start. */
function newText(file: string, read: Record<string, number>): string
{
    const size = sizeOf(file);
    const from = size < (read[file] ?? 0) ? 0 : read[file] ?? 0;
    read[file] = size;

    if (size <= from) {
        return "";
    }

    try {
        const descriptor = openSync(file, "r");

        try {
            const buffer = Buffer.alloc(size - from);
            const length = readSync(descriptor, buffer, 0, buffer.length, from);
            return buffer.subarray(0, length).toString("utf8");
        } finally {
            closeSync(descriptor);
        }
    } catch {
        return "";
    }
}

function sizeOf(file: string): number
{
    try {
        return statSync(file).size;
    } catch {
        return 0;
    }
}
