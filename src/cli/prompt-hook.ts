// `chesspal prompt`, Claude Code's UserPromptSubmit hook (D-36): a prompt that is one move and nothing else, Chesspal plays as the player sends it and
// tells the AI beside the prompt; any other goes to the AI as it is. Only the move's shape is checked before the commands load.
import type { Context } from "../commands/index.ts";

/** Reads the hook's input and, when the prompt is a move Chesspal plays, writes what the AI is told; it never blocks the prompt. */
export async function answerPrompt(input: NodeJS.ReadableStream = process.stdin, sent = new Date()): Promise<void>
{
    try {
        const answer = await promptAnswer(await textOf(input), (hook) => hookContext(hook, sent));

        if (answer !== undefined) {
            process.stdout.write(`${answer}\n`);
        }
    } catch (error) {
        process.stderr.write(`Chesspal could not play the move written in the chat: ${String((error as Error).message ?? error).replace(/\s+/g, " ")}\n`);
    }
}

/**
 * What the hook writes, the JSON Claude Code reads, when the prompt is one move and Chesspal played it; undefined, with nothing changed, for any other
 * prompt or a move refused. `contextOf` gives what the move is played with, in the chat's folder; it then notes there the position shown to the chat.
 */
export async function promptAnswer(input: string, contextOf: (hook: HookInput) => Promise<Context>): Promise<string | undefined>
{
    const hook = hookInput(input);

    if (hook.prompt === undefined || !moveShape.test(hook.prompt) || hook.session === undefined) {
        return undefined;
    }

    const [context, { playMoveSentAlone }, { hostProcess, notePositionShown }] = await Promise.all([contextOf(hook), import("../commands/index.ts"), import("../games/index.ts")]);
    let played;

    try {
        played = playMoveSentAlone(hook.prompt, context);
    } catch (error) {
        // Chesspal's refusals end so: the game as it was, the AI reads the prompt and answers it.
        if (error instanceof Error && error.message.endsWith("Nothing changed.")) {
            return undefined;
        }

        throw error;
    }

    try {
        const { position, stamp, given } = played;
        const host = hostProcess();
        notePositionShown(context.folder, {
            session: hook.session,
            ...(host === undefined ? {} : { process: host }),
            ...(stamp === undefined ? {} : { stamp }),
            ...position,
            at: context.now().toISOString(),
            given,
        });
    } catch (error) {
        // The move is played: the AI hears it all the same, and its server asks it for status before its own, which may give the words again.
        process.stderr.write(`Chesspal could not note the position it showed the chat: ${(error as Error).message}\n`);
    }

    return JSON.stringify({ hookSpecificOutput: { hookEventName: "UserPromptSubmit", additionalContext: played.answer } });
}

/** What the hook reads of Claude Code's input: the prompt trimmed, the chat's session and the folder it runs in. */
export interface HookInput
{
    prompt?: string;
    session?: string;
    cwd?: string;
}

// One move and nothing else, as player_move takes it: SAN with K, Q, R, B and N, small or as figurines, or as squares, or castling; a check or mate sign.
const moveShape = /^(?:[KQRBNkqrbn♔-♟]?[a-h]?[1-8]?[-x:×–—−]?[a-h][1-8](?:=?[QRBNqrbn])?|[0Oo]-[0Oo](?:-[0Oo])?)[+#]?$/u;

/** The context of the chat's folder: the data folder its server is given, the moment the player sent the move, and Claude Code, which runs this hook. */
async function hookContext(hook: HookInput, sent: Date): Promise<Context>
{
    const [{ defaultContext }, { chatFolder, serverHome }] = await Promise.all([import("../commands/index.ts"), import("../server/bell/index.ts")]);
    const folder = chatFolder(hook);
    const home = serverHome(folder);

    // A playtest's data folder, which .mcp.json gives the server and not the hook.
    if (home !== undefined) {
        process.env.CHESSPAL_HOME = home;
    }

    return { ...defaultContext(), folder, now: () => sent, host: () => "claude-code" };
}

async function textOf(input: NodeJS.ReadableStream): Promise<string>
{
    let text = "";

    for await (const chunk of input) {
        text += String(chunk);
    }

    return text;
}

function hookInput(text: string): HookInput
{
    try {
        const { prompt, session_id: session, cwd } = JSON.parse(text) as { prompt?: unknown; session_id?: unknown; cwd?: unknown; };
        return {
            ...(typeof prompt === "string" ? { prompt: prompt.trim() } : {}),
            ...(typeof session === "string" ? { session } : {}),
            ...(typeof cwd === "string" ? { cwd } : {}),
        };
    } catch {
        return {};
    }
}
