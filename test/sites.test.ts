import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { Context } from "../src/commands/context.ts";
import { commands, refreshRatings } from "../src/commands/index.ts";
import { activeProfile, profileFolder } from "../src/profiles/index.ts";
import { type Fetch, readingsStale, readSites } from "../src/sites/index.ts";
import { testContext } from "./commands.ts";

const folders: string[] = [];

afterEach(() => {
    for (const folder of folders.splice(0)) {
        rmSync(folder, { recursive: true, force: true });
    }
});

// What the sites answer in these tests, by address: an answer of their JSON, a status alone, or nothing at all, as when the network is down.
type Answers = Readonly<Record<string, { status?: number; body?: unknown; } | "down">>;

const lichessAnna = {
    "https://lichess.org/api/user/anna_k": {
        body: {
            id: "anna_k",
            perfs: { rapid: { games: 9, rating: 1612, rd: 140, prov: true }, classical: { games: 40, rating: 1704.4, rd: 62 }, blitz: { games: 300, rating: 1550, rd: 45 } },
        },
    },
    "https://lichess.org/api/user/anna_k/perf/classical": { body: { stat: { playStreak: { lastDate: "2026-10-14T18:02:11.000Z" } } } },
};

const chesscomAnna = {
    "https://api.chess.com/pub/player/annak/stats": {
        body: { chess_rapid: { last: { rating: 1480, rd: 38, date: Date.UTC(2026, 9, 30) / 1000 } }, chess_blitz: { last: { rating: 1390, rd: 30, date: 0 } } },
    },
};

describe("the ratings on the sites (D-105, D-106)", () => {
    it("count the rapid, then the classical when the rapid is provisional, with the day of the last game at that speed, and say so of a name a site lacks", async () => {
        const asked: string[] = [];
        const read = await readSites({ lichess: "anna_k", chesscom: "Ghost" }, sites({ ...lichessAnna, "https://api.chess.com/pub/player/ghost/stats": { status: 404 } }, asked), undefined, now);

        expect(read).toEqual({
            read: now.toISOString(),
            lichess: { account: "anna_k", found: true, rating: { value: 1704, site: "lichess", speed: "classical", deviation: 62, played: "2026-10-14" } },
            chesscom: { account: "Ghost", found: false },
        });
        // Named as Chesspal, the name asked and nothing else.
        expect(asked.every((line) => line.endsWith(` Chesspal/${version()}`))).toBe(true);
    });

    it("take Chess.com's rapid as it is, never converted, and pass over a speed whose RD is still wide", async () => {
        const wide = { "https://api.chess.com/pub/player/annak/stats": { body: { chess_rapid: { last: { rating: 1480, rd: 180, date: 0 } }, chess_blitz: { last: { rating: 1390, rd: 30, date: 0 } } } } };

        expect((await readSites({ chesscom: "AnnaK" }, sites(chesscomAnna), undefined, now)).chesscom?.rating).toEqual({ value: 1480, site: "chess.com", speed: "rapid", deviation: 38, played: "2026-10-30" });
        expect((await readSites({ chesscom: "AnnaK" }, sites(wide), undefined, now)).chesscom?.rating).toMatchObject({ value: 1390, speed: "blitz" });
    });

    it("leave out a player with no established rating at a speed that counts, and a closed account", async () => {
        const fresh = { "https://lichess.org/api/user/new_one": { body: { perfs: { rapid: { games: 2, rating: 1500, rd: 300, prov: true }, bullet: { games: 900, rating: 2000, rd: 40 } } } } };
        const closed = { "https://lichess.org/api/user/gone": { body: { id: "gone", disabled: true } } };

        expect((await readSites({ lichess: "new_one" }, sites(fresh), undefined, now)).lichess).toEqual({ account: "new_one", found: true });
        expect((await readSites({ lichess: "gone" }, sites(closed), undefined, now)).lichess).toEqual({ account: "gone", found: false });
    });

    it("keep what a site said before of the same name when it does not answer, marked, ask it again ten minutes later, and know nothing of a new name", async () => {
        const before = await readSites({ lichess: "anna_k", chesscom: "AnnaK" }, sites({ ...lichessAnna, ...chesscomAnna }), undefined, now);
        const down = sites({ "https://lichess.org/api/user/Anna_K": "down", "https://api.chess.com/pub/player/bruno/stats": { status: 503 } });
        const after = await readSites({ lichess: "Anna_K", chesscom: "Bruno" }, down, before, now);

        expect(after.lichess).toEqual({ ...before.lichess, account: "Anna_K", unreached: true });
        expect(after.chesscom).toEqual({ account: "Bruno", unreached: true });
        // A site that did not answer is asked again ten minutes later, not at once.
        expect(readingsStale(after, { lichess: "Anna_K", chesscom: "Bruno" }, now)).toBe(false);
        expect(readingsStale(after, { lichess: "Anna_K", chesscom: "Bruno" }, new Date(now.getTime() + 10 * 60 * 1000))).toBe(true);
        expect(readingsStale(before, { lichess: "anna_k", chesscom: "AnnaK" }, later)).toBe(false);
        expect(readingsStale(before, { lichess: "anna_k" }, now)).toBe(true);
    });
});

