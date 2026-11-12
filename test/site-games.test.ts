import { mkdtempSync, rmSync } from "node:fs";
import { request } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { commands } from "../src/commands/index.ts";
import type { Context } from "../src/commands/registry/context.ts";
import { keptGames } from "../src/games/index.ts";
import { activeProfile, gameFolder } from "../src/profiles/index.ts";
import { type Page, startPage } from "../src/server/page/page.ts";
import { type Fetch, isSiteGameName, readSiteGames, siteGameName } from "../src/sites/index.ts";
import { testContext } from "./commands.ts";

const folders: string[] = [];
const opened: Page[] = [];

afterEach(async () => {
    await Promise.all(opened.splice(0).map((page) => page.close()));

    for (const folder of folders.splice(0)) {
        rmSync(folder, { recursive: true, force: true });
    }
});

// What the sites answer in these tests, by address: JSON, the lines of Lichess's games, a text as it comes, a status alone, a body broken halfway, or
// nothing at all, as when the network is down.
type Answer = { status?: number; body?: unknown; lines?: readonly unknown[]; text?: string; } | "down" | "broken";
type Answers = Readonly<Record<string, Answer>>;

const lichessAddress = "https://lichess.org/api/games/user/anna_k?max=20&perfType=ultraBullet,bullet,blitz,rapid,classical,correspondence&pgnInJson=true&clocks=true&evals=false&opening=false";
const archivesAddress = "https://api.chess.com/pub/player/annak/games/archives";
const october = "https://api.chess.com/pub/player/annak/games/2026/10";
const september = "https://api.chess.com/pub/player/annak/games/2026/09";

/** The scholar's mate as Lichess writes it, with its clocks. */
function lichessPgn(id: string, white: string, black: string, result = "1-0"): string
{
    return [
        '[Event "Rated blitz game"]',
        `[Site "https://lichess.org/${id}"]`,
        `[White "${white}"]`,
        `[Black "${black}"]`,
        `[Result "${result}"]`,
        '[WhiteElo "1612"]',
        '[BlackElo "1580"]',
        '[TimeControl "180+0"]',
        "",
        "1. e4 { [%clk 0:03:00] } e5 { [%clk 0:03:00] } 2. Bc4 { [%clk 0:02:58] } Nc6 { [%clk 0:02:57] } 3. Qh5 { [%clk 0:02:55] } Nf6 { [%clk 0:02:50] }",
        `4. Qxf7# { [%clk 0:02:53] } ${result}`,
        "",
    ].join("\n");
}

/** The scholar's mate as Chess.com writes it: its Site and Link tags, a TimeControl in seconds, clocks with tenths, the black moves numbered again. */
function chesscomPgn(id: number, black: string): string
{
    return [
        '[Event "Live Chess"]',
        '[Site "Chess.com"]',
        '[Date "2026.10.20"]',
        '[Round "-"]',
        '[White "AnnaK"]',
        `[Black "${black}"]`,
        '[Result "1-0"]',
        '[WhiteElo "1480"]',
        '[BlackElo "1500"]',
        '[TimeControl "180"]',
        '[Termination "AnnaK won by checkmate"]',
        `[Link "https://www.chess.com/game/live/${id}"]`,
        "",
        "1. e4 {[%clk 0:02:59.9]} 1... e5 {[%clk 0:02:59.1]} 2. Bc4 {[%clk 0:02:57.8]} 2... Nc6 {[%clk 0:02:55]} 3. Qh5 {[%clk 0:02:53]} 3... Nf6 {[%clk 0:02:50]} 4. Qxf7# {[%clk 0:02:49]} 1-0",
        "",
    ].join("\n");
}

const lichessGame = { id: "HqjDTU4A", variant: "standard", speed: "blitz", status: "mate", lastMoveAt: Date.UTC(2026, 9, 14, 18), pgn: lichessPgn("HqjDTU4A", "anna_k", "Bob") };

