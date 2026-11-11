import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { Context } from "../src/commands/context.ts";
import { commands } from "../src/commands/index.ts";
import { positionIn, refuseOtherGame, refuseUnseenPosition } from "../src/commands/play-move.ts";
import * as page from "../src/page/profile/profile.ts";
import { readFrontMatter, writeFrontMatter } from "../src/profiles/front-matter.ts";
import {
    activateProfile,
    activeProfile,
    createProfile,
    drawnAvatars,
    ensureProfile,
    gameFolder,
    imageTypeOf,
    levels,
    listProfiles,
    nameLimit,
    ownImage,
    ownImageStamp,
    profileFolder,
    profileSettings,
    ratingSites,
    saveOwnImage,
    saveProfileSettings,
    sentImageLimit,
    settingsOf,
    speeds,
    updateProfile,
} from "../src/profiles/index.ts";
import { testContext } from "./commands.ts";

const folders: string[] = [];

afterEach(() => {
    for (const folder of folders.splice(0)) {
        rmSync(folder, { recursive: true, force: true });
    }
});

const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16]);
const webp = new Uint8Array([0x52, 0x49, 0x46, 0x46, 4, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);

describe("the profiles (D-23)", () => {
    it("are always there: the first made by Chesspal, named after the account, new until the player completes it, game and all (D-71)", () => {
        const root = playerFolder();

        expect(() => gameFolder(root)).toThrow(`There is no profile in ${join(root, "profiles")}: run any Chesspal command, and it makes one.`);

        ensureProfile(root, "Stéfano Caronia");
        ensureProfile(root, "Someone else");

        expect(listProfiles(root)).toEqual([{ id: "stefano-caronia", name: "Stéfano Caronia", new: true }]);
        expect(readFileSync(join(gameFolder(root), "profile.md"), "utf8")).toBe('---\nname: "Stéfano Caronia"\nnew: "true"\n---\n');

        writeFileSync(join(gameFolder(root), "game.json"), "{}");
        const stefano = createProfile(root, { name: "Stefano", level: "regular", avatar: "owl" });

        // Completed, its folder takes the player's name, with the game.
        expect(stefano).toEqual({ id: "stefano", name: "Stefano", level: "regular", avatar: "owl" });
        expect(gameFolder(root)).toBe(profileFolder(root, "stefano"));
        expect(readFileSync(join(gameFolder(root), "game.json"), "utf8")).toBe("{}");
        expect(JSON.parse(readFileSync(join(root, "profiles", "active.json"), "utf8"))).toEqual({ profile: "stefano" });

        // Another profile starts with no games, and is put in use.
        const anna = createProfile(root, { name: "Anna" });

        expect(gameFolder(root)).toBe(profileFolder(root, anna.id));
        expect(existsSync(join(gameFolder(root), "game.json"))).toBe(false);
        expect(listProfiles(root).map(({ id }) => id)).toEqual(["anna", "stefano"]);
    });

    it("keep the account's folder when the player's name gives the same or none, and take a free one when the name's is taken (D-71)", () => {
        const same = playerFolder();
        ensureProfile(same, "Anna");

        expect(createProfile(same, { name: "ANNA" }).id).toBe("anna");

        const numbered = playerFolder();
        ensureProfile(numbered, "con");

        expect(createProfile(numbered, { name: "Con" }).id).toBe("con-2");

        const symbols = playerFolder();
        ensureProfile(symbols, "stefa");

        expect(createProfile(symbols, { name: "♞♞" })).toEqual({ id: "stefa", name: "♞♞" });

        const taken = playerFolder();
        ensureProfile(taken, "stefa");
        // A folder made by hand, with no profile.md: a profile all the same.
        mkdirSync(profileFolder(taken, "anna"));
        activateProfile(taken, "stefa");

        expect(createProfile(taken, { name: "Anna" }).id).toBe("anna-2");
        expect(listProfiles(taken).map(({ id }) => id)).toEqual(["anna", "anna-2"]);
    });

    it("move the folder back when the profile renamed cannot be put in use, and keep it new (D-71)", () => {
        const root = playerFolder();
        ensureProfile(root, "stefa");
        // The file active.json is written through a folder: the profile is renamed, and cannot be put in use.
        mkdirSync(join(root, "profiles", `active.json.${process.pid}.tmp`));

        expect(() => createProfile(root, { name: "Anna" })).toThrow();
        expect(existsSync(profileFolder(root, "anna"))).toBe(false);
        expect(listProfiles(root).find(({ id }) => id === "stefa")).toEqual({ id: "stefa", name: "stefa", new: true });
    });

    it("leave nothing half made behind when one cannot be put in use, and keep the others", () => {
        const root = playerFolder();
        createProfile(root, { name: "Anna" });
        // active.json a folder: the next profile is written, and cannot be put in use.
        rmSync(join(root, "profiles", "active.json"));
        mkdirSync(join(root, "profiles", "active.json"));

        expect(() => createProfile(root, { name: "Bruno" })).toThrow();
        expect(existsSync(profileFolder(root, "bruno"))).toBe(false);
        expect(readFileSync(join(profileFolder(root, "anna"), "profile.md"), "utf8")).toContain('name: "Anna"');
    });

    it("name their folders from the name: free, plain, never one Windows keeps", () => {
        const root = playerFolder();

        expect(createProfile(root, { name: "Anna" }).id).toBe("anna");
        expect(createProfile(root, { name: "anna" }).id).toBe("anna-2");
        expect(createProfile(root, { name: "Con" }).id).toBe("con-2");
        expect(createProfile(root, { name: "♞♞" }).id).toBe("player");
        expect(createProfile(root, { name: "../../etc" }).id).toBe("etc");
    });

    it("put one in use by its id, and fall back on the first when the one named is gone", () => {
        const root = playerFolder();
        createProfile(root, { name: "Anna" });
        createProfile(root, { name: "Bruno" });

        expect(activeProfile(root).id).toBe("bruno");
        expect(activateProfile(root, "anna").name).toBe("Anna");
        expect(() => activateProfile(root, "../anna")).toThrow("There is no profile ../anna: the profiles are anna, bruno.");

        rmSync(profileFolder(root, "anna"), { recursive: true });

        expect(activeProfile(root).id).toBe("bruno");

        // A file is no profile, even when active.json names it.
        writeFileSync(profileFolder(root, "ghost"), "");
        writeFileSync(join(root, "profiles", "active.json"), '{"profile":"ghost"}');

        expect(activeProfile(root).id).toBe("bruno");
    });

    it("read a profile.md written by hand, leaving out what they do not know, a rating typed there too, and keep its other fields and text when they change it", () => {
        const root = playerFolder();
        mkdirSync(profileFolder(root, "lia"), { recursive: true });
        writeFileSync(join(profileFolder(root, "lia"), "profile.md"), "---\nname: Lia\nlevel: master\nrating: 1800\nsite: fide\nclub: 'Scacchi Roma'\n---\nMy notes.\n");

        expect(listProfiles(root)).toEqual([{ id: "lia", name: "Lia" }]);

        updateProfile(root, "lia", { avatar: "cat" });

        expect(readFileSync(join(profileFolder(root, "lia"), "profile.md"), "utf8")).toBe(
            '---\nname: "Lia"\nlevel: "master"\nrating: "1800"\nsite: "fide"\nclub: "Scacchi Roma"\navatar: "cat"\n---\nMy notes.\n',
        );
    });

    it("read the player's names on Lichess and chess.com, written by hand, and keep them when the profile changes (D-93)", () => {
        const root = playerFolder();
        mkdirSync(profileFolder(root, "lia"), { recursive: true });
        writeFileSync(join(profileFolder(root, "lia"), "profile.md"), "---\nname: Lia\nlichess: ' lia_k '\nchesscom: ''\n---\n");

        expect(listProfiles(root)).toEqual([{ id: "lia", name: "Lia", accounts: { lichess: "lia_k" } }]);

        updateProfile(root, "lia", { avatar: "cat" });
        expect(listProfiles(root)[0]?.accounts).toEqual({ lichess: "lia_k" });
    });

    it("read a profile.md as an editor may save it: a byte-order mark, capitals, a name too long", () => {
        const root = playerFolder();
        mkdirSync(profileFolder(root, "lia"), { recursive: true });
        writeFileSync(join(profileFolder(root, "lia"), "profile.md"), `\uFEFF---\r\nname: ${"Lia".repeat(20)}\r\nlevel: Regular\r\nlichess: Lia_K\r\n---\r\n`);

        expect(listProfiles(root)).toEqual([{ id: "lia", name: "Lia".repeat(20).slice(0, nameLimit), level: "regular", accounts: { lichess: "Lia_K" } }]);
    });

    it("write a front matter that reads back any name", () => {
        const fields = { name: 'Anna: "la regina"\n', rating: 1450, level: undefined };

        expect(readFrontMatter(writeFrontMatter(fields, "Text.")).fields).toEqual({ name: 'Anna: "la regina"\n', rating: "1450" });
        expect(readFrontMatter("No front matter.")).toEqual({ fields: {}, body: "No front matter." });
    });

    it("keep the page's settings in the profile, as an object of text, numbers and flags", () => {
        const root = playerFolder();
        const { id } = createProfile(root, { name: "Anna" });

        expect(profileSettings(root, id)).toBeUndefined();

        saveProfileSettings(root, id, { theme: "dark", dots: false });

        expect(profileSettings(root, id)).toEqual({ theme: "dark", dots: false });
        expect(settingsOf([1, 2])).toBeUndefined();
        expect(settingsOf({ theme: { nested: true } })).toBeUndefined();
        expect(settingsOf({ theme: "x".repeat(65) })).toBeUndefined();
    });
});

describe("the player's own image (D-45)", () => {
    it("tells a PNG, a JPEG and a WebP by their first bytes, never by their name", () => {
        expect([png, jpeg, webp].map(imageTypeOf)).toEqual(["png", "jpg", "webp"]);
        expect(imageTypeOf(new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'/>"))).toBeUndefined();
    });

    it("saves the one sent in place of any other, and refuses what is no image or too large", () => {
        const root = playerFolder();
        const { id } = createProfile(root, { name: "Anna" });
        writeFileSync(join(profileFolder(root, id), "avatar.jpg"), jpeg);

        expect(ownImage(root, id)?.type).toBe("jpg");

        saveOwnImage(root, id, webp);

        expect(ownImage(root, id)).toMatchObject({ type: "webp", bytes: Buffer.from(webp) });
        expect(existsSync(join(profileFolder(root, id), "avatar.jpg"))).toBe(false);
        expect(() => saveOwnImage(root, id, new TextEncoder().encode("<svg/>"))).toThrow("The picture must be a PNG, JPEG or WebP image.");
        const large = new Uint8Array(sentImageLimit + 1);
        large.set(jpeg);
        expect(() => saveOwnImage(root, id, large)).toThrow("KB at most");
    });

    it("shows an image put in the folder by hand, under any of its names, but not a file that is no image", () => {
        const root = playerFolder();
        const { id } = createProfile(root, { name: "Anna" });
        writeFileSync(join(profileFolder(root, id), "avatar.png"), "not an image");

        expect(ownImageStamp(root, id)).toBeUndefined();

        writeFileSync(join(profileFolder(root, id), "avatar.jpeg"), jpeg);

        expect(ownImageStamp(root, id)).toMatch(/^\d+-6$/);
    });
});

describe("the profiles' commands", () => {
    it("complete the profile Chesspal made, list it, and tell the AI who plays in status and new_game only once completed (D-71)", async () => {
        const context = contextIn(playerFolder());

        expect(await run(context, "profiles")).toBe("* player: Player");
        expect(await run(context, "status")).toContain(`Folder: ${profileFolder(context.folder, "player")}\nNo game.`);
        expect(await run(context, "new_profile", { name: "Anna", level: "regular" })).toBe("Profile anna made, and in use: Anna, plays often.");
        expect(await run(context, "status")).toContain(`Folder: ${profileFolder(context.folder, "anna")}\nPlayer: Anna, plays often.\nNo game.`);
        expect(await run(context, "new_game", { ai_colour: "black" })).toMatch(/^New game: you play Black, the player White, at the club level \(board and tactical facts: no position\)\.\nPlayer: Anna, plays often\.\n/);
        expect(existsSync(join(profileFolder(context.folder, "anna"), "game.json"))).toBe(true);
    });

    it("let a chat play on when the wizard renames the folder under the game it saw (D-71)", async () => {
        const context = contextIn(playerFolder());
        await run(context, "new_game", { ai_colour: "black" });
        const chat: Context = { ...context, positionSeen: positionIn(gameFolder(context.folder)) };
        await run(context, "new_profile", { name: "Anna" });

        expect(gameFolder(context.folder)).toBe(profileFolder(context.folder, "anna"));
        expect(() => refuseUnseenPosition(chat, gameFolder(context.folder))).not.toThrow();
        expect(() => refuseOtherGame(chat, gameFolder(context.folder))).not.toThrow();
    });

    it("refuse to change profile while a game goes on in the one in use, but add a player who waits, and complete the one Chesspal made with its game", async () => {
        const context = contextIn(playerFolder());
        await run(context, "new_game", { ai_colour: "black" });
        await run(context, "new_profile", { name: "Anna" });

        expect(await run(context, "status")).toContain("Game: you play Black");
        expect(await run(context, "new_profile", { name: "Bruno" })).toBe("Profile bruno made, not in use: Bruno.");
        expect(activeProfile(context.folder).id).toBe("anna");

        await run(context, "end_game", { result: "player_resigns" });
        expect(await run(context, "new_profile", { name: "Carla", use: false })).toBe("Profile carla made, not in use: Carla.");
        expect(await run(context, "use_profile", { profile: "bruno" })).toBe("Profile bruno in use: Bruno.");
        await run(context, "new_game", { ai_colour: "white" });

        await expect(run(context, "use_profile", { profile: "anna" })).rejects.toThrow("A game is going on in this profile");
        expect(await run(context, "use_profile", { profile: "bruno" })).toBe("Profile bruno in use: Bruno.");
        expect(await run(context, "profiles")).toBe("  anna: Anna\n* bruno: Bruno\n  carla: Carla");
    });

    it("set the picture: a drawn avatar in place of the player's image, or their image from a file", async () => {
        const context = contextIn(playerFolder());
        await run(context, "new_profile", { name: "Anna" });
        writeFileSync(join(context.folder, "me.png"), png);

        expect(await run(context, "set_avatar", { avatar: "me.png" })).toBe("The picture of anna is me.png.");
        expect(ownImage(context.folder, "anna")?.type).toBe("png");

        await run(context, "set_avatar", { avatar: "owl" });

        expect(ownImage(context.folder, "anna")).toBeUndefined();
        expect(activeProfile(context.folder).avatar).toBe("owl");
        await expect(run(context, "set_avatar", { avatar: "missing.png" })).rejects.toThrow("cannot be read");
    });

    it("edit the names on Lichess and chess.com: each one given written, the other kept, an empty one removed, the rest of profile.md as it was", async () => {
        const context = contextIn(playerFolder());
        await run(context, "new_profile", { name: "Anna", level: "regular" });
        const file = join(profileFolder(context.folder, "anna"), "profile.md");
        writeFileSync(file, readFileSync(file, "utf8").replace("---\n", "---\nclub: Roma\n") + "My notes.\n");

        expect(await run(context, "edit_profile", { lichess: " anna_k ", chesscom: "AnnaK" })).toBe("Profile anna: Anna, plays often; anna_k on Lichess and AnnaK on Chess.com.");
        expect(await run(context, "edit_profile", { chesscom: "" })).toBe("Profile anna: Anna, plays often; anna_k on Lichess.");
        expect(activeProfile(context.folder)).toMatchObject({ name: "Anna", level: "regular", accounts: { lichess: "anna_k" } });
        expect(readFileSync(file, "utf8")).toMatch(/club: "?Roma"?\n[\s\S]*---\nMy notes\.\n$/);

        await expect(run(context, "edit_profile", { lichess: "anna k" })).rejects.toThrow("only letters, digits, underscores and hyphens");
        expect(await run(context, "edit_profile", { lichess: "" })).toBe("Profile anna: Anna, plays often; on neither Lichess nor Chess.com.");
        expect(activeProfile(context.folder).accounts).toBeUndefined();
    });

    it("edit the name and how the player plays, in a game too: the profile keeps its folder, its game and its place in use (D-106)", async () => {
        const context = contextIn(playerFolder());
        await run(context, "new_profile", { name: "Anna", level: "regular" });
        await run(context, "new_game", { ai_colour: "black" });

        expect(await run(context, "edit_profile", { name: " Anna Rossi ", level: "tournament" })).toBe("Profile anna: Anna Rossi, plays tournaments; on neither Lichess nor Chess.com.");
        expect(activeProfile(context.folder)).toMatchObject({ id: "anna", name: "Anna Rossi", level: "tournament" });
        expect(gameFolder(context.folder)).toBe(profileFolder(context.folder, "anna"));
        expect(await run(context, "status")).toContain("Player: Anna Rossi, plays tournaments.\nGame: you play Black");

        expect(await run(context, "edit_profile", { level: "" })).toBe("Profile anna: Anna Rossi; on neither Lichess nor Chess.com.");
        await expect(run(context, "edit_profile", { name: "  " })).rejects.toThrow();
        expect(activeProfile(context.folder).name).toBe("Anna Rossi");
    });

    it("leave the profile Chesspal made to the wizard when its name is edited (D-71)", async () => {
        const context = contextIn(playerFolder());
        await run(context, "edit_profile", { name: "Anna" });

        expect(activeProfile(context.folder)).toEqual({ id: "player", name: "Anna", new: true });
        expect(await run(context, "status")).not.toContain("Player:");
    });
});

describe("the profiles on the page", () => {
    it("offer the choices the server takes", () => {
        expect(page.levels).toEqual(levels);
        expect(page.ratingSites).toEqual(ratingSites);
        expect(page.speeds).toEqual(speeds);
        expect(page.avatarIds).toEqual(drawnAvatars);
        expect(page.nameLimit).toBe(nameLimit);
    });
});

function playerFolder(): string
{
    const folder = mkdtempSync(join(tmpdir(), "chesspal-profiles-"));
    folders.push(folder);
    return folder;
}

function contextIn(folder: string): Context
{
    return testContext(folder);
}

async function run(context: Context, name: string, input: Record<string, unknown> = {}): Promise<string>
{
    const command = commands.find((candidate) => candidate.name === name)!;
    return command.format(await command.run(command.input.parse(input), context));
}
