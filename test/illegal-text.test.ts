import { describe, expect, expectTypeOf, it } from "vitest";
import type { IllegalReason } from "../src/core/index.ts";
import { type ServerRefusal, textFor } from "../src/page/text.ts";
import type { Refused } from "../src/server/page.ts";

// Every reason, by a record the compiler checks against the type: a reason added to the core and not here fails the types.
const reasons: Record<IllegalReason, true> = {
    "own": true,
    "shape": true,
    "blocked": true,
    "pawn-straight": true,
    "pawn-double": true,
    "pawn-diagonal": true,
    "en-passant-late": true,
    "check": true,
    "pinned": true,
    "attacked": true,
    "castle-lost": true,
    "castle-rook-gone": true,
    "castle-blocked": true,
    "castle-check": true,
    "castle-through": true,
};

describe("the page's words for a refusal", () => {
    it("knows every refusal the server sends, and only those", () => {
        expectTypeOf<NonNullable<Refused["refusal"]>>().toEqualTypeOf<ServerRefusal>();
    });

    it("says every reason a move is refused in both languages, naming the piece that forbids it", () => {
        for (const language of ["en", "it"]) {
            const text = textFor([language]);

            for (const reason of Object.keys(reasons) as IllegalReason[]) {
                for (const piece of ["K", "Q", "R", "B", "N", "P"] as const) {
                    const words = text.illegal({ reason, piece, to: "f1", takes: false, by: { letter: "K", side: "black", square: "e8" }, at: "f1" });

                    expect(words.trim(), `${language} ${reason} ${piece}`).not.toBe("");
                    expect(words, `${language} ${reason} ${piece}`).not.toMatch(/undefined|\$\{|  /);
                }
            }
        }
    });

    it("says every refusal of the server in both languages", () => {
        const refusals: Record<ServerRefusal, true> = {
            "no-game": true,
            "ai-to-move": true,
            "illegal": true,
            "clear-chat": true,
            "words-empty": true,
            "words-spent": true,
            "words-long": true,
            "words-longer-than-left": true,
            "draw-offered": true,
            "draw-none": true,
            "draw-early": true,
            "profile-game": true,
            "game-going": true,
            "pgn-unreadable": true,
        };

        for (const language of ["en", "it"]) {
            for (const refusal of Object.keys(refusals) as ServerRefusal[]) {
                expect(textFor([language]).refused[refusal](40, "Codex").trim(), `${language} ${refusal}`).not.toBe("");
            }
        }
    });
});