const lichessAnna: Answers = {
    [lichessAddress]: {
        lines: [
            lichessGame,
            { id: "Chess960", variant: "chess960", speed: "blitz", status: "mate", lastMoveAt: Date.UTC(2026, 9, 15), pgn: lichessPgn("Chess960", "anna_k", "Cleo") },
            { id: "Going0n1", variant: "standard", speed: "rapid", status: "started", lastMoveAt: Date.UTC(2026, 9, 16), pgn: lichessPgn("Going0n1", "anna_k", "Dan", "*") },
        ],
    },
};

function chesscomGame(id: number, day: Date, black = "Eve"): Record<string, unknown>
{
    return { url: `https://www.chess.com/game/live/${id}`, pgn: chesscomPgn(id, black), time_class: "rapid", rules: "chess", end_time: day.getTime() / 1000 };
}

const chesscomAnna: Answers = {
    [archivesAddress]: { body: { archives: [september, october] } },
    [october]: {
        body: {
            games: [
                chesscomGame(186466981288, new Date(Date.UTC(2026, 9, 20))),
                { ...chesscomGame(186466981289, new Date(Date.UTC(2026, 9, 21))), rules: "crazyhouse" },
                { ...chesscomGame(186466981290, new Date(Date.UTC(2026, 9, 22))), pgn: undefined },
            ],
        },
    },
    [september]: { body: { games: [chesscomGame(186000000001, new Date(Date.UTC(2026, 8, 30)), "Fay")] } },
};

const both = { lichess: "anna_k", chesscom: "AnnaK" };

