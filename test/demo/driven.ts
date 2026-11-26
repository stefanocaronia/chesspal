// The table's page with a chat the table drives, a fake one, to look at each of its states while the page is built: npm run driven. The chat's AI is a
// script that plays through its place as a real one does; the control page says what it does next: think without end, answer without moving, fail or end
// in each way the table tells apart, open slowly or not at all. The data folder is CHESSPAL_HOME, or tmp/driven, never the player's own; the table's
// ports are moved away from a real table's.
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { mkdirSync } from "node:fs";
import { createServer } from "node:http";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { newProfile } from "../../src/commands/profiles/profiles.ts";
import { type Context, defaultContext, withProfile } from "../../src/commands/registry/context.ts";
import { endOf, loadGame } from "../../src/games/index.ts";
import type { ChatOptions, HostChat, HostDriver, HostEvent } from "../../src/hosts/index.ts";
import { activeProfile, gameFolder, saveProfileSettings } from "../../src/profiles/index.ts";
import { chatInPage, drivenChats } from "../../src/server/driven/index.ts";
import type { TableChats } from "../../src/server/page/index.ts";
import { tablePlaces } from "../../src/server/places/index.ts";
import { hostChoices } from "../../src/server/table/hosts/hosts.ts";
import { startTable } from "../../src/server/table/index.ts";
import { sitAt } from "../place-client.ts";

/** What the fake AI does next, set from the control page. */
interface Script
{
    /** How a chat opens: as it should, with a host that cannot sign in, or with no program of the host's where the driver looks, which opens a terminal's. */
    opening: "ok" | "login" | "missing";
    /** How long the host takes to say which chat it is, while the page shows the chat opening; and then to call its first tool, in milliseconds. */
    hold: number;
    mute: number;
    /**
     * A turn the bell wakes: the AI moves or answers, thinks without end, answers without ever moving, reviews the game in analysis, or fails once, in the
     * host's words `why`.
     */
    turn: "play" | "think" | "quiet" | "review" | "fail";
    why: string;
}

const script: Script = { opening: "ok", hold: 1500, mute: 0, turn: "play", why: "" };

// What a host says of each failure the table tells apart, as Claude Code words them.
const hostWords = {
    overloaded: "API Error: 529 Overloaded. Try again in a few minutes.",
    limit: "You've hit your usage limit · resets 3am",
    login: "Not logged in · Please run /login",
    ended: "the host's program ended (exit code 1)",
    missing: "spawn claude ENOENT",
};

const fails = (why: string) => (): void => void Object.assign(script, { turn: "fail", why });
const ends = (why: string) => (): void => chats.at(-1)?.emit({ type: "ended", why });
const scenes: Readonly<Record<string, { label: string; set: () => void; }>> = {
    play: { label: "The AI answers each turn", set: () => void (script.turn = "play") },
    think: { label: "The AI thinks without end (stop it from the page)", set: () => void (script.turn = "think") },
    quiet: { label: "The AI answers, and never moves", set: () => void (script.turn = "quiet") },
    review: { label: "The AI reviews the game in analysis", set: () => void (script.turn = "review") },
    "turn-fails": { label: "The next turn fails: the host is overloaded", set: fails(hostWords.overloaded) },
    "turn-limit": { label: "The next turn fails: the account's limit", set: fails(hostWords.limit) },
    "turn-login": { label: "The next turn fails: not signed in any more", set: fails(hostWords.login) },
    end: { label: "The host's program ends now", set: ends(hostWords.ended) },
    "end-limit": { label: "The host's program ends now: the account's limit", set: ends(`${hostWords.ended}: ${hostWords.limit}`) },
    "end-missing": { label: "The host's program ends now: it is not found", set: ends(hostWords.missing) },
    "open-ok": { label: "A chat opens in a second and a half", set: () => Object.assign(script, { opening: "ok", hold: 1500, mute: 0 }) },
    "open-slow": { label: "A chat takes a minute to open", set: () => Object.assign(script, { opening: "ok", hold: 60_000, mute: 0 }) },
    "open-mute": { label: "A chat opens, and calls its first tool a minute later", set: () => Object.assign(script, { opening: "ok", hold: 500, mute: 60_000 }) },
    "open-login": { label: "A chat cannot sign in", set: () => void (script.opening = "login") },
    "open-missing": { label: "Claude Code is not where the driver looks: a terminal's chat opens, which here opens nothing", set: () => void (script.opening = "missing") },
};

