import { describe, expect, it } from "vitest";
import { Game } from "../src/core/index.ts";

const standard = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
// Morphy against Duke Karl and Count Isouard, Paris 1858.
const opera = "e4 e5 Nf3 d6 d4 Bg4 dxe5 Bxf3 Qxf3 dxe5 Bc4 Nf6 Qb3 Qe7 Nc3 c6 Bg5 b5 Nxb5 cxb5 Bxb5+ Nbd7 O-O-O Rd8 Rxd7 Rxd7 Rd1 Qe6 Bxd7+ Nxd7 Qb8+ Nxb8 Rd8#"
    .split(" ");

describe("a game", () => {
    it("starts from the standard position", () => {
        const game = new Game();

        expect(game.position).toEqual({ fen: standard, key: expect.any(String), turn: "white", moveNumber: 1, check: false });
        expect(game.outcome).toEqual({ over: false });
        expect(game.legalMoves()).toHaveLength(20);
        expect(game.record).toEqual({ tags: {}, moves: [] });
    });

    it("plays moves in SAN and as squares, and records them in SAN", () => {
        const game = new Game();

        expect(game.play("e4")).toEqual({ played: true, move: { san: "e4", from: "e2", to: "e4" } });
        expect(game.play("e7e5")).toMatchObject({ played: true, move: { san: "e5" } });
        expect(game.play("Ng1f3")).toMatchObject({ played: true, move: { san: "Nf3" } });
        expect(game.play(" b8-c6 ")).toMatchObject({ played: true, move: { san: "Nc6" } });
        expect(game.play("Bb5!?")).toMatchObject({ played: true, move: { san: "Bb5" } });
        expect(game.record.moves.map((move) => move.san)).toEqual(["e4", "e5", "Nf3", "Nc6", "Bb5"]);
        expect(game.position).toMatchObject({ turn: "black", moveNumber: 3 });
    });

    it("castles, promotes and takes en passant", () => {
        const castles = played("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1", "0-0", "o-o-o");

        expect(castles.record.moves.map((move) => move.san)).toEqual(["O-O", "O-O-O"]);
        expect(played("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1", "e1g1").record.moves[0]?.san).toBe("O-O");
        expect(played("8/4P3/8/8/8/8/k7/4K3 w - - 0 1", "e8=Q").record.moves[0]?.san).toBe("e8=Q");
        expect(from("8/4P3/8/8/8/8/k7/4K3 w - - 0 1").play("e7e8n")).toEqual({ played: true, move: { san: "e8=N", from: "e7", to: "e8", promotion: "n" } });
        expect(played("4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 2", "exd6").position.fen).toBe("4k3/8/3P4/8/8/8/8/4K3 b - - 0 2");
    });

    it("asks for the piece when a pawn reaches the last rank without one", () => {
        for (const move of ["e7e8", "e8"]) {
            const game = from("8/4P3/8/8/8/8/k7/4K3 w - - 0 1");

            expect(game.play(move)).toMatchObject({ played: false, refusal: "unreadable", message: expect.stringContaining("say the piece") });
            expect(game.position.fen).toBe("8/4P3/8/8/8/8/k7/4K3 w - - 0 1");
        }
    });

    it("refuses an unreadable, illegal or ambiguous move, with the legal moves, and changes nothing", () => {
        const game = new Game();
        const illegal = game.play("Nf6");

        expect(illegal).toMatchObject({ played: false, refusal: "illegal", message: "Nf6 is not legal here, with white to move." });
        expect(illegal.played ? [] : illegal.legal).toContain("Nf3");
        expect(game.play("O-O")).toMatchObject({ refusal: "illegal" });

        for (const move of ["xyz", "bc4", "--", "", "e2e4e5"]) {
            expect(game.play(move), move).toMatchObject({ played: false, refusal: "unreadable" });
        }

        expect(game.record.moves).toEqual([]);
        expect(game.position.fen).toBe(standard);
        expect(from("4k3/8/8/8/8/5N2/8/1N2K3 w - - 0 1").play("Nd2")).toMatchObject({ refusal: "ambiguous", message: "Nd2 could be Nbd2 or Nfd2: say which." });
        expect(from("4k3/8/8/R7/8/8/8/R3K3 w - - 0 1").play("Raa3")).toMatchObject({ refusal: "ambiguous" });
        expect(from("4k3/8/8/R7/8/8/8/R3K3 w - - 0 1").play("R1a3")).toMatchObject({ played: true, move: { from: "a1" } });
        expect(from("4k3/8/8/8/8/5N2/8/1N2K3 w - - 0 1").play("Nxd2")).toMatchObject({ refusal: "illegal" });
    });

    it("reads the notation of books, phones and word processors", () => {
        const game = played(standard, "e2–e4", "e7—e5", "♘f3", "nc6", "♗b5", "a7−a6", "B×c6", "♟dxc6", "0–0");

        expect(game.record.moves.map((move) => move.san)).toEqual(["e4", "e5", "Nf3", "Nc6", "Bb5", "a6", "Bxc6", "dxc6", "O-O"]);
    });

    it("plays a move written with a check or a mate it does not give, and says so", () => {
        expect(new Game().play("e4+")).toEqual({ played: true, move: { san: "e4", from: "e2", to: "e4" }, note: "You wrote e4+, but e4 gives no check." });
        expect(played(standard, "f3", "e5", "g4").play("Qh4+")).toMatchObject({ played: true, note: "You wrote Qh4+, but Qh4 is checkmate." });
        expect(played(standard, "e4", "f5").play("Qh5#")).toMatchObject({ played: true, note: "You wrote Qh5#, but Qh5 is check, not mate." });
        expect(played(standard, "f3", "e5", "g4").play("Qh4#")).not.toHaveProperty("note");
    });

    it("ends by checkmate, and refuses any move after it", () => {
        const game = played(standard, "f3", "e5", "g4", "Qh4#");

        expect(game.outcome).toEqual({ over: true, result: "0-1", ending: "checkmate" });
        expect(game.position.check).toBe(true);
        expect(game.play("a3")).toEqual({ played: false, refusal: "over", message: "The game is over by checkmate (0-1): no move can follow.", legal: [] });
        expect(game.playRecorded("a3")).toMatchObject({ played: false, refusal: "over" });
        expect(game.record.tags.Result).toBe("0-1");
    });

    it("draws by stalemate and insufficient material, also when a capture leaves too little", () => {
        expect(from("7k/5Q2/6K1/8/8/8/8/8 b - - 0 1").outcome).toEqual({ over: true, result: "1/2-1/2", ending: "stalemate" });
        expect(from("4k3/8/8/8/8/8/8/2B1K3 w - - 0 1").outcome).toMatchObject({ ending: "insufficient material" });

        const captured = played("4k3/8/8/8/8/8/3r4/2B1K3 w - - 0 1", "Kxd2");

        expect(captured.outcome).toEqual({ over: true, result: "1/2-1/2", ending: "insufficient material" });
        expect(captured.play("Ke7")).toMatchObject({ played: false, refusal: "over", legal: [] });
    });

    it("draws by threefold repetition and fifty moves (D-37), and replays a record past a draw nobody claimed", () => {
        const repetition = ["Nf3", "Nf6", "Ng1", "Ng8", "Nf3", "Nf6", "Ng1", "Ng8"];
        const repeated = played(standard, ...repetition);

        expect(repeated.outcome).toEqual({ over: true, result: "1/2-1/2", ending: "threefold repetition" });
        expect(repeated.play("e4")).toEqual({
            played: false,
            refusal: "over",
            message: "The game is over by threefold repetition (1/2-1/2): no move can follow.",
            legal: [],
        });
        expect(repeated.record.tags.Result).toBe("1/2-1/2");
        expect(repeated.playRecorded("e4")).toMatchObject({ played: true });
        expect(repeated.outcome).toEqual({ over: false });
        expect(new Game({ tags: {}, moves: [...repetition, "e4"].map((san) => ({ san })) }).record.tags).toEqual({});
        // A game recorded elsewhere that played on from the draw keeps its own result; an open one gets the board's.
        expect(new Game({ tags: { Result: "0-1" }, moves: repetition.map((san) => ({ san })) }).record.tags.Result).toBe("0-1");
        expect(new Game({ tags: { Result: "*" }, moves: repetition.map((san) => ({ san })) }).record.tags.Result).toBe("1/2-1/2");

        const fifty = played("4k3/8/8/8/8/8/8/R3K3 w - - 99 60", "Ra2");

        expect(fifty.outcome).toMatchObject({ ending: "fifty moves" });
        expect(fifty.play("Kd7")).toMatchObject({ refusal: "over" });
    });

    it("starts from a FEN, and refuses a FEN that is no position", () => {
        expect(from("4k3/8/8/8/8/8/4P3/4K3 b - - 3 40").position).toMatchObject({ turn: "black", moveNumber: 40 });
        expect(() => from("not a position")).toThrow(/^The FEN tag is not a valid position/);
        expect(() => from("4k3/8/8/8/8/8/8/4RK2 w - - 0 1")).toThrow("The FEN tag is not a valid position (the side not to move is in check)");
    });

    it("replays a record, and names the move a record cannot play", () => {
        const game = new Game({ tags: { White: "Morphy" }, moves: opera.map((san) => ({ san })) });

        expect(game.outcome).toEqual({ over: true, result: "1-0", ending: "checkmate" });
        expect(game.record.tags).toEqual({ White: "Morphy", Result: "1-0" });
        expect(game.record.moves.map((move) => move.san)).toEqual(opera);
        expect(() => new Game({ tags: {}, moves: [{ san: "e4" }, { san: "Ke7" }] })).toThrow(/^The record's move 1\.\.\. Ke7 cannot be played: Ke7 is not legal/);
    });

    it("annotates a move by its ply", () => {
        const game = played(standard, "e4", "e5");
        game.annotate(1, { nags: [1], comment: "  The open\n game }" });

        expect(game.record.moves[0]).toEqual({ san: "e4", nags: [1], comment: "The open game" });
        game.annotate(1, { comment: "" });
        expect(game.record.moves[0]).toEqual({ san: "e4", nags: [1] });
        expect(() => game.annotate(3, { nags: [2] })).toThrow("There is no move 3 in this game: give a ply from 1 to 2.");
        expect(() => game.annotate(0, {})).toThrow(RangeError);
        expect(() => game.annotate(2, { nags: [256] })).toThrow("256 is not a NAG");
    });

    it("gives its record frozen, and the same legal moves for the same position", () => {
        const game = played(standard, "e4");
        const { record } = game;

        expect([record, record.tags, record.moves, record.moves[0]].every(Object.isFrozen)).toBe(true);
        expect(game.legalMoves("e4")).toEqual([]);
        expect(new Game().legalMoves("e2").map((move) => move.san)).toEqual(["e3", "e4"]);
        // The same position by another order of moves: the legal moves are computed once.
        expect(played(standard, "e4", "e5", "Nf3").legalMoves()).toBe(played(standard, "Nf3", "e5", "e4").legalMoves());
    });
});

function from(fen: string): Game
{
    return new Game({ tags: { SetUp: "1", FEN: fen }, moves: [] });
}

function played(fen: string, ...moves: string[]): Game
{
    const game = from(fen);

    for (const move of moves) {
        expect(game.play(move), move).toMatchObject({ played: true });
    }

    return game;
}