describe("the latest games on the sites (D-110)", () => {
    it("merge both sites the latest first, read from the tags, without variants, games not finished or without a PGN, Chess.com topped up from the month before", async () => {
        const { games, answered, unreached, unknown } = await readSiteGames(both, sites({ ...lichessAnna, ...chesscomAnna }));

        expect(games.map(({ pgn: _pgn, ...game }) => game)).toEqual([
            { site: "chess.com", name: "chess.com/live/186466981288", white: "AnnaK", black: "Eve", whiteRating: 1480, blackRating: 1500, result: "1-0", speed: "rapid", played: "2026-10-20T00:00:00.000Z", moves: 4 },
            { site: "lichess", name: "lichess/HqjDTU4A", white: "anna_k", black: "Bob", whiteRating: 1612, blackRating: 1580, result: "1-0", speed: "blitz", played: "2026-10-14T18:00:00.000Z", moves: 4 },
            { site: "chess.com", name: "chess.com/live/186000000001", white: "AnnaK", black: "Fay", whiteRating: 1480, blackRating: 1500, result: "1-0", speed: "rapid", played: "2026-09-30T00:00:00.000Z", moves: 4 },
        ]);
        expect(games[1]!.pgn).toBe(lichessGame.pgn);
        expect({ answered, unreached, unknown }).toEqual({ answered: ["lichess", "chess.com"], unreached: [], unknown: [] });
        expect(games.every((game) => isSiteGameName(game.name))).toBe(true);
    });

    it("read only the last month of Chess.com when it holds enough games, and never a month on another host", async () => {
        const asked: string[] = [];
        const many = Array.from({ length: 21 }, (_, index) => chesscomGame(100 + index, new Date(Date.UTC(2026, 9, 1 + index))));
        const { games } = await readSiteGames({ chesscom: "AnnaK" }, sites({ ...chesscomAnna, [october]: { body: { games: many } } }, asked));

        expect(games).toHaveLength(20);
        expect(games[0]!.name).toBe("chess.com/live/120");
        expect(asked).not.toContain(september);

        const elsewhere = "https://example.com/pub/player/annak/games/2026/10";
        const strange = await readSiteGames({ chesscom: "AnnaK" }, sites({ [archivesAddress]: { body: { archives: [elsewhere] } }, [elsewhere]: { body: { games: many } } }, asked));
        expect(strange).toMatchObject({ games: [], answered: ["chess.com"] });
        expect(asked).not.toContain(elsewhere);
    });

    it("fail Chess.com when its last month cannot be read, and keep that month's games when the month before cannot", async () => {
        const first = await readSiteGames({ chesscom: "AnnaK" }, sites({ ...chesscomAnna, [october]: "down" }));
        expect(first).toMatchObject({ games: [], unreached: ["chess.com"], answered: [] });

        const later = await readSiteGames({ chesscom: "AnnaK" }, sites({ ...chesscomAnna, [september]: { status: 500 } }));
        expect(later.games.map((game) => game.name)).toEqual(["chess.com/live/186466981288"]);
        expect(later.answered).toEqual(["chess.com"]);
    });

    it("leave out a Lichess game aborted, and one without a result", async () => {
        const aborted = { ...lichessGame, status: "aborted", pgn: lichessPgn("HqjDTU4A", "anna_k", "Bob", "*") };
        const unfinished = { ...lichessGame, status: "outoftime", pgn: lichessPgn("HqjDTU4A", "anna_k", "Bob", "*") };

        for (const game of [aborted, unfinished]) {
            expect(await readSiteGames({ lichess: "anna_k" }, sites({ [lichessAddress]: { lines: [game] } }))).toMatchObject({ games: [], answered: ["lichess"] });
        }
    });

    it("take a 200 that cannot be read, of HTML or cut short, for a site not reached, never for no games", async () => {
        const html = { text: "<!doctype html><title>Down for maintenance</title>" };
        const cases: Answers[] = [
            { [archivesAddress]: html },
            { [archivesAddress]: { text: '{"archives": ["https://api.chess.com/pub/pla' } },
            { ...chesscomAnna, [october]: html },
            { ...chesscomAnna, [october]: { text: '{"games": [{"url": "https://www.chess.com/game/li' } },
            { ...chesscomAnna, [archivesAddress]: "broken" },
            { [lichessAddress]: html },
            { [lichessAddress]: { text: '{"id": "HqjDTU4A", "variant": "stan' } },
            { [lichessAddress]: "broken" },
        ];

        for (const answers of cases) {
            const site = Object.keys(answers).some((address) => address.startsWith("https://lichess")) ? { lichess: "anna_k" } : { chesscom: "AnnaK" };
            expect((await readSiteGames(site, sites(answers))).unreached).toHaveLength(1);
        }
    });

    it("say which site could not be reached and which has no player by that name, while the other answers", async () => {
        const down = await readSiteGames(both, sites({ ...lichessAnna, [archivesAddress]: "down" }));
        expect(down).toMatchObject({ answered: ["lichess"], unreached: ["chess.com"], unknown: [] });
        expect(down.games.map((game) => game.name)).toEqual(["lichess/HqjDTU4A"]);

        const busy = await readSiteGames(both, sites({ [lichessAddress]: { status: 429 }, ...chesscomAnna }));
        expect(busy).toMatchObject({ unreached: ["lichess"], unknown: [] });

        const ghost = await readSiteGames(both, sites({ ...lichessAnna }));
        expect(ghost).toMatchObject({ unreached: [], unknown: ["chess.com"] });
    });

    it("know a name in other capitals or with spaces, and nothing else", () => {
        expect(siteGameName("  Lichess/HqjDTU4A ")).toBe("lichess/HqjDTU4A");
        expect(siteGameName("Chess.com/Live/186466981288")).toBe("chess.com/live/186466981288");
        expect(siteGameName("https://lichess.org/HqjDTU4A")).toBeUndefined();
        expect(siteGameName("chess.com/HqjDTU4A")).toBeUndefined();
        expect(isSiteGameName("Lichess/HqjDTU4A")).toBe(false);
    });
});

