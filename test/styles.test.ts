import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const page = fileURLToPath(new URL("../src/page/", import.meta.url));

describe("the page's style sheets", () => {
    // No other check reads the CSS, and a rule pasted inside another never applies: the page nests no rules, so one inside another is a slip.
    it("open no rule inside another and close every block", () => {
        const sheets = readdirSync(page, { recursive: true, encoding: "utf8" }).filter((name) => name.endsWith(".css"));

        expect(sheets.length).toBeGreaterThan(0);
        expect(sheets.flatMap((name) => faultsIn(name, readFileSync(`${page}${name}`, "utf8")))).toEqual([]);
    });

    it("finds a rule inside another, a brace too many and a block left open", () => {
        expect(faultsIn("a.css", ".one {\n    top: 0;\n.two {\n    left: 0;\n}\n}\n")).toEqual(['a.css:3: the rule ".two" is inside the rule ".one"']);
        expect(faultsIn("b.css", ".one {\n}\n}\n")).toEqual(["b.css:3: a closing brace too many"]);
        expect(faultsIn("c.css", "@media (pointer: coarse) {\n    .one {\n        top: 0;\n    }\n")).toEqual(["c.css: 1 block never closed"]);
        expect(faultsIn("d.css", "/* a { */\n@media (pointer: coarse) {\n    .one {\n        top: 0;\n    }\n}\n")).toEqual([]);
    });
});

/** What is wrong with a sheet's blocks, each with the sheet's name and its line: a style rule opened inside another, which an at-rule may hold, and braces that do not pair. */
function faultsIn(name: string, sheet: string): string[]
{
    // The comments are blanked, their lines kept, so that a brace in one counts for nothing.
    const css = sheet.replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, " "));
    const lineOf = (at: number): number => css.slice(0, at).split("\n").length;
    const open: { prelude: string; atRule: boolean; }[] = [];
    const faults: string[] = [];
    let start = 0;

    for (let at = 0; at < css.length; at++) {
        const character = css[at];

        if (character === "{") {
            const prelude = css.slice(start, at).trim();
            const atRule = prelude.startsWith("@");
            const parent = open.at(-1);

            if (parent !== undefined && !parent.atRule && !atRule) {
                faults.push(`${name}:${lineOf(at)}: the rule "${prelude}" is inside the rule "${parent.prelude}"`);
            }

            open.push({ prelude, atRule });
        } else if (character === "}" && open.pop() === undefined) {
            faults.push(`${name}:${lineOf(at)}: a closing brace too many`);
        }

        if (character === "{" || character === "}" || character === ";") {
            start = at + 1;
        }
    }

    return open.length === 0 ? faults : [...faults, `${name}: ${open.length} block${open.length === 1 ? "" : "s"} never closed`];
}
