import { describe, expect, it } from "vitest";
import type { TalkLine, ThreadItem } from "../src/page/game/plies.ts";
import { aiWrites } from "../src/page/talk/writing.ts";

const said = (heard: TalkLine["heard"]): ThreadItem => {
    const line: TalkLine = { who: "player", text: "Why not Nf3?", ply: 4, heard };
    return { who: "player", text: line.text, ply: 4, line };
};

const answer: ThreadItem = { who: "ai", text: "It loses the e-pawn.", ply: 4 };
const inTurn = { asleep: false, inTurn: true };

describe("the AI's bubble that writes", () => {
    it("shows while a chat in its turn has read the player's last line and not answered it, in a terminal or driven by the table", () => {
        expect(aiWrites([answer, said("read")], inTurn)).toBe(true);
        expect(aiWrites([said("read")], { asleep: false, atWork: true })).toBe(true);
    });

    it("waits for the AI to read the line, and leaves once it has answered", () => {
        expect(aiWrites([said("sent")], inTurn)).toBe(false);
        expect(aiWrites([said("answered"), answer], inTurn)).toBe(false);
    });

    it("looks at the player's last line alone, past the AI's words after an earlier one", () => {
        expect(aiWrites([said("read"), answer, said("answered")], inTurn)).toBe(false);
        expect(aiWrites([said("answered"), answer, said("read")], inTurn)).toBe(true);
    });

    it("never shows with the chat out of its turn, with no chat that hears the player, or before the player wrote", () => {
        expect(aiWrites([said("read")], { asleep: false })).toBe(false);
        expect(aiWrites([said("read")], { asleep: true, inTurn: true, atWork: true })).toBe(false);
        expect(aiWrites([answer], inTurn)).toBe(false);
        expect(aiWrites([], inTurn)).toBe(false);
    });
});
