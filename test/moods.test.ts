import { describe, expect, it } from "vitest";
import { endWithMood, Game, type GameRecord, moodAt, moodOf, moodTag, withoutMoods } from "../src/core/index.ts";

describe("the AI's mood (D-70)", () => {
    it("lasts three of the AI's moves, the one it comes with included, then fades", () => {
        const record = game(["e4", "e5", `Nf3 ${moodTag("worried")}`, "Nc6", "Bc4", "Nf6", "Ng5", "d5", "exd5", "Na5"]);

        expect(moodAt(record, "white", 2)).toEqual({ mood: "neutral", left: 0 });
        expect(moodAt(record, "white", 3)).toEqual({ mood: "worried", left: 2 });
        expect(moodAt(record, "white", 4)).toEqual({ mood: "worried", left: 2 });
        expect(moodAt(record, "white", 5)).toEqual({ mood: "worried", left: 1 });
        expect(moodAt(record, "white", 7)).toEqual({ mood: "worried", left: 0 });
        expect(moodAt(record, "white", 8)).toEqual({ mood: "worried", left: 0 });
        expect(moodAt(record, "white", 9)).toEqual({ mood: "neutral", left: 0 });
        expect(moodAt(record, "white")).toEqual({ mood: "neutral", left: 0 });
    });

    it("lasts one move for a surprise, a flash, and three for sadness", () => {
        const surprised = game(["e4", "e5", `Nf3 ${moodTag("surprised")}`, "Nc6", "Bc4"]);
        const sad = game(["e4", "e5", `Nf3 ${moodTag("sad")}`, "Nc6", "Bc4"]);

        expect(moodAt(surprised, "white", 4)).toEqual({ mood: "surprised", left: 0 });
        expect(moodAt(surprised, "white")).toEqual({ mood: "neutral", left: 0 });
        expect(moodAt(sad, "white")).toEqual({ mood: "sad", left: 1 });
    });

    it("is renewed by giving it again, changed by another, ended by neutral", () => {
        const renewed = game(["e4", "e5", `Nf3 ${moodTag("happy")}`, "Nc6", "Bc4", "Nf6", `Ng5 ${moodTag("happy")}`, "d5"]);
        const ended = game(["e4", "e5", `Nf3 ${moodTag("happy")}`, "Nc6", `Bc4 ${moodTag("neutral")}`, "Nf6"]);

        expect(moodAt(renewed, "white")).toEqual({ mood: "happy", left: 2 });
        expect(moodAt(ended, "white")).toEqual({ mood: "neutral", left: 0 });
    });

    it("ends a game with the mood given on its last move, the player's too, in place of the one it had", () => {
        const played = new Game();

        for (const move of ["f3", "e5", "g4", "Qh4#"]) {
            played.play(move);
        }

        played.annotate(3, { comment: `[%plan p] ${moodTag("happy")}` });
        played.annotate(4, { comment: moodTag("worried") });
        endWithMood(played, "surprised");

        expect(played.record.moves[3]?.comment).toBe(moodTag("surprised"));
        expect(moodAt(played.record, "white")).toEqual({ mood: "surprised", left: 0 });

        endWithMood(played, "thoughtful");

        expect(played.record.moves.map((move) => move.comment)).toEqual([undefined, undefined, `[%plan p] ${moodTag("happy")}`, moodTag("thoughtful")]);
    });

    it("counts the AI's moves from a position where Black moves first", () => {
        const record: GameRecord = { tags: { SetUp: "1", FEN: "4k3/8/8/8/8/8/4P3/4K3 b - - 0 40" }, moves: moves([`Kd7 ${moodTag("thoughtful")}`, "Kd2"]) };

        expect(moodAt(record, "black")).toEqual({ mood: "thoughtful", left: 2 });
        expect(moodAt(record, "white")).toEqual({ mood: "thoughtful", left: 1 });
    });

    it("reads only the moods it knows, and leaves another game's out", () => {
        const record = game(["e4", `e5 The centre. [%plan Hold it.] ${moodTag("worried")} [%clk 0:05:00]`]);

        expect(moodOf("[%mood furious]")).toBeUndefined();
        expect(moodOf(record.moves[1]?.comment)).toBe("worried");
        expect(withoutMoods(record).moves[1]?.comment).toBe("The centre. [%plan Hold it.] [%clk 0:05:00]");
    });
});

function game(plies: string[]): GameRecord
{
    return { tags: {}, moves: moves(plies) };
}

function moves(plies: string[]): GameRecord["moves"]
{
    return plies.map((ply) => {
        const [san = "", ...comment] = ply.split(" ");
        return comment.length === 0 ? { san } : { san, comment: comment.join(" ") };
    });
}
