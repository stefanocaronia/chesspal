// A chat attached to the table (D-104): the board page is the table's, and the chat tells it over HTTP, on this machine, what a page it served itself would
// read from it: that it calls a tool, a copy of what it saw after each, and that the New game window should open.
import { Agent, type ClientRequest, request, type RequestOptions } from "node:http";
import type { Context } from "../../commands/index.ts";
import { aiHostOf, aiModelOf } from "../../games/index.ts";
import { tableFolder } from "../../home/index.ts";
import { outdatedHostFiles } from "../../host-files/index.ts";
import { gameFolder } from "../../profiles/index.ts";
import { isOlder, version } from "../../version.ts";
import { jsonOf } from "../page/http.ts";
import type { Page } from "../page/page.ts";
import { askToQuit, tableAt } from "./table.ts";

/**
 * Attaches the chat to the table of its data folder, when one of its version answers and no other chat is at it: the page the chat then uses, whose `lost`
 * is told once the table is gone or no longer knows the chat. An older table is asked to quit; with none, a newer one or another chat at it, none, and
 * the chat serves its own page.
 */
export async function attachTable(context: Context, lost: () => void): Promise<Page | undefined>
{
    const table = await tableOf(context);

    if (table === undefined) {
        return undefined;
    }

    if (table.version !== version) {
        if (table.version === undefined || isOlder(table.version, version)) {
            await askToQuit(table.port);
        }

        return undefined;
    }

    const link = new TableLink(table.port, context, lost);
    return (await link.attach()) ? tablePage(link, table.url) : undefined;
}

/** Whether a table of this version answers for the chat's data folder with no chat at it: a chat that serves its own page goes there at its next tool. */
export async function tableToJoin(context: Context): Promise<boolean>
{
    const table = await tableOf(context);
    return table !== undefined && table.version === version && table.chat === undefined;
}

/** The table of the chat's data folder, when one answers; none while the data folder cannot be made. */
async function tableOf(context: Context): ReturnType<typeof tableAt>
{
    try {
        return await tableAt(tableFolder(context.home()));
    } catch {
        return undefined;
    }
}

// How long the table may take to answer the chat: it answers in a millisecond, so one that takes more than a second is stuck (Federico).
const answerWait = 1_500;

/** What the table answered a request: its words; "lost" when it is gone or no longer knows the chat; none when only this request failed. */
type Answer = Record<string, unknown> | "lost" | undefined;

/** The page as the attached chat uses it: what a page of its own reads from the chat, the chat sends the table. */
function tablePage(link: TableLink, url: string): Page
{
    return {
        url,
        heard: () => link.copy(true),
        chatCalls: () => link.calls(),
        toolEnded: () => link.copy(false),
        open: () => link.open,
        inUse: () => true,
        askNewGame: () => link.askNewGame(),
        close: async () => link.leave(),
    };
}

/** The chat's end of its place at the table: its token, whether a browser has the page open, and the copies it sends, in order, one at a time. */
class TableLink
{
    /** Whether a browser had the page open at the table's last answer. */
    open = false;
    private token = "";
    private attachment: ClientRequest | undefined;
    private readonly agent = new Agent({ keepAlive: true, maxSockets: 1 });
    private news = false;
    private copying = false;
    private left = false;
    private readonly port: number;
    private readonly context: Context;
    private readonly lost: () => void;

    constructor(port: number, context: Context, lost: () => void)
    {
        this.port = port;
        this.context = context;
        this.lost = lost;
    }

    /** Attaches: whether the table took the chat. The answer then stays open for as long as both live; when it closes, the chat has lost the table. */
    attach(): Promise<boolean>
    {
        return new Promise((done) => {
            let text = "";
            let attached = false;
            // A table that takes the chat and then says nothing is no table: the chat serves its own page (Priya).
            const silent = setTimeout(() => this.attachment?.destroy(), answerWait);
            silent.unref();
            this.attachment = request({ ...this.address("/api/chat"), agent: false }, (response) => {
                response.setEncoding("utf8");
                // The first line gives the chat its token; a table that refuses it answers with a status of its own and closes.
                response.on("data", (chunk: string) => {
                    if (attached) {
                        return;
                    }

                    text += chunk;
                    const line = text.indexOf("\n");

                    if (line === -1) {
                        return;
                    }

                    const answer = jsonOf(text.slice(0, line));
                    clearTimeout(silent);

                    if (response.statusCode === 200 && typeof answer?.token === "string") {
                        attached = true;
                        this.token = answer.token;
                        this.open = answer.open === true;
                    } else {
                        this.attachment?.destroy();
                    }

                    done(attached);
                });
                response.on("close", () => {
                    clearTimeout(silent);
                    return attached ? this.leave() : done(false);
                });
            });
            // The answer kept open never keeps the chat's process alive: it ends when its host goes.
            this.attachment.on("socket", (socket) => socket.unref());
            this.attachment.on("error", () => {
                clearTimeout(silent);
                done(false);
            });
            this.attachment.end(JSON.stringify(attachment(this.context)));
        });
    }

