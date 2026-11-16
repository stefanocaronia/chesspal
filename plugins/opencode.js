// Chesspal's plugin for OpenCode (D-117), which `chesspal init` writes as .opencode/plugins/chesspal.js in the player's folder. OpenCode runs no hooks, so
// this runs Chesspal's on its events: a chat that starts notes how (`chesspal chat`); a turn that ends waits for the player on the board page (`chesspal
// listen --opencode`), whose line comes to the chat as the player's message; a turn that starts meanwhile lets that wait go; each step notes its model,
// which signs the moves (D-81). Nothing here ever stops OpenCode: what fails is noted in the folder's listen.log.
import { spawn } from "node:child_process";
import { appendFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

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

/** What the plugin does with OpenCode's events in the folder: the chats it has seen, and the doorbell of each. */
function chesspalChats(context, run)
{
    const folder = context.location.directory;
    const seen = new Set();
    const agents = new Set();
    const listeners = new Map();
    let modelNoted = "";

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
        const child = hook("listen --opencode", { cwd: folder, session_id: session, hook_event_name: "Stop" }, (code, output) => {
            if (listeners.get(session) !== child) {
                return;
            }

            listeners.delete(session);
            const line = output.trim();

            if (code === 0 && line !== "") {
                Promise.resolve(context.session.prompt({ sessionID: session, text: line })).catch((error) => {
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

    return {
        folder,
        heard: (event) => {
            const session = event?.data?.sessionID;

            if (typeof session !== "string") {
                return;
            }

            // A subagent's session is born with its parent's: it is no chat, and nobody waits for the player after its turns.
            if (event.type === "session.created" && typeof event.data.parentID === "string") {
                agents.add(session);
            }

            if (agents.has(session)) {
                return;
            }

            // OpenCode tells no chat's start: a session never seen is one, the first since OpenCode started, the others after /new. A session resumed is
            // noted as cleared too: OpenCode's events do not say it was resumed. The chat before is gone from the window: a move must not wake it.
            if (!seen.has(session)) {
                for (const other of [...listeners.keys()]) {
                    letGo(other);
                }

                hook("chat", { cwd: folder, session_id: session, source: seen.size === 0 ? "startup" : "clear" });
                seen.add(session);
            }

            // A message of the player's, or the doorbell's own, which comes once its wait has ended, lets the wait go.
            if ((event.type === "session.inbox.enqueued" && event.data.item?.type === "user") || event.type === "session.execution.started") {
                letGo(session);
            } else if (event.type === "session.execution.succeeded") {
                listen(session);
            } else if (event.type === "session.execution.failed") {
                // A turn that failed still waits for the player: their next move on the page wakes the chat.
                note(folder, `the chat ${session} failed its turn${errorOf(event.data.error)}`);
                listen(session);
            } else if (event.type === "session.execution.interrupted") {
                // The player stopped the turn, as with Esc elsewhere: nobody waits for a move until they write.
            } else if (event.type === "session.step.started") {
                noteModel(session, event.data.model);
            }
        },
        stop: () => {
            for (const session of [...listeners.keys()]) {
                letGo(session);
            }
        },
    };
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