process.env.CHESSPAL_PORT_SHIFT ??= "500";
const folder = resolve(process.env.CHESSPAL_HOME ?? fileURLToPath(new URL("../../tmp/driven/", import.meta.url)));
mkdirSync(folder, { recursive: true });
const context: Context = { ...defaultContext(), home: () => withProfile(folder, "Demo") };

// The profile Chesspal made, completed, so that the page skips its wizard (D-71), with the switch on unless --off.
if (activeProfile(context.home()).new === true) {
    newProfile.run(newProfile.input.parse({ name: "Demo", level: "regular" }), context);
}

saveProfileSettings(context.home(), activeProfile(context.home()).id, { [chatInPage]: !process.argv.includes("--off") });

const chats: FakeChat[] = [];
const table = await startTable(
    context,
    { idle: 24 * 60 * 60_000, every: 15_000 },
    drivenChats(context, { terminal: terminalChats(), places: () => tablePlaces(context), driver: () => Promise.resolve(fakeDriver()), chesspal: ["node", "cli.js"], environment: {} }),
);

if (table === undefined) {
    throw new Error("The demo's table did not start: another one holds its ports. Close it, or set CHESSPAL_PORT_SHIFT to another multiple of ten.");
}

const controlPort = Number(process.env.DEMO_PORT ?? 5990);
createServer((request, response) => {
    const scene = scenes[(request.url ?? "/").replace(/^\/demo\//, "")];

    if (scene === undefined) {
        response.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(controlPage(table.url));
    } else {
        scene.set();
        response.writeHead(204).end();
    }
}).listen(controlPort, "127.0.0.1");
console.log(`The table's page: ${table.url}\nThe fake AI's controls: http://127.0.0.1:${controlPort}/`);

/** A chat of the fake driver, as the controls reach it. */
interface FakeChat
{
    emit(event: HostEvent): void;
}

/** The hosts a real table offers, Claude Code and Codex installed, whose terminal opens nothing. */
function terminalChats(): TableChats
{
    const hosts = (["claude", "codex"] as const).map((name) => ({ name, installed: true, ...hostChoices[name], command: `chesspal play ${name}` }));
    return { hosts: () => hosts, open: () => Promise.resolve(true), held: () => undefined, relaunch: () => false };
}

/** A driver of Claude Code whose chat follows the script, and plays through its place with a client of the MCP SDK. */
function fakeDriver(): HostDriver
{
    return {
        open: (options) => fakeChat(options, `demo-${chats.length + 1}`),
        missing: () => undefined,
        program: () => (script.opening === "missing" ? undefined : { command: "claude", args: [] }),
        environment: (environment) => ({ ...environment }),
        models: () => Promise.resolve([]),
        model: "sonnet",
        efforts: ["low", "medium", "high"],
    };
}

function fakeChat(options: ChatOptions, ownSession: string): HostChat
{
    let listener: ((event: HostEvent) => void) | undefined;
    const waiting: HostEvent[] = [];
    let busy = false;
    let told = false;
    let closed = false;
    let client: Promise<Client> | undefined;
    let stopTurn: (() => void) | undefined;
    const { opening, hold, mute } = script;

    const emit = (event: HostEvent): void => {
        if (closed) {
            return;
        }

        if (listener === undefined) {
            waiting.push(event);
        } else {
            listener(event);
        }
    };

    const end = (event: HostEvent): void => {
        console.log(`The fake AI ends its turn: ${event.type === "turnEnd" ? event.reason : event.type}.`);
        stopTurn = undefined;
        busy = false;
        emit(event);
    };

    const turn = async (first: boolean): Promise<void> => {
        const stopped = new Promise<"interrupted">((done) => (stopTurn = () => done("interrupted")));

        // A host that cannot sign in fails its first turn before it says which chat it is.
        if (opening === "login") {
            await delay(hold);
            end({ type: "turnEnd", reason: "failed", why: hostWords.login });
            return;
        }

        if (!told) {
            told = true;
            await delay(hold);
            emit({ type: "session", session: options.session ?? ownSession, model: `claude-${options.model}`, ...(options.effort === undefined ? {} : { effort: options.effort }) });
            await Promise.race([delay(mute), stopped]);
        }

        if (!first && script.turn === "fail") {
            script.turn = "play";
            await delay(300);
            end({ type: "turnEnd", reason: "failed", why: script.why });
            return;
        }

        client ??= sitAt(options.server!.environment);
        const sitting = await client;
        const work = first ? startTurn(sitting) : script.turn === "think" ? new Promise<void>(() => undefined) : script.turn === "review" ? reviewTurn(sitting) : answerTurn(sitting, script.turn === "quiet");
        const done = work.then(() => "done" as const, (error: unknown) => {
            console.log(`The fake AI's turn failed: ${String(error)}`);
            return "done" as const;
        });
        end({ type: "turnEnd", reason: await Promise.race([done, stopped]) });
    };

    chats.push({ emit });
    return {
        send: () => {
            if (busy || closed) {
                return false;
            }

            busy = true;
            console.log(`The fake AI takes a turn: ${told ? script.turn : "its first"}.`);
            void turn(!told && options.session === undefined);
            return true;
        },
        onEvent: (heard) => {
            listener = heard;
            waiting.splice(0).forEach(heard);
        },
        interrupt: () => stopTurn?.(),
        close: () => {
            closed = true;
            void client?.then((sitting) => sitting.close()).catch(() => undefined);
        },
    };
}

/** What a chat's AI does at its first turn: the instructions, then status, and a word to the player. */
async function startTurn(client: Client): Promise<void>
{
    await call(client, "instructions");
    await call(client, "status");
    await call(client, "ai_say", { text: "Eccomi. Quando vuoi, cominciamo." });
}

/** A turn the bell woke: on its move the AI plays the first legal one, after a while, unless `quiet`; else it answers the player. */
async function answerTurn(client: Client, quiet: boolean): Promise<void>
{
    const current = loadGame(gameFolder(context.home()));
    await delay(1200);

    if (!quiet && current !== undefined && endOf(current.game) === undefined && current.game.position.turn === current.ai) {
        const move = current.game.legalMoves()[0]!.san;
        await call(client, "ai_move", { move, plan: "Play the first legal move, as a demo does.", comment: `Gioco ${move}.` });
    } else {
        await call(client, "ai_say", { text: "Ti ascolto." });
    }
}

/** A turn that reviews the game in analysis, in a few words, as an analyst's last call does. */
async function reviewTurn(client: Client): Promise<void>
{
    await call(client, "analyse_game");
    await delay(1200);
    await call(client, "annotate_game", { summary: "Una partita breve: l'apertura è andata bene, poi ti sei arreso presto.", closing: "Finita per abbandono." });
}

async function call(client: Client, name: string, args: Record<string, unknown> = {}): Promise<void>
{
    const result = await client.callTool({ name, arguments: args });

    console.log(`The fake AI called ${name}${result.isError === true ? `, refused: ${(result.content as { text: string; }[])[0]?.text ?? ""}` : ""}.`);
}

function controlPage(page: string): string
{
    const buttons = Object.entries(scenes).map(([name, scene]) => `<button onclick="fetch('/demo/${name}')">${scene.label}</button>`).join("\n");
    return `<!doctype html><meta charset="utf-8"><title>The fake AI's controls</title>
<style>body { font: 15px system-ui; margin: 2rem; display: grid; gap: .5rem; max-width: 28rem; } button { font: inherit; padding: .5rem; text-align: left; }</style>
<p>The table's page: <a href="${page}" target="_blank">${page}</a>. Each button says what the fake AI does next.</p>
${buttons}`;
}
