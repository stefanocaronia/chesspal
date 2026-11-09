import { describe, expect, it } from "vitest";
import { searched } from "../src/page/dialogs/search.ts";

const games = [
    "Stefano – Opus 5.5 · xhigh, Sicilian Defense: Modern Variations",
    "lesfrondes – Sebysa13, Caro-Kann Defense: Endgame Variation",
    "Sebysa13 – lesfrondes, Sicilian Defense: Najdorf Variation",
    "Claude – Stefano, Italian Game: Two Knights Defense",
];

const find = (query: string): readonly string[] => searched(games, query, (game) => game);

describe("the search of the analyses", () => {
    it("finds any of the words, those matching more of them first, in their order otherwise", () => {
        expect(find("Sebysa13 Siciliana")).toEqual([games[2], games[0], games[1]]);
        expect(find("")).toEqual(games);
        expect(find("  ")).toEqual(games);
    });

    it("ignores case and accents, finds a part of a word or a longer form of one", () => {
        expect(find("NAJD")).toEqual([games[2]]);
        expect(find("italiana")).toEqual([games[3]]);
        expect(find("opus 5.5")).toEqual([games[0]]);
        expect(find("Défense")).toHaveLength(4);
        expect(find("Sicilianissima")).toEqual([]);
        expect(find("chess")).toEqual([]);
    });
});
