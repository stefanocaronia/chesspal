// Chesspal's plugin for OpenCode (D-117), which `chesspal init` writes as .opencode/plugins/chesspal.js in the player's folder. OpenCode runs no hooks, so
// this runs Chesspal's on its events: a chat that starts notes how (`chesspal chat`); a turn that ends waits for the player on the board page (`chesspal
// listen --opencode`), whose line comes to the chat as the player's message; a turn that starts meanwhile lets that wait go; each step notes its model,
// which signs the moves (D-81). After the AI's move an agent thinks on the player's time in a session of its own, stopped when the player moves or writes
// (D-72). Nothing here ever stops OpenCode: what fails is noted in the folder's listen.log.
import { spawn } from "node:child_process";
import { appendFileSync, existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

export default {
    id: "chesspal",
    /** Follows OpenCode's events until it lets the plugin go. `run` starts a program as Node's spawn does: the tests give their own. */
    async setup(context, run)
    {
        const chats = chesspalChats(context, typeof run === "function" ? run : spawn);
        const controller = new AbortController();

        void (async () => {
            try {
                for await (const event of context.event.subscribe({ signal: controller.signal })) {
                    chats.heard(event);
                }

                if (!controller.signal.aborted) {
                    note(chats.folder, "stopped hearing OpenCode's events");
                }
            } catch (error) {
                if (!controller.signal.aborted) {
                    note(chats.folder, `stopped hearing OpenCode's events: ${messageOf(error)}`);
                }
            }
        })();

        return () => {
            controller.abort();
            chats.stop();
        };
    },
};

// The agent that thinks for the AI on the player's time, which init writes in .opencode/agents.
const thinkerAgent = "chesspal-ponder";

/** What the plugin does with OpenCode's events in the folder: the chats it has seen, and the doorbell of each. */
function chesspalChats(context, run)
{
    const folder = context.location.directory;
    const seen = new Set();
    const ours = new Set();
    const agents = new Set();
    const listeners = new Map();
    let modelNoted = "";
    // The chats whose turn played the AI's move, the model of each chat's step, and the session that thinks for each.
    const moved = new Set();
    const models = new Map();
    const thinkers = new Map();

    // A Chesspal hook in the folder, with its input on stdin, as a host runs it: `ended` hears its exit code and what it wrote.
    const hook = (words, input, ended) => {
        try {
            const child = run(`chesspal ${words}`, { cwd: folder, shell: true, windowsHide: true, stdio: ["pipe", "pipe", "pipe"], detached: process.platform !== "win32" });
            let output = "";
            let problem = "";
            child.stdout?.on("data", (chunk) => {
                output += String(chunk);
            });
            child.stderr?.on("data", (chunk) => {
                problem += String(chunk);
            });
            child.stdin?.on("error", () => undefined);
            child.on("error", (error) => note(folder, `chesspal ${words} did not start: ${messageOf(error)}`));
            child.on("close", (code) => {
                if (problem.trim() !== "") {
                    note(folder, `chesspal ${words}: ${problem.trim()}`);
                }

                ended?.(code, output);
            });
            child.stdin?.end(JSON.stringify(input));
            return child;
        } catch (error) {
            note(folder, `chesspal ${words} did not start: ${messageOf(error)}`);
            return undefined;
        }
    };

    // A chat's doorbell, which the player's move on the page rings: its line is sent to the chat, which starts a turn.
    const listen = (session) => {
        letGo(session);
        const child = hook("listen --opencode", { cwd: folder, session_id: session, hook_event_name: "Stop", host_pid: process.pid }, (code, output) => {
            if (listeners.get(session) !== child) {
                return;
            }

            listeners.delete(session);
            const line = output.trim();

            if (code === 0 && line !== "") {
                stopThinker(session).then(() => context.session.prompt({ sessionID: session, text: line })).catch((error) => {
                    note(folder, `could not wake the chat ${session}: ${messageOf(error)}`);
                });
            }
        });

        if (child !== undefined) {
            listeners.set(session, child);
        }
    };

    // The doorbell of a chat whose turn starts: ended, with what it started; the page sees it gone.
    const letGo = (session) => {
        const child = listeners.get(session);

        if (child !== undefined) {
            listeners.delete(session);
            end(child, run);
        }
    };

    // After the AI's move, the agent that thinks on the player's time, in a session of its own on the chat's model, noted before it starts: the MCP server
    // tells its calls from the chat's by that note. A folder set up before it has no such agent, and nothing starts.
    const startThinker = async (chat) => {
        if (!existsSync(join(folder, ".opencode", "agents", `${thinkerAgent}.md`))) {
            return;
        }

        const from = Date.now();

        try {
            const model = models.get(chat);
            const created = await context.session.create({ title: "Chesspal thinking", agent: thinkerAgent, ...(model === undefined ? {} : { model }) });
            const id = created?.id;

            if (typeof id !== "string") {
                note(folder, "could not start the thinker: OpenCode gave no session");
                return;
            }

            agents.add(id);

            // The player moved or wrote meanwhile, or another thinker started: nothing to think on.
            if (!moved.has(chat) || thinkers.has(chat)) {
                await removeThinker(id);
                return;
            }

            thinkers.set(chat, id);
            noteThinkers();
            await context.session.prompt({ sessionID: id, text: "Ponder." });
            note(folder, `started the thinker ${id} in ${Date.now() - from} ms`);
        } catch (error) {
            note(folder, `could not start the thinker: ${messageOf(error)}`);
        }
    };

    // The thinker of a chat whose player moved or wrote, or whose turn starts: interrupted, then removed, even when it ended by itself.
    const stopThinker = async (chat) => {
        moved.delete(chat);
        const id = thinkers.get(chat);

        if (id === undefined) {
            return;
        }

        thinkers.delete(chat);
        const from = Date.now();

        try {
            await context.session.interrupt({ sessionID: id, resume: false });
        } catch (error) {
            note(folder, `could not interrupt the thinker ${id}: ${messageOf(error)}`);
        }

        await removeThinker(id);
        noteThinkers();
        note(folder, `stopped the thinker ${id} in ${Date.now() - from} ms`);
    };

    // Every thinker stopped, those whose session is still being made too: a chat whose move is forgotten starts none.
    const stopThinkers = () => {
        for (const chat of new Set([...moved, ...thinkers.keys()])) {
            void stopThinker(chat);
        }
    };

    // A thinker's session removed, so that the player's list of sessions does not fill with one a move.
    const removeThinker = async (id) => {
        try {
            await context.session.remove({ sessionID: id });
        } catch (error) {
            note(folder, `could not remove the thinker ${id}: ${messageOf(error)}`);
        }
    };

    // The thinkers' sessions, which the MCP server reads by the session of each call: written whole, the chats' never. Two OpenCodes in one folder would
    // each write its own and remove the other's as it starts: that is not held.
    const noteThinkers = () => {
        try {
            const path = join(folder, "opencode-agents.json");
            const written = `${path}.${process.pid}.tmp`;
            writeFileSync(written, `${JSON.stringify(Object.fromEntries([...thinkers.values()].map((id) => [id, thinkerAgent])))}\n`);
            renameSync(written, path);
        } catch (error) {
            note(folder, `could not note the thinkers: ${messageOf(error)}`);
        }
    };

    // The thinkers left when OpenCode closed over them, which the note still names: removed as the plugin starts, so that neither the player's list of
    // sessions nor the note holds them.
    const clearThinkers = async () => {
        let left = [];

        try {
            const noted = JSON.parse(readFileSync(join(folder, "opencode-agents.json"), "utf8"));
            left = Object.entries(noted ?? {}).filter(([, agent]) => agent === thinkerAgent).map(([id]) => id);
        } catch {
            // No note, or one that does not read: nothing was left.
        }

        if (left.length === 0) {
            return;
        }

        // All marked before the first is removed: an event of one of them meanwhile is no chat's.
        for (const id of left) {
            agents.add(id);
        }

        for (const id of left) {
            await removeThinker(id);
        }

        noteThinkers();
        note(folder, `removed ${left.length} thinker${left.length === 1 ? "" : "s"} left by the chat before`);
    };

    // The model of the chat's step, which the MCP server reads by the session of each call: written whole, and only when it changed.
    const noteModel = (session, model) => {
        if (typeof model?.providerID !== "string" || typeof model.id !== "string") {
            return;
        }

        const text = `${JSON.stringify({ session, model: `${model.providerID}/${model.id}` })}\n`;

        if (text === modelNoted) {
            return;
        }

        try {
            const path = join(folder, "opencode-model.json");
            const written = `${path}.${process.pid}.tmp`;
            writeFileSync(written, text);
            renameSync(written, path);
            modelNoted = text;
        } catch (error) {
            note(folder, `could not note the model: ${messageOf(error)}`);
        }
    };

    void clearThinkers();

    return {
        folder,
        heard: (event) => {
            const session = event?.data?.sessionID;

            if (typeof session !== "string") {
                return;
            }

            // OpenCode's background service runs this plugin for every folder and tells it the events of all: only the chats of this folder are its own.
            // The turn's start and end say no folder: the session's earlier events, its creation or its messages, have said it.
            const place = event.location?.directory ?? event.data.location?.directory;

            if (typeof place === "string" && sameFolder(place, folder)) {
                ours.add(session);
            }

            if (!ours.has(session)) {
                return;
            }

            // A subagent's session is born with its parent's, a thinker's with Chesspal's agent: neither is a chat, and nobody waits for the player after its turns.
            if (event.type === "session.created" && (typeof event.data.parentID === "string" || String(event.data.agent ?? "").startsWith("chesspal-"))) {
                agents.add(session);
            }

            if (agents.has(session)) {
                return;
            }

            // OpenCode tells no chat's start: a session never seen is one, the first since OpenCode started, the others after /new. A session resumed is
            // noted as cleared too: OpenCode's events do not say it was resumed. The chat before is gone from the window: a move must not wake it, and nobody
            // thinks for it.
            if (!seen.has(session)) {
                for (const other of [...listeners.keys()]) {
                    letGo(other);
                }

                stopThinkers();
                hook("chat", { cwd: folder, session_id: session, source: seen.size === 0 ? "startup" : "clear" });
                seen.add(session);
            }

            if (event.type === "session.tool.success" && movedOn(event.data)) {
                moved.add(session);
            }

            // A message of the player's, or the doorbell's own, which comes once its wait has ended, lets the wait go, and the thinker stops.
            if ((event.type === "session.inbox.enqueued" && event.data.item?.type === "user") || event.type === "session.execution.started") {
                letGo(session);
                void stopThinker(session);
            } else if (event.type === "session.execution.succeeded") {
                listen(session);

                if (moved.has(session)) {
                    void startThinker(session);
                }
            } else if (event.type === "session.execution.failed") {
                // A turn that failed still waits for the player: their next move on the page wakes the chat.
                note(folder, `the chat ${session} failed its turn${errorOf(event.data.error)}`);
                listen(session);
            } else if (event.type === "session.execution.interrupted") {
                // The player stopped the turn, as with Esc elsewhere: nobody waits for a move until they write.
            } else if (event.type === "session.step.started") {
                models.set(session, event.data.model);
                noteModel(session, event.data.model);
            }
        },
        stop: () => {
            for (const session of [...listeners.keys()]) {
                letGo(session);
            }

            stopThinkers();
        },
    };
}

/** Whether a tool that succeeded played the AI's move in a game that goes on: its answer, when the event carries it, says when the game is over. */
function movedOn(data)
{
    const played = (data.metadata?.toolCalls ?? []).some((call) => call.tool === "chesspal.ai_move" && call.status !== "error");
    const answers = (data.content ?? []).map((part) => part?.text).filter((text) => typeof text === "string");
    return played && !answers.some((text) => /^Game over: /m.test(text));
}

/** Ends a hook with what its shell started: on Windows its whole tree, else its process group; the process alone when neither can be. */
function end(child, run)
{
    try {
        if (child.pid === undefined) {
            child.kill();
        } else if (process.platform === "win32") {
            run("taskkill", ["/T", "/F", "/PID", String(child.pid)], { windowsHide: true, stdio: "ignore" }).on("error", () => child.kill());
        } else {
            process.kill(-child.pid, "SIGTERM");
        }
    } catch {
        child.kill();
    }
}

/** Whether OpenCode's folder of a session is this one, as the system compares paths: on Windows and macOS without the case. */
function sameFolder(place, folder)
{
    const caseless = process.platform === "win32" || process.platform === "darwin";
    const plain = (path) => (caseless ? resolve(path).toLowerCase() : resolve(path));
    return plain(place) === plain(folder);
}

/** Adds a line to the doorbell's log in the folder, as Chesspal's hooks do; a log that cannot be written changes nothing. */
function note(folder, line)
{
    try {
        appendFileSync(join(folder, "listen.log"), `${new Date().toISOString()} plugin opencode ${line.replace(/\s+/g, " ")}\n`);
    } catch {
        // The log only explains.
    }
}

// What OpenCode says of a turn that failed, after a colon; nothing when it says nothing.
function errorOf(error)
{
    if (error === undefined || error === null) {
        return "";
    }

    const said = typeof error === "string" ? error : error.data?.message ?? error.message ?? JSON.stringify(error);
    return `: ${said}`;
}

function messageOf(error)
{
    return error instanceof Error ? error.message : String(error);
}
