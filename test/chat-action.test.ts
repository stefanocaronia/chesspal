import { describe, expect, it } from "vitest";
import { settingsFrom } from "../src/page/profile/settings.ts";
import { chatAction, type ChatTable, firstHost, type HostChoices, offeredHosts } from "../src/page/table/action.ts";
import { textFor } from "../src/page/text.ts";

const claude: HostChoices = { name: "claude", installed: true, models: ["opus", "sonnet"], efforts: ["low", "high"] };
const codex: HostChoices = { name: "codex", installed: true, models: ["gpt-6-luna"], efforts: ["low", "high"] };
const hosts = [claude, codex];
const none: ChatTable = { chat: false, held: false, hosts };
const held: ChatTable = { chat: true, host: "claude", held: true, started: { model: "opus" }, hosts };
const asStarted = settingsFrom({ claudeModel: "opus" });
const italian = textFor(["it"]);
const english = textFor(["en"]);

describe("the chat's window and its one button", () => {
    it("offers the hosts installed, the one at the table selected, else the first", () => {
        expect(offeredHosts({ ...none, hosts: [{ ...claude, installed: false }, codex] }).map((host) => host.name)).toEqual(["codex"]);
        expect(firstHost(none)).toBe("claude");
        expect(firstHost({ ...held, host: "codex" })).toBe("codex");
        expect(firstHost({ ...none, hosts: [] })).toBeUndefined();
    });

    it("opens a chat with none at the table, to review the game when the window opened for it", () => {
        expect(chatAction(none, codex, asStarted, false)).toBe("open");
        expect(chatAction(none, codex, asStarted, true)).toBe("review");
    });

    it("starts the chat held again only when its choices changed, and in another host when that one is selected; else it closes", () => {
        expect(chatAction(held, claude, asStarted, false)).toBe("close");
        expect(chatAction(held, claude, settingsFrom({ claudeModel: "opus", claudeEffort: "high" }), false)).toBe("restart");
        expect(chatAction(held, claude, settingsFrom({}), false)).toBe("restart");
        expect(chatAction(held, codex, asStarted, false)).toBe("switch");
        // A choice the host no longer offers is its own, as the chat started.
        expect(chatAction({ ...held, started: {} }, claude, settingsFrom({ claudeModel: "gone" }), false)).toBe("close");
    });

    it("only closes with a chat opened by hand, while a chat opens or waits to start again, and with no host installed", () => {
        expect(chatAction({ ...held, held: false }, codex, asStarted, false)).toBe("close");
        expect(chatAction({ ...none, opening: "chat" }, claude, asStarted, false)).toBe("close");
        expect(chatAction({ ...held, waiting: "restart" }, codex, asStarted, false)).toBe("close");
        expect(chatAction({ ...none, hosts: [] }, undefined, asStarted, false)).toBe("close");
    });

    it("says on the button what it does, with the host, in both languages", () => {
        expect(italian.table.act.open("Codex")).toBe("Avvia Codex");
        expect(english.table.act.review("Claude Code")).toBe("Review with Claude Code");
        expect(italian.table.act.switch("Codex")).toBe("Passa a Codex");
        expect(english.table.act.restart("Codex")).toBe("Restart Codex");
    });
});
