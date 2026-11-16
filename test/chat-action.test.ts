import { describe, expect, it } from "vitest";
import { settingsFrom } from "../src/page/profile/settings.ts";
import { canAct, chatAction, type ChatTable, chosen, firstHost, holdsChoice, type HostChoices, offeredHosts, startedWith, withStartedChoice } from "../src/page/table/action.ts";
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
        expect(chatAction(none, codex, false, nothing)).toBe("open");
        expect(chatAction(none, codex, true, nothing)).toBe("review");
    });

    it("starts the chat held again, changed or not, and in another host when that one is selected", () => {
        expect(chatAction(held, claude, false, nothing)).toBe("restart");
        expect(chatAction(held, codex, false, nothing)).toBe("switch");
        expect(canAct(held)).toBe(true);
    });

    it("keeps the chat held to review a game when its host, model and effort are the ones it started with, else starts it again", () => {
        const asStarted = settingsFrom({ claudeModel: "opus", claudeEffort: "medium" });
        expect(chatAction(held, claude, true, asStarted)).toBe("keep");
        expect(chatAction(held, claude, true, settingsFrom({ claudeModel: "sonnet", claudeEffort: "medium" }))).toBe("restart");
        expect(chatAction(held, claude, true, settingsFrom({ claudeModel: "opus", claudeEffort: "high" }))).toBe("restart");
        expect(chatAction(held, codex, true, asStarted)).toBe("switch");
        expect(chatAction(held, claude, false, asStarted)).toBe("restart");
        expect(chatAction({ ...held, held: false }, claude, true, asStarted)).toBe("restart");
    });

    it("lets the page ask who reviews a game only of a chat it holds and can start again now", () => {
        expect(holdsChoice(held)).toBe(true);
        expect(holdsChoice({ ...held, held: false })).toBe(false);
        expect(holdsChoice({ ...held, opening: "restart" })).toBe(false);
        expect(holdsChoice({ ...held, waiting: "restart" })).toBe(false);
        expect(holdsChoice(none)).toBe(false);
    });

    it("opens the window on the chat held as it started: its host, model and effort", () => {
        const opened = withStartedChoice(held, settingsFrom({ chatHost: "codex", claudeModel: "sonnet", claudeEffort: "high" }));
        expect(opened).toMatchObject({ chatHost: "claude", claudeModel: "opus", claudeEffort: "medium" });
        expect(chatAction(held, claude, true, opened)).toBe("keep");
        expect(withStartedChoice(none, nothing)).toBe(nothing);
        expect(withStartedChoice({ ...held, held: false }, nothing)).toBe(nothing);
        expect(withStartedChoice({ ...held, hosts: [codex] }, nothing)).toBe(nothing);
    });

    it("keeps its action, disabled, with a chat opened by hand and while a chat opens or waits; none with no host installed", () => {
        expect(chatAction({ ...held, held: false }, codex, false, nothing)).toBe("switch");
        expect(canAct({ ...held, held: false })).toBe(false);
        expect(chatAction({ ...none, opening: "chat" }, claude, false, nothing)).toBe("open");
        expect(canAct({ ...none, opening: "chat" })).toBe(false);
        expect(canAct({ ...held, waiting: "restart" })).toBe(false);
        expect(chatAction({ ...none, hosts: [] }, undefined, false, nothing)).toBeUndefined();
    });

    it("says on the button what it does, with the host, in both languages", () => {
        expect(italian.table.act.open("Codex")).toBe("Avvia Codex");
        expect(english.table.act.review("Claude Code")).toBe("Review with Claude Code");
        expect(italian.table.act.switch("Codex")).toBe("Passa a Codex");
        expect(english.table.act.restart("Codex")).toBe("Restart Codex");
        expect(italian.table.act.keep("Claude Code")).toBe("Analizza con Claude Code");
    });
});