    /** The chat calls a tool: the table hears it before the tool runs, which starts the AI's clock when nobody had heard the player. */
    async calls(): Promise<void>
    {
        this.answered(await this.post("/api/chat/call", {}));
    }

    /** Sends a copy of what the chat saw once the call under way has ended, those asked meanwhile as one; with `news`, the pages hear of it. */
    copy(news: boolean): void
    {
        this.news ||= news;

        if (this.copying) {
            return;
        }

        this.copying = true;
        setImmediate(() => {
            this.copying = false;
            const body = { ...seenBy(this.context), news: this.news };
            this.news = false;
            void this.post("/api/chat/read", body).then((answer) => this.answered(answer));
        });
    }

    /** Asks the pages open to show the New game window, without waiting: whether one was open, as the table last said. */
    askNewGame(): boolean
    {
        void this.post("/api/chat/new-game", {}).then((answer) => this.answered(answer));
        return this.open;
    }

    /** Leaves the table, once: the chat's process ends, the table is gone, or no longer knows the chat. */
    leave(): void
    {
        if (!this.left) {
            this.left = true;
            this.attachment?.destroy();
            this.agent.destroy();
            this.lost();
        }
    }

    // The table did not answer, or no longer knows the chat: it is lost. A request it failed alone changes nothing.
    private answered(answer: Answer): void
    {
        if (answer === "lost") {
            this.leave();
        } else if (typeof answer?.open === "boolean") {
            this.open = answer.open;
        }
    }

    // A request to the table on the chat's own connection, kept alive, and once more on a new one when the table had just closed the one kept.
    private post(path: string, body: Record<string, unknown>, retry = true): Promise<Answer>
    {
        if (this.left) {
            return Promise.resolve("lost");
        }

        return new Promise((done) => {
            const asked = request({ ...this.address(path), agent: this.agent }, (response) => {
                const chunks: Buffer[] = [];
                response.on("data", (chunk: Buffer) => chunks.push(chunk));
                response.on("end", () => done(answerOf(response.statusCode, Buffer.concat(chunks).toString("utf8"))));
                response.on("close", () => done("lost"));
            });
            // A table that stops answering would hold every tool of the chat's: it is lost, and the chat serves its own page (Priya).
            asked.setTimeout(answerWait, () => asked.destroy(new Error("The table did not answer.")));
            asked.on("error", (error: NodeJS.ErrnoException) => {
                // The table closes a connection idle for 5 s as Node reuses it: the request never reached it (Federico).
                if (retry && asked.reusedSocket && error.code === "ECONNRESET") {
                    void this.post(path, body, false).then(done);
                } else {
                    done("lost");
                }
            });
            asked.end(JSON.stringify({ ...body, token: this.token }));
        });
    }

    private address(path: string): RequestOptions
    {
        return { host: "127.0.0.1", port: this.port, path, method: "POST", headers: { "Content-Type": "application/json" } };
    }
}

/** A table that no longer knows the chat answers 409; another status is one request it failed, and the chat stays. */
function answerOf(status: number | undefined, text: string): Answer
{
    if (status === 409) {
        return "lost";
    }

    return status === 200 ? jsonOf(text) : undefined;
}

/** What the chat says of itself as it attaches:its version, session and folder, its host, and whether its folder needs init again. */
function attachment(context: Context): Record<string, unknown>
{
    return {
        version,
        session: process.env.CLAUDE_CODE_SESSION_ID ?? null,
        folder: context.folder,
        host: context.host?.(),
        outdated: outdatedHostFiles(context.folder, context.platform).length > 0,
    };
}

/** What the chat saw, for the table's copy: the game and the position, the words it was given, its host, and who played as the AI (D-82, D-97). */
function seenBy(context: Context): Record<string, unknown>
{
    const folder = gameFolderOf(context);
    return {
        seen: context.seen,
        positionSeen: context.positionSeen,
        positionFirstSeen: context.positionFirstSeen,
        given: [...context.given],
        host: context.host?.(),
        aiModel: folder === undefined ? undefined : aiModelOf(folder),
        aiHost: folder === undefined ? undefined : aiHostOf(folder),
    };
}

function gameFolderOf(context: Context): string | undefined
{
    try {
        return gameFolder(context.home());
    } catch {
        return undefined;
    }
}
