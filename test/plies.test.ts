import { describe, expect, it } from "vitest";
import { isReviewed, readPgn } from "../src/core/index.ts";
import { talkLimits } from "../src/games/index.ts";
import { aiSpoke, analysisTalk, judgmentsOf, nextBadged, pliesOf, type Ply, talkLimits as pageLimits, talkThread, threadItem, withBook, withoutReviews } from "../src/page/game/plies.ts";

describe("the moves on the page", () => {
    it("number the moves of a game that starts with Black to move", () => {
        const [record] = readPgn('[FEN "6k1/5ppp/8/8/8/8/5PPP/3R2K1 b - - 0 23"]\n\n23... h6 24. Rd8+ Kh7 *');

        expect(pliesOf(record!)).toEqual([
            { san: "h6", side: "black", number: 23 },
            { san: "Rd8+", side: "white", number: 24 },
            { san: "Kh7", side: "black", number: 24 },
        ]);
    });

    it("carry the book's badge on the book's first moves while the game goes on, never over the AI's own review", () => {
        const [record] = readPgn("1. e4 e5 {[%badge best]} 2. Nf3 Nc6 *");
        const badges = (book: number): unknown[] => withBook(pliesOf(record!), book).map((ply) => ply.review?.badge);

        expect(badges(3)).toEqual(["book", "best", "book", undefined]);
        expect(badges(0)).toEqual([undefined, "best", undefined, undefined]);
    });

    it("give the coach's judgment of the player's last move once the AI has answered it, else of the one before, never the book's (D-78, D-88)", () => {
        const plies = (pgn: string): Ply[] => withBook(pliesOf(readPgn(pgn)[0]!), 2);

        const none = { judgments: [] };
        const sans = (shown: Ply[]) => shown.map(({ san }) => san);
        expect(sans(judgmentsOf(plies("1. e4 e5 2. d4 {[%badge mistake] [%review Too soon.]} exd4 *"), "white", none))).toEqual(["d4"]);
        expect(judgmentsOf(plies("1. e4 e5 2. d4 {[%badge mistake]} *"), "white", none)).toEqual([]);
        expect(judgmentsOf(plies("1. e4 e5 *"), "white", none)).toEqual([]);
        // A note held until the player's next move shows once they have played it, and stays until the coach judges another (Zoe and Federico).
        expect(sans(judgmentsOf(plies("1. e4 e5 2. d4 {[%review Qh5 next.]} exd4 3. Nf3 *"), "white", none))).toEqual(["d4"]);
        expect(sans(judgmentsOf(plies("1. e4 e5 2. d4 {[%review Qh5 next.]} exd4 3. Nf3 Nc6 *"), "white", none))).toEqual(["d4"]);
        expect(sans(judgmentsOf(plies("1. e4 e5 2. d4 {[%review Qh5 next.]} exd4 3. Nf3 {[%badge best]} Nc6 *"), "white", none))).toEqual(["Nf3"]);
        // One let go only now, however far back, goes first, above the latest (Zoe).
        const late = "1. e4 e5 2. d4 {[%review Qh5 next.]} exd4 3. Nf3 Nc6 4. Bc4 {[%badge best]} Nf6 *";
        expect(sans(judgmentsOf(plies(late), "white", { judgments: [{ ply: 3, note: "Qh5 next.", released: true }] }))).toEqual(["d4", "Bc4"]);
        expect(sans(judgmentsOf(plies(late), "white", none))).toEqual(["Bc4"]);
    });

    it("take a game as reviewed only for the analyst's word, never for the opponent's badges (D-78)", () => {
        expect(isReviewed(readPgn("1. e4 {[%badge good] [%review The centre.]} e5 *")[0]!)).toBe(false);
        expect(isReviewed(readPgn("{[%review A quiet game.]} 1. e4 e5 *")[0]!)).toBe(true);
    });

    it("keep the AI's drawings beside the book's badge, and drop its review during a game with the helps off (D-78)", () => {
        const [record] = readPgn("1. e4 {[%badge good]} e5 {[%cal Gg8f6]} *");
        const plies = withBook(pliesOf(record!), 2);

        expect(plies.map((ply) => ply.review)).toEqual([{ badge: "good" }, { badge: "book", arrows: [{ colour: "green", from: "g8", to: "f6" }] }]);
        expect(withoutReviews(pliesOf(record!)).map((ply) => ply.review)).toEqual([undefined, undefined]);
    });

    it("keep only the words of a comment, never the AI's plan an ended game shows nor the mark of a draw offer", () => {
        const [record] = readPgn("1. e4 {[%plan Take the centre.]} e5 {The open game. [%plan Develop the knights.]} 2. Nf3 {(=)} Nc6 {(=) No, thanks.} 1/2-1/2");

        expect(pliesOf(record!).map((ply) => ply.comment)).toEqual([undefined, "The open game.", undefined, "No, thanks."]);
    });

    it("thread the talk of the game in the order said, a comment just after its move and before the lines said there", () => {
        // Black is the AI: 23... h6 is its move, 24. Rd8+ the player's, 24... Kh7 its answer.
        const plies = pliesOf(readPgn('[FEN "6k1/5ppp/8/8/8/8/5PPP/3R2K1 b - - 0 23"]\n\n23... h6 {Air for the king.} 24. Rd8+ {A check.} Kh7 {Out of it.} *')[0]!);
        const before = { who: "ai", text: "Your move.", ply: 0 } as const;
        const hello = { who: "player", text: "Hi", ply: 1, heard: "answered" } as const;
        const after = { who: "ai", text: "Check, I see.", ply: 2 } as const;
        const alsoAfter = { who: "ai", text: "Let me think.", ply: 2 } as const;

        expect(talkThread([], "black", [])).toEqual([]);
        expect(talkThread([], "black", [before])).toEqual([before]);
        expect(talkThread(plies, "black", [before, hello, after, alsoAfter]).map(({ who, text, ply }) => ({ who, text, ply }))).toEqual([
            before,
            { who: "ai", text: "Air for the king.", ply: 1 },
            { who: "player", text: "Hi", ply: 1 },
            after,
            alsoAfter,
            { who: "ai", text: "Out of it.", ply: 3 },
        ]);
    });

    it("keep the talk's own order in the thread, and the player's line with how far it got", () => {
        const plies = pliesOf(readPgn("1. e4 {Centre.} e5 2. Nf3 *")[0]!);
        const late = { who: "player", text: "Late.", ply: 3, heard: "read" } as const;
        const early = { who: "ai", text: "Early.", ply: 1 } as const;
        const thread = talkThread(plies, "white", [late, early]);

        expect(thread.map(({ text }) => text)).toEqual(["Centre.", "Late.", "Early."]);
        expect(thread[1]!.line).toEqual(late);
        expect(thread[0]!.line).toBeUndefined();
    });

    it("give each bubble the move its words go with, the last played when they were said, none before the first", () => {
        const plies = pliesOf(readPgn('[FEN "6k1/5ppp/8/8/8/8/5PPP/3R2K1 b - - 0 23"]\n\n23... h6 {Air for the king.} 24. Rd8+ *')[0]!);
        const thread = talkThread(plies, "black", [{ who: "ai", text: "Your move.", ply: 0 }, { who: "player", text: "Check!", ply: 2 }]);

        expect(thread.map((item) => item.move === undefined ? undefined : `${item.move.number}${item.move.side === "white" ? "." : "..."}${item.move.san}`)).toEqual([
            undefined,
            "23...h6",
            "24.Rd8+",
        ]);
    });

    it("name a bubble's move only when it changes from the bubble before, whoever spoke", () => {
        const plies = pliesOf(readPgn('[FEN "6k1/5ppp/8/8/8/8/5PPP/3R2K1 b - - 0 23"]\n\n23... h6 {Air for the king.} 24. Rd8+ *')[0]!);
        const thread = talkThread(plies, "black", [
            { who: "player", text: "Why?", ply: 1 },
            { who: "ai", text: "Room.", ply: 1 },
            { who: "player", text: "Check!", ply: 2 },
            { who: "player", text: "Again.", ply: 2 },
        ]);

        expect(thread.map((item) => [item.text, item.move?.san])).toEqual([
            ["Air for the king.", "h6"],
            ["Why?", undefined],
            ["Room.", undefined],
            ["Check!", "Rd8+"],
            ["Again.", undefined],
        ]);
    });

    it("make a line of the talk in analysis a bubble with no move, the player's with its line", () => {
        const asked = { who: "player", text: "Why?", ply: 0, shown: { game: "study/a.pgn", at: 3, move: "2.Qh5" } } as const;

        expect(threadItem(asked)).toEqual({ who: "player", text: "Why?", ply: 0, line: asked });
        expect(threadItem({ who: "ai", text: "Because.", ply: 0 })).toEqual({ who: "ai", text: "Because.", ply: 0 });
    });

    it("count each time the AI spoke, its comments and its lines, never the player's", () => {
        const plies = pliesOf(readPgn('[FEN "6k1/5ppp/8/8/8/8/5PPP/3R2K1 b - - 0 23"]\n\n23... h6 {Air for the king.} 24. Rd8+ {A check.} *')[0]!);
        const talk = [{ who: "ai", text: "Your move.", ply: 0 }, { who: "player", text: "Hi", ply: 2 }] as const;

        expect(aiSpoke([], "black", [])).toBe(0);
        expect(aiSpoke(plies, "black", talk)).toBe(2);
    });

    it("give the talk over a game in analysis from the player's first line on it, never their lines on another, all of it (D-101)", () => {
        const on = (game: string, text: string) => ({ who: "player", text, ply: 0, shown: { game, at: 3, move: "2.Qh5" } }) as const;
        const before = { who: "ai", text: "Good game.", ply: 0 } as const;
        const answer = { who: "ai", text: "The queen comes out early.", ply: 0 } as const;

        expect(analysisTalk([before, on("study/a.pgn", "Why?"), answer, on("study/b.pgn", "And here?")], "study/a.pgn")).toEqual([on("study/a.pgn", "Why?"), answer]);
        expect(analysisTalk([before], "study/a.pgn")).toEqual([]);
        // The AI's answer on another game stays with that game, and the talk on this one goes on after it.
        const other = { who: "ai", text: "On b.", ply: 0 } as const;
        const back = on("study/a.pgn", "Back to a.");
        expect(analysisTalk([on("study/a.pgn", "Why?"), answer, on("study/b.pgn", "And here?"), other, back], "study/a.pgn")).toEqual([on("study/a.pgn", "Why?"), answer, back]);
        expect(analysisTalk(Array.from({ length: 12 }, (_, index) => on("study/a.pgn", `${index}`)), "study/a.pgn").map(({ text }) => text)).toEqual(
            ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11"],
        );
    });

    it("go from a badge's count to the side's next move with it, the first again after the last", () => {
        const [record] = readPgn("1. e4 {[%badge book]} e5 {[%badge mistake]} 2. Qh5 {[%badge mistake]} Nc6 {[%badge good]} 3. Bc4 {[%badge book]} Nf6 {[%badge blunder]} 4. Qxf7# *");
        const plies = pliesOf(record!);

        expect(nextBadged(plies, "white", "book", 0)).toBe(1);
        expect(nextBadged(plies, "white", "book", 1)).toBe(5);
        expect(nextBadged(plies, "white", "book", 5)).toBe(1);
        expect(nextBadged(plies, "white", "book", 7)).toBe(1);
        // A badge of the other side is not this one's.
        expect(nextBadged(plies, "white", "mistake", 0)).toBe(3);
        expect(nextBadged(plies, "black", "mistake", 2)).toBe(2);
        expect(nextBadged(plies, "black", "brilliant", 0)).toBeUndefined();
    });

    it("hold the player's words to the server's limits", () => {
        expect(pageLimits).toEqual({ line: talkLimits.player });
    });
});
