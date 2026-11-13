import { describe, expect, it } from "vitest";
import { settingsFrom } from "../src/page/profile/settings.ts";
import { canAct, chatAction, type ChatTable, chosen, firstHost, type HostChoices, offeredHosts, startedWith } from "../src/page/table/action.ts";
import { textFor } from "../src/page/text.ts";

const claude: HostChoices = { name: "claude", installed: true, models: ["opus", "sonnet"], efforts: ["low", "medium", "high"], model: "sonnet", effort: "medium" };
const codex: HostChoices = { name: "codex", installed: true, models: ["gpt-6-luna"], efforts: ["low", "medium"], model: "gpt-6-luna", effort: "medium" };
const hosts = [claude, codex];
const none: ChatTable = { chat: false, held: false, hosts };
const held: ChatTable = { chat: true, host: "claude", held: true, started: { model: "opus", effort: "medium" }, hosts };
const nothing = settingsFrom({});
const italian = textFor(["it"]);
const english = textFor(["en"]);

describe("the chat's window and its one button", () => {
    it("offers the hosts installed, the one at the table selected, else the last the button used, else the first", () => {
        expect(offeredHosts({ ...none, hosts: [{ ...claude, installed: false }, codex] }).map((host) => host.name)).toEqual(["codex"]);
        expect(firstHost(none, nothing)).toBe("claude");
        expect(firstHost(none, settingsFrom({ chatHost: "codex" }))).toBe("codex");
        expect(firstHost({ ...held, host: "codex" }, settingsFrom({ chatHost: "claude" }))).toBe("codex");
        // The last host used, no longer installed: the first offered.
        expect(firstHost({ ...none, hosts: [claude, { ...codex, installed: false }] }, settingsFrom({ chatHost: "codex" }))).toBe("claude");
        expect(firstHost({ ...none, hosts: [] }, nothing)).toBeUndefined();
    });

    it("chooses the host's middle model and effort until the player chooses, and for a choice it no longer offers", () => {
        expect(chosen(claude, "model", nothing)).toBe("sonnet");
        expect(chosen(claude, "effort", nothing)).toBe("medium");
        expect(chosen(claude, "model", settingsFrom({ claudeModel: "opus" }))).toBe("opus");
        expect(chosen(claude, "model", settingsFrom({ claudeModel: "gone" }))).toBe("sonnet");
        expect(startedWith(held, claude, "model")).toBe("opus");
        expect(startedWith({ ...held, started: {} }, claude, "effort")).toBe("medium");
    });

    it("opens a chat with none at the table, to review the game when the window opened for it", () => {
        expect(chatAction(none, codex, false)).toBe("open");
        expect(chatAction(none, codex, true)).toBe("review");
    });

    it("starts the chat held again, changed or not, and in another host when that one is selected", () => {
        expect(chatAction(held, claude, false)).toBe("restart");
        expect(chatAction(held, codex, false)).toBe("switch");
        expect(canAct(held)).toBe(true);
    });

    it("keeps its action, disabled, with a chat opened by hand and while a chat opens or waits; none with no host installed", () => {
        expect(chatAction({ ...held, held: false }, codex, false)).toBe("switch");
        expect(canAct({ ...held, held: false })).toBe(false);
        expect(chatAction({ ...none, opening: "chat" }, claude, false)).toBe("open");
        expect(canAct({ ...none, opening: "chat" })).toBe(false);
        expect(canAct({ ...held, waiting: "restart" })).toBe(false);
        expect(chatAction({ ...none, hosts: [] }, undefined, false)).toBeUndefined();
    });

    it("says on the button what it does, with the host, in both languages", () => {
        expect(italian.table.act.open("Codex")).toBe("Avvia Codex");
        expect(english.table.act.review("Claude Code")).toBe("Review with Claude Code");
        expect(italian.table.act.switch("Codex")).toBe("Passa a Codex");
        expect(english.table.act.restart("Codex")).toBe("Restart Codex");
    });
});