describe("site_games and analyse_game with a game of the sites (D-110)", () => {
    it("lists the games for the AI from the player's side without their PGN, both names when neither is theirs, and says how to go over one", async () => {
        const stranger = { ...lichessGame, id: "Other123", lastMoveAt: Date.UTC(2026, 9, 13), pgn: lichessPgn("Other123", "Cleo", "Dan", "1/2-1/2") };
        const context = await annaWith({ [lichessAddress]: { lines: [lichessGame, stranger] }, [archivesAddress]: "down" });

        expect(await run(context, "site_games")).toBe([
            "lichess/HqjDTU4A: White (1612) vs Bob (1580), won, blitz, 2026-10-14.",
            "lichess/Other123: Cleo (1612) vs Dan (1580), 1/2-1/2, blitz, 2026-10-13.",
            "Chess.com could not be reached: tell the player, and ask again when they ask.",
            'To go over one, analyse_game with game set to its name, such as {"game": "lichess/HqjDTU4A"}.',
        ].join("\n"));

        const silent = await annaWith({ [lichessAddress]: "down", [archivesAddress]: "down" });
        expect(await run(silent, "site_games")).toBe("Lichess and Chess.com could not be reached: tell the player, and ask again when they ask.");
    });

    it("is refused with no name on the sites in the profile, and while a game goes on, without asking any site", async () => {
        const context = contextWith({ ...lichessAnna });
        await expect(run(context, "site_games")).rejects.toThrow("Tell the player: put your name on Lichess or Chess.com in your profile");

        const asked: string[] = [];
        const anna = await annaWith({ ...lichessAnna }, asked);
        await run(anna, "new_game", { ai_colour: "black" });
        asked.length = 0;
        await expect(run(anna, "site_games")).rejects.toThrow("A game is going on");
        await expect(run(anna, "analyse_game", { game: "lichess/HqjDTU4A" })).rejects.toThrow("A game is going on");
        expect(asked).toEqual([]);
    });

    it("keeps a game of the sites to study by its name, in any capitals, once however often it is asked, the player marked by the site's name", async () => {
        const asked: string[] = [];
        const context = await annaWith({ ...lichessAnna, ...chesscomAnna }, asked);
        asked.length = 0;

        expect(await run(context, "analyse_game", { game: " Lichess/HqjDTU4A " })).toContain("White: anna_k (the player); Black: Bob. Time control 3+0. Result: 1-0 (checkmate), after 4 moves.");
        // Only the game's site is asked.
        expect(asked).toEqual([lichessAddress]);
        await run({ ...context, now: () => new Date(2026, 10, 3) }, "analyse_game", { pgn: "lichess/HqjDTU4A" });
        expect(keptGames(gameFolder(context.home()))).toHaveLength(1);
    });

    it("reads a game in Chess.com's PGN, with its clocks in tenths", async () => {
        const context = await annaWith({ ...chesscomAnna });
        const analysis = await run(context, "analyse_game", { game: "chess.com/live/186466981288" });

        expect(analysis).toContain("White: AnnaK (the player); Black: Eve. 2026.10.20, time control 3+0. Result: 1-0 (checkmate), after 4 moves.");
        expect(analysis).toContain("2.Bc4: spent 0:02, 2:57 left");
    });

    it("refuses a link, a name gone wrong, a name no longer among the latest games, and says when the site could not be reached", async () => {
        const context = await annaWith({ ...lichessAnna, ...chesscomAnna });
        const noLink = "Chesspal takes no link: site_games lists the player's latest games on Lichess and Chess.com; give the name it writes, as game.";

        await expect(run(context, "analyse_game", { game: "https://lichess.org/HqjDTU4A" })).rejects.toThrow(noLink);
        await expect(run(context, "analyse_game", { pgn: "https://www.chess.com/game/live/186466981288" })).rejects.toThrow(noLink);
        await expect(run(context, "analyse_game", { game: "chess.com/HqjDTU4A" })).rejects.toThrow(noLink);
        await expect(run(context, "analyse_game", { game: "lichess/Gone1234" })).rejects.toThrow(
            "lichess/Gone1234 is not among the player's latest games on Lichess any more: call site_games again and give a name it writes.",
        );
        await expect(run({ ...context, fetch: sites({ ...lichessAnna }) }, "analyse_game", { game: "chess.com/live/186466981288" })).rejects.toThrow("is not among");
        await expect(run({ ...context, fetch: sites({ [lichessAddress]: "down" }) }, "analyse_game", { game: "lichess/HqjDTU4A" })).rejects.toThrow("Lichess could not be reached");
    });

    it("refuses a game when the profile in use changed while the site answered", async () => {
        const context = await annaWith({});
        const { fetch: _fetch, ...offline } = context;
        const answer = sites({ ...lichessAnna });

        const changing: Fetch = async (input, init) => {
            await run(offline, "new_profile", { name: "Bruno" });
            return answer(input, init);
        };

        await expect(run({ ...context, fetch: changing }, "analyse_game", { game: "lichess/HqjDTU4A" })).rejects.toThrow("The profile in use changed while the site answered");
        expect(activeProfile(context.home()).name).toBe("Bruno");
        expect(keptGames(gameFolder(context.home()))).toEqual([]);
    });
});

