import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { promptAnswer } from "../src/cli/prompt-hook.ts";
import { commands, type Context } from "../src/commands/index.ts";
import { withSanPieces } from "../src/core/index.ts";
import { loadGame } from "../src/games/index.ts";
import { gameFolder } from "../src/profiles/index.ts";
import { testContext } from "./commands.ts";

const folders: string[] = [];
const start = new Date(2026, 10, 13, 18, 0, 0);
// The player's bishop on c1, queen on d1, king on e1, knight on g1 and rook on h1.
const pieces = "4k3/8/8/8/8/8/8/2BQK1NR w - - 0 1";
// The player's king on e1 and rooks on h1 and h2: Rf1 and Re2 fit a rook and the king alike.
const both = "4k3/8/8/8/8/8/7R/4K2R w - - 0 1";
// The player's rook on a1 and king on e1: only the king can go to e2.
const kingOnly = "4k3/8/8/8/8/8/8/R3K3 w - - 0 1";
const promotion = "4k3/1P6/8/8/8/8/8/4K3 w - - 0 1";

beforeEach(() => {
    vi.stubEnv("CLAUDE_CODE_MESSAGING_SOCKET", "");
});

afterEach(() => {
    vi.unstubAllEnvs();

    for (const folder of folders.splice(0)) {
        rmSync(folder, { recursive: true, force: true });
    }
});

describe("a piece's letter of another language that names one piece only", () => {
    it("is written as SAN's, with the move's number, signs and promotion; any other text is left as it is", () => {
        const read: [string, string][] = [
            ["Cf3", "Nf3"],
            ["Sf3", "Nf3"],
            ["Axf7+", "Bxf7+"],
            ["Fd2", "Bd2"],
            ["Ld2", "Bd2"],
            ["Tf1", "Rf1"],
            ["tf1", "Rf1"],
            ["Dd1", "Qd1"],
            ["4. Cxe5#", "4. Nxe5#"],
            ["1...Dd8", "1...Qd8"],
            ["T f1", "R f1"],
            ["Thf1", "Rhf1"],
            ["e8=D", "e8=Q"],
            ["e8D", "e8Q"],
            ["exd1=T+", "exd1=R+"],
            ["e7e8A", "e7e8B"],
            ["b8=C", "b8=N"],
        ];

        for (const [written, san] of read) {
            expect(withSanPieces(written), written).toBe(san);
        }

        for (const kept of ["Bc4", "Kf2", "Re2", "Nf3", "Pd4", "cf3", "dd3", "bc4", "d4", "e8=Q", "e7e8d", "Ciao", "D", "Cf3 e5", "O-O"]) {
            expect(withSanPieces(kept), kept).toBe(kept);
        }
    });

    it("is played by player_move as the piece it names", () => {
        const cases: [string, string, string][] = [
            [pieces, "Cf3", "Nf3"],
            [pieces, "Sf3", "Nf3"],
            [pieces, "Ad2", "Bd2"],
            [pieces, "Fd2", "Bd2"],
            [pieces, "Ld2", "Bd2"],
            [pieces, "Th3", "Rh3"],
            [pieces, "th3", "Rh3"],
            [pieces, "Dd3", "Qd3"],
            [promotion, "b8=D", "b8=Q"],
            [promotion, "b8D", "b8=Q"],
            [promotion, "b8=T", "b8=R"],
            [promotion, "b8=A", "b8=B"],
            [promotion, "b8=C", "b8=N"],
        ];

        for (const [fen, written, san] of cases) {
            const context = gameFrom(fen);
            playerMove(context, written);
            expect(firstMove(context), written).toMatch(new RegExp(`^${san}[+#]?$`));
        }
    });

    it("plays T as the rook where the king could go too", () => {
        const context = gameFrom(both);
        playerMove(context, "Tf1");
        expect(firstMove(context)).toBe("Rf1");
    });

    it("says what it was read as when the move is refused", () => {
        const context = gameFrom(pieces);
        expect(() => playerMove(context, "Db4")).toThrow("Db4 is read as Qb4. Qb4 is not legal here, with White to move. Ask the player again. Nothing changed.");
        expect(firstMove(context)).toBeUndefined();
    });

    it("is still refused with its hint in the AI's own move", () => {
        const context = gameFrom("3qk3/8/8/8/8/8/8/4K1NR b - - 0 1");
        expect(() => run(context, "ai_move", { move: "Dd8", plan: "p" })).toThrow(/never D\. For a queen, Qd8\./);
    });

    it("is played by the prompt hook as the player sends it, answered with the figurine", async () => {
        const cases: [string, string, string][] = [
            [pieces, "Cf3", "Player: 1.♞f3 (g1-f3)."],
            [both, "Tf1", "Player: 1.♜f1 (h1-f1)."],
            ["4k3/8/8/8/8/3Q4/8/4K3 w - - 0 1", "Dd1", "Player: 1.♛d1 (d3-d1)."],
            ["4k3/5p2/8/8/2B5/8/8/4K3 w - - 0 1", "Axf7", "Player: 1.♝xf7+ (c4-f7)."],
        ];

        for (const [fen, written, answer] of cases) {
            const context = gameFrom(fen);
            expect(await hook(context, written), written).toContain(answer);
            expect(firstMove(context)).not.toBeUndefined();
        }
    });
});

describe("a move written R and a square only the player's king can go to", () => {
    it("is refused by player_move with the king's move, to ask the player, nothing changed", () => {
        const context = gameFrom(kingOnly);
        expect(() => playerMove(context, "Re2")).toThrow(
            "Re2 is not legal: R is the rook in SAN, and no rook can go to e2. The king can, Ke2, and R is the king in Italian, French and Spanish: "
                + "ask the player whether they meant the king, and give Ke2 only once they say so. Nothing changed.",
        );
        expect(firstMove(context)).toBeUndefined();
    });

    it("is left to the AI by the prompt hook", async () => {
        const context = gameFrom(kingOnly);
        expect(await hook(context, "Re2")).toBeUndefined();
        expect(firstMove(context)).toBeUndefined();
    });
});

/** A game from a position, the AI with the colour given. */
function gameFrom(fen: string, ai = "black"): Context
{
    const folder = mkdtempSync(join(tmpdir(), "chesspal-foreign-pieces-"));
    folders.push(folder);
    const context: Context = { ...testContext(folder, 0, start), pageOpen: () => false };
    run(context, "new_game", { ai_colour: ai, from: fen });
    return context;
}

function playerMove(context: Context, move: string): unknown
{
    return run(context, "player_move", { move });
}

function hook(context: Context, prompt: string): Promise<string | undefined>
{
    return promptAnswer(
        JSON.stringify({ session_id: "chat-1", cwd: context.folder, hook_event_name: "UserPromptSubmit", prompt }),
        async () => ({ ...context, host: () => "claude-code", given: new Set<string>(), heard: undefined }),
    );
}

function run(context: Context, name: string, input: Record<string, unknown>): unknown
{
    const command = commands.find((each) => each.name === name)!;
    return command.run(command.input.parse(input), context);
}

function firstMove(context: Context): string | undefined
{
    return loadGame(gameFolder(context.home()))?.game.record.moves[0]?.san;
}
