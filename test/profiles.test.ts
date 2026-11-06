import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { Context } from "../src/commands/context.ts";
import { commands } from "../src/commands/index.ts";
import * as page from "../src/page/profile.ts";
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
    ratingLimits,
    ratingSites,
    saveOwnImage,
    saveProfileSettings,
    sentImageLimit,
    settingsOf,
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
        const stefano = createProfile(root, { name: "Stefano", level: "regular", rating: { value: 1450, site: "lichess" }, avatar: "owl" });

        expect(stefano).toEqual({ id: "stefano-caronia", name: "Stefano", level: "regular", rating: { value: 1450, site: "lichess" }, avatar: "owl" });
        expect(readFileSync(join(gameFolder(root), "game.json"), "utf8")).toBe("{}");

        // Another profile starts with no games, and is put in use.
        const anna = createProfile(root, { name: "Anna" });

        expect(gameFolder(root)).toBe(profileFolder(root, anna.id));
        expect(existsSync(join(gameFolder(root), "game.json"))).toBe(false);
        expect(listProfiles(root).map(({ id }) => id)).toEqual(["anna", "stefano-caronia"]);
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

    it("read a profile.md written by hand, leaving out what they do not know, and keep its other fields and text when they change it", () => {
        const root = playerFolder();
        mkdirSync(profileFolder(root, "lia"), { recursive: true });
        writeFileSync(join(profileFolder(root, "lia"), "profile.md"), "---\nname: Lia\nlevel: master\nrating: 99999\nsite: lichess\nclub: 'Scacchi Roma'\n---\nMy notes.\n");

        expect(listProfiles(root)).toEqual([{ id: "lia", name: "Lia" }]);

        updateProfile(root, "lia", { avatar: "cat", rating: { value: 1800, site: "fide" } });

        expect(readFileSync(join(profileFolder(root, "lia"), "profile.md"), "utf8")).toBe(
            '---\nname: "Lia"\nlevel: "master"\nrating: 1800\nsite: "fide"\nclub: "Scacchi Roma"\navatar: "cat"\n---\nMy notes.\n',
        );
    });

    it("read a profile.md as an editor may save it: a byte-order mark, capitals, a name too long", () => {
        const root = playerFolder();
        mkdirSync(profileFolder(root, "lia"), { recursive: true });
        writeFileSync(join(profileFolder(root, "lia"), "profile.md"), `\uFEFF---\r\nname: ${"Lia".repeat(20)}\r\nlevel: Regular\r\nrating: 1500\r\nsite: Lichess\r\n---\r\n`);

        expect(listProfiles(root)).toEqual([{ id: "lia", name: "Lia".repeat(20).slice(0, nameLimit), level: "regular", rating: { value: 1500, site: "lichess" } }]);
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
        expect(await run(context, "new_profile", { name: "Anna", level: "regular", rating: 1450, site: "lichess" })).toBe(
            "Profile player made, and in use: Anna, plays often, Lichess 1450.",
        );
        expect(await run(context, "status")).toContain(`Folder: ${profileFolder(context.folder, "player")}\nPlayer: Anna, plays often, Lichess 1450.\nNo game.`);
        expect(await run(context, "new_game", { ai_colour: "black" })).toMatch(/^New game: you play Black, the player White, at the club level \(board and tactical facts: no position\)\.\nPlayer: Anna, plays often, Lichess 1450\.\n/);
        expect(existsSync(join(profileFolder(context.folder, "player"), "game.json"))).toBe(true);
        await expect(run(context, "new_profile", { name: "Bruno", rating: 1450 })).rejects.toThrow("Give the rating and its site together");
    });

    it("refuse to change profile while a game goes on in the one in use, but complete the one Chesspal made with its game", async () => {
        const context = contextIn(playerFolder());
        await run(context, "new_game", { ai_colour: "black" });
        await run(context, "new_profile", { name: "Anna" });

        expect(await run(context, "status")).toContain("Game: you play Black");
        await expect(run(context, "new_profile", { name: "Bruno" })).rejects.toThrow("A game is going on in this profile");

        await run(context, "end_game", { result: "player_resigns" });
        await run(context, "new_profile", { name: "Bruno" });
        await run(context, "new_game", { ai_colour: "white" });

        await expect(run(context, "use_profile", { profile: "player" })).rejects.toThrow("A game is going on in this profile");
        expect(await run(context, "use_profile", { profile: "bruno" })).toBe("Profile bruno in use: Bruno.");
        expect(await run(context, "profiles")).toBe("* bruno: Bruno\n  player: Anna");
    });

    it("set the picture: a drawn avatar in place of the player's image, or their image from a file", async () => {
        const context = contextIn(playerFolder());
        await run(context, "new_profile", { name: "Anna" });
        writeFileSync(join(context.folder, "me.png"), png);

        expect(await run(context, "set_avatar", { avatar: "me.png" })).toBe("The picture of player is me.png.");
        expect(ownImage(context.folder, "player")?.type).toBe("png");

        await run(context, "set_avatar", { avatar: "owl" });

        expect(ownImage(context.folder, "player")).toBeUndefined();
        expect(activeProfile(context.folder).avatar).toBe("owl");
        await expect(run(context, "set_avatar", { avatar: "missing.png" })).rejects.toThrow("cannot be read");
    });
});

describe("the profiles on the page", () => {
    it("offer the choices the server takes", () => {
        expect(page.levels).toEqual(levels);
        expect(page.ratingSites).toEqual(ratingSites);
        expect(page.avatarIds).toEqual(drawnAvatars);
        expect(page.ratingLimits).toEqual(ratingLimits);
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
