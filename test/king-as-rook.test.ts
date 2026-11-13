import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { promptAnswer } from "../src/cli/prompt-hook.ts";
import { commands, type Context } from "../src/commands/index.ts";
import { loadGame } from "../src/games/index.ts";
import { gameFolder } from "../src/profiles/index.ts";
import { testContext } from "./commands.ts";

const folders: string[] = [];
const start = new Date(2026, 10, 13, 18, 0, 0);
// The player's king on e1 and rooks on h1 and h2: Rf1 and Re2 fit a rook and the king alike.
const both = "4k3/8/8/8/8/8/7R/4K2R w - - 0 1";

beforeEach(() => {
    vi.stubEnv("CLAUDE_CODE_MESSAGING_SOCKET", "");
});

afterEach(() => {
    vi.unstubAllEnvs();

    for (const folder of folders.splice(0)) {
        rmSync(folder, { recursive: true, force: true });
    }
});

describe("a move written R and a square the player's king could go to as well as a rook", () => {
    it("is refused by player_move with the two moves it may be, and how to give it, nothing changed", () => {
        const context = gameFrom(both);

        expect(() => playerMove(context, "Rf1")).toThrow(
            "Rf1 may be the rook's move, h1f1, or the king's, e1f1: R is the king in Italian, French and Spanish. Unless the player's words name the piece, ask them which; "
                + "then give it as squares. Nothing changed.",
        );
        expect(() => playerMove(context, "Re2")).toThrow(/^Re2 may be the rook's move, h2e2, or the king's, e1e2: /);
        expect(moves(context)).toBe(0);
    });

    it("is refused with the capture sign too, where both can take", () => {
        const context = gameFrom("4k3/8/8/8/8/8/8/4Kn1R w - - 0 1");

        expect(() => playerMove(context, "Rxf1")).toThrow(/^Rxf1 may be the rook's move, h1f1, or the king's, e1f1: /);
        expect(moves(context)).toBe(0);
    });

    it("is played as squares, either piece's", () => {
        const rook = gameFrom(both);
        playerMove(rook, "h1f1");
        expect(loadGame(gameFolder(rook.home()))?.game.record.moves[0]?.san).toBe("Rf1");

        const king = gameFrom(both);
        playerMove(king, "e1f1");
        expect(loadGame(gameFolder(king.home()))?.game.record.moves[0]?.san).toBe("Kf1");
    });

    it("is played as the rook's when it names the rook's file or rank, or as the king's when written K", () => {
        for (const move of ["Rhf1", "R1f1", "Kf1"]) {
            const context = gameFrom(both);
            playerMove(context, move);
            expect(moves(context)).toBe(1);
        }
    });

    it("is played as the rook's where the king cannot go", () => {
        const context = gameFrom("4k3/8/8/8/8/8/8/K6R w - - 0 1");
        playerMove(context, "Rf1");
        expect(loadGame(gameFolder(context.home()))?.game.record.moves[0]?.san).toBe("Rf1");
    });

    it("is left to the AI by the prompt hook, which says nothing", async () => {
        const context = gameFrom(both);

        expect(
            await promptAnswer(
                JSON.stringify({ session_id: "chat-1", cwd: context.folder, hook_event_name: "UserPromptSubmit", prompt: "Rf1" }),
                async () => ({ ...context, host: () => "claude-code", given: new Set<string>(), heard: undefined }),
            ),
        ).toBeUndefined();
        expect(moves(context)).toBe(0);
    });
});

/** A game from a position, the player with White. */
function gameFrom(fen: string): Context
{
    const folder = mkdtempSync(join(tmpdir(), "chesspal-king-as-rook-"));
    folders.push(folder);
    const context: Context = { ...testContext(folder, 0, start), pageOpen: () => false };
    run(context, "new_game", { ai_colour: "black", from: fen });
    return context;
}

function playerMove(context: Context, move: string): unknown
{
    return run(context, "player_move", { move });
}

function run(context: Context, name: string, input: Record<string, unknown>): unknown
{
    const command = commands.find((each) => each.name === name)!;
    return command.run(command.input.parse(input), context);
}

function moves(context: Context): number | undefined
{
    return loadGame(gameFolder(context.home()))?.game.record.moves.length;
}
