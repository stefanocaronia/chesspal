import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { anchorOf, markdownBlocks } from "../src/page/guide/blocks.ts";

describe("the guide", () => {
    it("has the same parts in Italian and English, how it works first, so that a link finds its heading in both", () => {
        const parts = headings("en").filter((heading) => heading.level === 2);

        expect(headings("it").map((heading) => heading.level)).toEqual(headings("en").map((heading) => heading.level));
        expect(parts).toHaveLength(8);
        expect(parts[0]?.text).toBe("How it works");
    });

    it("links only to its own headings, by their English anchors, and to pages of the web", () => {
        const anchors = new Set(headings("en").map((heading) => anchorOf(heading.text)));

        for (const language of languages) {
            for (const [, target = ""] of guide(language).matchAll(/\]\(([^)\s]+)\)/g)) {
                expect(target.startsWith("#") ? anchors.has(target.slice(1)) : target.startsWith("https://"), `${language}: ${target}`).toBe(true);
            }
        }
    });

    it("reads its markdown into blocks: headings, a table, lists and paragraphs, its comments left out", () => {
        const text = "# Title\n\n<!-- a note -->\n## Part\n\n| Who | What |\n|---|---|\n| **You** | move |\n\n1. one\n2. two\n   more\n\n- a\n\nwords\non two lines";

        expect(markdownBlocks(text)).toEqual([
            { kind: "heading", level: 1, text: "Title" },
            { kind: "heading", level: 2, text: "Part" },
            { kind: "table", head: ["Who", "What"], rows: [["**You**", "move"]] },
            { kind: "list", ordered: true, items: ["one", "two more"] },
            { kind: "list", ordered: false, items: ["a"] },
            { kind: "paragraph", text: "words on two lines" },
        ]);
        expect(anchorOf("Players and profile")).toBe("players-and-profile");
    });
});

const languages = ["it", "en"] as const;

function guide(language: string): string
{
    return readFileSync(new URL(`../src/page/guide/${language}.md`, import.meta.url), "utf8");
}

function headings(language: string): { level: number; text: string; }[]
{
    return markdownBlocks(guide(language)).flatMap((block) => (block.kind === "heading" ? [block] : []));
}
