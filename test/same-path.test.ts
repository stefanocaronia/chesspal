import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { realPath, samePath } from "../src/home/index.ts";
import { pagePorts } from "../src/server/bell/bell.ts";

const root = mkdtempSync(join(tmpdir(), "chesspal-same-path-"));
const folder = join(root, "player");
mkdirSync(folder);
// A junction on Windows, which needs no privilege; a symbolic link elsewhere.
const { link, why } = linked(folder, join(root, "link"));

afterAll(() => rmSync(root, { recursive: true, force: true }));

describe("two names of one folder", () => {
    it.skipIf(link === undefined)(`give one page's ports and are the same folder, through a link or a junction, and so does a folder not made yet below them${why}`, () => {
        expect(pagePorts(link!)).toEqual(pagePorts(folder));
        expect(samePath(link!, folder)).toBe(true);
        expect(samePath(join(link!, "table"), join(folder, "table"))).toBe(true);
        expect(pagePorts(join(link!, "table"))).toEqual(pagePorts(join(folder, "table")));
        expect(realPath(join(link!, "not", "yet"))).toBe(join(realpathSync(folder), "not", "yet"));
    });

    it("are told apart from another folder, made or not", () => {
        const other = join(root, "other");
        mkdirSync(other);

        expect(samePath(other, folder)).toBe(false);
        expect(samePath(join(root, "missing"), folder)).toBe(false);
        expect(samePath(join(root, "missing"), join(root, "missing", "."))).toBe(true);
    });

    it("keep the ports a folder with no link had before, its path as written, so that a page and a hook of the older version still find each other", () => {
        const plain = realpathSync(folder);
        const written = process.platform === "win32" ? plain.toUpperCase() : plain;
        const before = createHash("sha256").update(resolve(written).toLowerCase()).digest()[0]! % 10;

        const shift = Number(process.env.CHESSPAL_PORT_SHIFT ?? 0);

        expect(realPath(written)).toBe(resolve(written));
        expect(pagePorts(written)).toEqual([5870, 6870, 7870].map((base) => base + shift + before));
    });
});

/** A link to `target` at `path`; none, and why, where the system does not let a test make one. */
function linked(target: string, path: string): { link?: string; why: string; }
{
    try {
        symlinkSync(target, path, process.platform === "win32" ? "junction" : "dir");
        return { link: path, why: "" };
    } catch (error) {
        return { why: ` (skipped: this system makes no link here, ${(error as Error).message})` };
    }
}