describe("the board page's latest games on the sites (D-110)", () => {
    it("gives site_games's value with the PGNs and the player's side, and its refusals as a 409 with their code", async () => {
        const anna = await annaWith({ ...lichessAnna, ...chesscomAnna });
        const page = await open(anna);
        const answer = await get(page, "/api/site-games");

        expect(answer.status).toBe(200);
        expect(JSON.parse(answer.body)).toMatchObject({
            games: [{ name: "chess.com/live/186466981288", player: "white", moves: 4 }, { name: "lichess/HqjDTU4A", pgn: lichessGame.pgn, player: "white" }, {}],
            answered: ["lichess", "chess.com"],
            unreached: [],
            unknown: [],
        });

        const refusalAt = async (context: Context): Promise<unknown> => {
            const refused = await get(await open(context), "/api/site-games");
            expect(refused.status).toBe(409);
            return JSON.parse(refused.body);
        };

        expect(await refusalAt(contextWith({}))).toMatchObject({ refusal: "no-accounts", error: expect.stringContaining("Tell the player") });
        const { fetch: _fetch, ...offline } = await annaWith({});
        expect(await refusalAt(offline)).toMatchObject({ refusal: "no-network" });
        const playing = await annaWith({});
        await run(playing, "new_game", { ai_colour: "black" });
        expect(await refusalAt(playing)).toMatchObject({ refusal: "game-going" });
    });
});

/** A fetch that answers as the sites would, noting each address asked. */
function sites(answers: Answers, asked: string[] = []): Fetch
{
    return (async (input: string | URL | Request) => {
        const address = String(input);
        asked.push(address);
        const answer = answers[address] ?? { status: 404 };

        if (answer === "down") {
            throw new TypeError("fetch failed");
        }

        if (answer === "broken") {
            return new Response(brokenBody(), { status: 200 });
        }

        const body = answer.text ?? (answer.lines !== undefined ? answer.lines.map((line) => JSON.stringify(line)).join("\n") : answer.body === undefined ? null : JSON.stringify(answer.body));
        return new Response(body, { status: answer.status ?? 200 });
    }) as Fetch;
}

/** A body that stops halfway, as when the signal gives up while it comes. */
function brokenBody(): ReadableStream<Uint8Array>
{
    return new ReadableStream({
        start(controller)
        {
            controller.enqueue(new TextEncoder().encode('{"archives": ['));
            controller.error(new Error("aborted"));
        },
    });
}

function contextWith(answers: Answers, asked: string[] = []): Context
{
    const folder = mkdtempSync(join(tmpdir(), "chesspal-site-games-"));
    folders.push(folder);
    return { ...testContext(folder), fetch: sites(answers, asked) };
}

/** A player whose profile names anna_k on Lichess and AnnaK on Chess.com. */
async function annaWith(answers: Answers, asked: string[] = []): Promise<Context>
{
    const context = contextWith(answers, asked);
    await run(context, "new_profile", { name: "Anna", ...both });
    return context;
}

async function run(context: Context, name: string, input: Record<string, unknown> = {}): Promise<string>
{
    const command = commands.find((candidate) => candidate.name === name);

    if (command === undefined) {
        throw new Error(`No command ${name}.`);
    }

    return command.format(await command.run(command.input.parse(input), context));
}

async function open(context: Context): Promise<Page>
{
    const page = await startPage(context, {});
    opened.push(page);
    return page;
}

function get(page: Page, path: string): Promise<{ status: number; body: string; }>
{
    const url = new URL(path, page.url);
    return new Promise((done, fail) => {
        const sent = request({ host: url.hostname, port: url.port, path, agent: false, headers: { host: url.host } }, (response) => {
            let body = "";
            response.setEncoding("utf8");
            response.on("data", (chunk: string) => body += chunk);
            response.on("end", () => done({ status: response.statusCode ?? 0, body }));
        });
        sent.on("error", fail);
        sent.end();
    });
}
