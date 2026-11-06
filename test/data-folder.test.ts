import { describe, expect, it } from "vitest";
import { dataFolder, type System } from "../src/home/index.ts";

const registryAnswer = "\r\nHKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\User Shell Folders\r\n    Personal    REG_EXPAND_SZ    %USERPROFILE%\\OneDrive\\Documenti\r\n\r\n";

describe("the data folder (D-71)", () => {
    it("is Documents\\My Games\\Chesspal on Windows, where the registry puts Documents, OneDrive too, with its variables in any case", () => {
        expect(dataFolder(windows(registryAnswer))).toBe("C:\\Users\\anna\\OneDrive\\Documenti\\My Games\\Chesspal");
        expect(dataFolder(windows(registryAnswer.replace("%USERPROFILE%", "%UserProfile%")))).toBe("C:\\Users\\anna\\OneDrive\\Documenti\\My Games\\Chesspal");
        expect(dataFolder(windows("    Personal    REG_SZ    D:\\Docs\r\n"))).toBe("D:\\Docs\\My Games\\Chesspal");
    });

    it("falls back to the user's own Documents when the registry says nothing usable", () => {
        const fallback = "C:\\Users\\anna\\Documents\\My Games\\Chesspal";

        expect(dataFolder(windows(undefined))).toBe(fallback);
        expect(dataFolder(windows("    Personal    REG_EXPAND_SZ    %NOWHERE%\\Documents\r\n"))).toBe(fallback);
        expect(dataFolder(windows("    Personal    REG_SZ    Documents\r\n"))).toBe(fallback);
        expect(dataFolder(windows("    Personal    REG_SZ    C:\\Users\\Niccol\uFFFD\\Documenti\r\n"))).toBe(fallback);
        expect(dataFolder({ ...windows(undefined), env: {} })).toBe("C:\\Users\\anna-home\\Documents\\My Games\\Chesspal");
    });

    it("is Documents/Chesspal on Linux, where the XDG user dirs put Documents in the system's language, without asking any registry", () => {
        const userDirs = '# written by xdg-user-dirs-update\nXDG_DESKTOP_DIR="$HOME/Scrivania"\nXDG_DOCUMENTS_DIR="$HOME/Documenti"\n';

        expect(dataFolder(linux({ "/home/anna/.config/user-dirs.dirs": userDirs }))).toBe("/home/anna/Documenti/Chesspal");
        expect(dataFolder(linux({ "/home/anna/.config/user-dirs.dirs": 'XDG_DOCUMENTS_DIR="/data/docs/"' }))).toBe("/data/docs/Chesspal");
        expect(dataFolder({ ...linux({ "/etc/anna/user-dirs.dirs": userDirs }), env: { XDG_CONFIG_HOME: "/etc/anna" } })).toBe("/home/anna/Documenti/Chesspal");
    });

    it("falls back to ~/Documents on Linux when the XDG user dirs say nothing usable", () => {
        expect(dataFolder(linux({}))).toBe("/home/anna/Documents/Chesspal");
        expect(dataFolder(linux({ "/home/anna/.config/user-dirs.dirs": 'XDG_DOCUMENTS_DIR="Documenti"' }))).toBe("/home/anna/Documents/Chesspal");
        expect(dataFolder(linux({ "/home/anna/.config/user-dirs.dirs": 'XDG_MUSIC_DIR="$HOME/Musica"' }))).toBe("/home/anna/Documents/Chesspal");
    });

    it("is ~/Documents/Chesspal on macOS, whose Documents has that name on disk in every language", () => {
        expect(dataFolder({ ...linux({ "/Users/anna/.config/user-dirs.dirs": 'XDG_DOCUMENTS_DIR="$HOME/Other"' }), platform: "darwin", home: "/Users/anna" })).toBe(
            "/Users/anna/Documents/Chesspal",
        );
    });

    it("is CHESSPAL_HOME when set, for the tests and the playtests", () => {
        expect(dataFolder({ ...windows(registryAnswer), env: { CHESSPAL_HOME: "  D:\\runs\\chesspal  " } })).toBe("D:\\runs\\chesspal");
        expect(dataFolder({ ...linux({}), env: { CHESSPAL_HOME: "/tmp/chesspal" } })).toBe("/tmp/chesspal");
        expect(dataFolder({ ...linux({}), env: { CHESSPAL_HOME: " " } })).toBe("/home/anna/Documents/Chesspal");
    });
});

function windows(registry: string | undefined): System
{
    return { env: { USERPROFILE: "C:\\Users\\anna" }, platform: "win32", home: "C:\\Users\\anna-home", registry: () => registry, readText: nowhere };
}

/** A Linux with these files, and no registry to ask. */
function linux(files: Readonly<Record<string, string>>): System
{
    const registry = (): string => {
        throw new Error("no registry here");
    };

    return { env: {}, platform: "linux", home: "/home/anna", registry, readText: (path) => files[path] };
}

function nowhere(path: string): never
{
    throw new Error(`${path}: Windows reads no file for Documents`);
}