describe("the ratings of the profile (D-106)", () => {
    it("are read when the names change, the surer of the two counting, and the AI reads it as the site gives it", async () => {
        const context = contextWith({ ...lichessAnna, ...chesscomAnna });
        await run(context, "new_profile", { name: "Anna", level: "regular" });

        expect(await run(context, "edit_profile", { lichess: "anna_k", chesscom: "AnnaK" })).toBe(
            "Profile anna: Anna, plays often, rated 1480 rapid on Chess.com (last game 2026-10); anna_k on Lichess and AnnaK on Chess.com.",
        );
        expect(await run(context, "status")).toContain("Player: Anna, plays often, rated 1480 rapid on Chess.com (last game 2026-10).");
        // The FIDE rating the player types stands beside the site's, never merged with it.
        await run(context, "edit_profile", { fide: 1650 });
        expect(await run(context, "status")).toContain("Player: Anna, plays often, rated FIDE 1650 and 1480 rapid on Chess.com (last game 2026-10).");
        expect(JSON.parse(readFileSync(join(profileFolder(context.home(), "anna"), "ratings.json"), "utf8")).read).toBe(now.toISOString());

        // A name changed by hand leaves its site's rating out until it is read again.
        const file = join(profileFolder(context.home(), "anna"), "profile.md");
        writeFileSync(file, readFileSync(file, "utf8").replace('chesscom: "AnnaK"', 'chesscom: "Bruno"'));
        expect(activeProfile(context.home()).rating).toMatchObject({ value: 1704, site: "lichess", speed: "classical" });

        await run(context, "edit_profile", { chesscom: "", lichess: "" });
        expect(activeProfile(context.home())).not.toHaveProperty("rating");
        expect(activeProfile(context.home())).not.toHaveProperty("sites");
    });

    it("are read again only after a day, or when a site did not answer, never twice at once, and never without the page's or the command line's fetch", async () => {
        const asked: string[] = [];
        const context = contextWith({ ...lichessAnna }, asked);
        await run(context, "new_profile", { name: "Anna", lichess: "anna_k" });
        const id = activeProfile(context.home()).id;
        asked.length = 0;

        expect(await refreshRatings(context, id, day)).toBe(false);
        expect(await refreshRatings({ ...context, now: () => new Date(now.getTime() + day + 1) }, id, day)).toBe(true);
        expect(asked).toHaveLength(2);

        const both = [refreshRatings({ ...context, now: () => new Date(now.getTime() + 3 * day) }, id, day), refreshRatings({ ...context, now: () => new Date(now.getTime() + 3 * day) }, id, day)];
        expect(await Promise.all(both)).toEqual([true, true]);
        expect(asked).toHaveLength(4);

        const { fetch: _fetch, ...without } = context;
        expect(await refreshRatings({ ...without, now: () => new Date(now.getTime() + 9 * day) }, id, day)).toBe(false);
    });

    it("drop what the sites said when the names changed while they answered", async () => {
        const context = contextWith({ ...lichessAnna });
        const { fetch: _fetch, ...without } = context;
        const answer = sites({ ...lichessAnna });
        await run(without, "new_profile", { name: "Anna", lichess: "anna_k" });
        const folder = profileFolder(context.home(), activeProfile(context.home()).id);
        const file = join(folder, "profile.md");

        const changing: Fetch = async (input, init) => {
            writeFileSync(file, readFileSync(file, "utf8").replace('lichess: "anna_k"', 'lichess: "bruno"'));
            return answer(input, init);
        };

        expect(await refreshRatings({ ...context, fetch: changing }, "anna")).toBe(false);
        expect(existsSync(join(folder, "ratings.json"))).toBe(false);
        expect(activeProfile(context.home()).accounts).toEqual({ lichess: "bruno" });
    });
});

const now = new Date(Date.UTC(2026, 10, 11, 8));
const day = 24 * 60 * 60 * 1000;
const later = new Date(now.getTime() + day);

function version(): string
{
    return (JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version: string; }).version;
}

/** A fetch that answers as the sites would, noting each address asked and the name the request gives itself. */
function sites(answers: Answers, asked: string[] = []): Fetch
{
    return (async (input: string | URL | Request, init?: RequestInit) => {
        const address = String(input);
        asked.push(`${address} ${new Headers(init?.headers).get("User-Agent") ?? ""}`);
        const answer = answers[address] ?? { status: 404 };

        if (answer === "down") {
            throw new TypeError("fetch failed");
        }

        return new Response(answer.body === undefined ? null : JSON.stringify(answer.body), { status: answer.status ?? 200, headers: { "Content-Type": "application/json" } });
    }) as Fetch;
}

function contextWith(answers: Answers, asked: string[] = []): Context
{
    const folder = mkdtempSync(join(tmpdir(), "chesspal-sites-"));
    folders.push(folder);
    return { ...testContext(folder, 0, now), fetch: sites(answers, asked) };
}

async function run(context: Context, name: string, input: Record<string, unknown> = {}): Promise<string>
{
    const command = commands.find((candidate) => candidate.name === name);

    if (command === undefined) {
        throw new Error(`No command ${name}.`);
    }

    return command.format(await command.run(command.input.parse(input), context));
}
