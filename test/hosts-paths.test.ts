import { describe, expect, it } from "vitest";
import { inside } from "../src/hosts/paths.ts";

describe("a path held to the chat's folder", () => {
    it.runIf(process.platform === "win32")("takes a path written as a URL's, with a slash before the drive, as the path after it", () => {
        expect(inside("/F:/games/chat/notes/opening.md", "F:/games/chat")).toBe(true);
        expect(inside("\\F:\\games\\chat\\notes", "F:/games/chat")).toBe(true);
        expect(inside("/F:/games/other/secret.md", "F:/games/chat")).toBe(false);
        expect(inside("/C:/Users/player/.ssh/id_rsa", "F:/games/chat")).toBe(false);
        expect(inside("/F:/games/chat/../other/secret.md", "F:/games/chat")).toBe(false);
    });

    it("keeps out a path of the home and one that climbs out", () => {
        expect(inside("~/notes.md", process.cwd())).toBe(false);
        expect(inside("../outside.md", process.cwd())).toBe(false);
        expect(inside("notes/page.md", process.cwd())).toBe(true);
    });

    it("reads a path on Windows whatever the platform it runs on: its drive, its backslashes, a slash before the drive, any case", () => {
        expect(inside("C:\\Windows\\win.ini", "F:\\games\\chat", "win32")).toBe(false);
        expect(inside("f:\\GAMES\\Chat\\notes.md", "F:\\games\\chat", "win32")).toBe(true);
        expect(inside("notes\\page.md", "F:\\games\\chat", "win32")).toBe(true);
        expect(inside("/F:/games/chat/notes.md", "F:\\games\\chat", "win32")).toBe(true);
        expect(inside("/F:/games/other/notes.md", "F:\\games\\chat", "win32")).toBe(false);
        expect(inside("\\\\server\\share\\notes.md", "F:\\games\\chat", "win32")).toBe(false);
    });

    it("keeps out, off Windows, a path written the Windows way: a drive, a leading \\\\, any backslash", () => {
        for (const platform of ["linux", "darwin"]) {
            for (const path of ["C:\\Windows\\win.ini", "C:/Windows/win.ini", "c:notes.md", "\\\\server\\share\\notes.md", "notes\\page.md", "/F:/games/chat/notes.md"]) {
                expect(inside(path, "/games/chat", platform), `${platform} ${path}`).toBe(false);
            }

            expect(inside("notes/page.md", "/games/chat", platform)).toBe(true);
            expect(inside("/games/chat/notes/page.md", "/games/chat", platform)).toBe(true);
            expect(inside("/games/other/page.md", "/games/chat", platform)).toBe(false);
            expect(inside("/games/Chat/page.md", "/games/chat", platform)).toBe(false);
        }
    });
});
