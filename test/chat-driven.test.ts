import { describe, expect, it } from "vitest";
import { settingsFrom } from "../src/page/profile/settings.ts";
import { canStop, drivenAsleep, drivenHosts, type DrivenTable, drivenTitle, failureCodes, failuresSaid, failuresSaidAtLoad, failureToSay, opensInPage, stalledOnMove, workShown } from "../src/page/table/driven.ts";
import { type Text, textFor, withoutTerminal } from "../src/page/text.ts";
import { drivenHost } from "../src/server/driven/hosts.ts";
import { hostNames } from "../src/server/table/hosts/hosts.ts";

const none: DrivenTable = { chat: false };
const driven: DrivenTable = { chat: true, driven: true };
const atWork: DrivenTable = { ...driven, atWork: true };
const inTerminal: DrivenTable = { chat: true };
const failed = { why: "exit code 1", code: "program-ended", number: 2 };
const on = settingsFrom({ chatHost: "claude" });
const off = settingsFrom({ pageChat: false, chatHost: "claude" });
const languages = [textFor(["it"]), textFor(["en"])];
// The words that send the player to the host's own window, in either language.
const terminal = /terminal|finestra dove|window where|\/clear, then|scrivi \/clear|chesspal play|trust|fid/i;

describe("the page with a chat the table drives", () => {
    it("knows as driven the hosts the server drives, each by the server's name for the player, and no other", () => {
        const served = Object.fromEntries(hostNames.flatMap((name) => {
            const host = drivenHost(name);
            return host === undefined ? [] : [[name, host.title]];
        }));
        expect(drivenHosts).toEqual(served);
    });

    it("keeps the switch on until the player turns it off, whatever the old switch, off by default, said", () => {
        expect(settingsFrom({}).pageChat).toBe(true);
        expect(settingsFrom({ pageChat: "no" }).pageChat).toBe(true);
        expect(settingsFrom({ chatInPage: false }).pageChat).toBe(true);
        expect(off.pageChat).toBe(false);
    });

    it("opens the chat in the page in every host the table offers, with the switch on, and never in place of a chat in a terminal", () => {
        for (const host of hostNames) {
            expect(opensInPage(none, on, host)).toBe(true);
            expect(opensInPage(driven, on, host)).toBe(true);
            expect(opensInPage(none, off, host)).toBe(false);
        }

        expect(opensInPage(none, on, "toString")).toBe(false);
        expect(opensInPage(none, off, "claude")).toBe(false);
        expect(opensInPage(inTerminal, on, "claude")).toBe(false);
        expect(opensInPage(none, on, undefined)).toBe(false);
    });

    it("shows the mark that stops the AI while a turn of the chat the table drives runs, whatever it is for", () => {
        expect(canStop(atWork)).toBe(true);
        expect(canStop(driven)).toBe(false);
        expect(canStop({ ...inTerminal, atWork: true })).toBe(false);
        expect(canStop(none)).toBe(false);
        expect(canStop(undefined)).toBe(false);
    });

    it("shows the thought cloud the table tells, and an answer's with a chat at work on anything else, so that the mark never stands alone", () => {
        expect(workShown(atWork, "move")).toBe("move");
        expect(workShown(atWork, undefined)).toBe("answer");
        expect(workShown(driven, undefined)).toBeUndefined();
        expect(workShown(inTerminal, "ponder")).toBe("ponder");
        expect(workShown(undefined, undefined)).toBeUndefined();
    });

    it("says the AI at rest on its move, stopped by the player or with its turns ended without moving, as the table tells every page", () => {
        expect(stalledOnMove({ ...driven, stopped: true }, true)).toBe("stopped");
        expect(stalledOnMove({ ...driven, noMove: true }, true)).toBe("noMove");
        // Stopped on the player's move, or between games, there is nothing the player need do.
        expect(stalledOnMove({ ...driven, stopped: true }, false)).toBeUndefined();
        expect(stalledOnMove({ ...atWork, stopped: true }, true)).toBeUndefined();
        expect(stalledOnMove(driven, true)).toBeUndefined();
        expect(stalledOnMove({ ...inTerminal, stopped: true }, true)).toBeUndefined();
        expect(stalledOnMove(undefined, true)).toBeUndefined();
    });

    it("says the failure of the chat that left the table, and of a turn of the chat still at it, never another chat's nor while one opens", () => {
        expect(failureToSay({ ...none, failed }, 0)).toEqual({ kind: "closed", code: "program-ended", why: failed.why, host: "Claude Code" });
        expect(failureToSay({ ...driven, failed }, 0)).toEqual({ kind: "turn", code: "program-ended", why: failed.why, host: "Claude Code" });
        expect(failureToSay({ ...inTerminal, failed }, 0)).toBeUndefined();
        expect(failureToSay({ ...none, opening: "chat", failed }, 0)).toBeUndefined();
        expect(failureToSay(none, 0)).toBeUndefined();
    });

    it("names the host of the chat that failed, Claude Code where the table told none", () => {
        expect(failureToSay({ ...none, failed: { ...failed, host: "codex" } }, 0)?.host).toBe("Codex");
        expect(failureToSay({ ...driven, failed: { ...failed, host: "claude" } }, 0)?.host).toBe("Claude Code");
        expect(drivenTitle(undefined)).toBe("Claude Code");
        expect(drivenTitle("antigravity")).toBe("Antigravity");
        expect(drivenTitle("opencode")).toBe("OpenCode");
        expect(drivenTitle("gemini")).toBe("Claude Code");
    });

    it("says a failure whose code it does not know, or that has none, as any other", () => {
        expect(failureToSay({ ...none, failed: { ...failed, code: "from-a-newer-table" } }, 0)?.code).toBe("other");
        expect(failureToSay({ ...none, failed: { why: "Something else.", number: 1 } }, 0)?.code).toBe("other");
    });

    it("says each failure once: not the one said or closed, the next one again", () => {
        expect(failureToSay({ ...none, failed }, 2)).toBeUndefined();
        expect(failureToSay({ ...none, failed: { ...failed, number: 3 } }, 2)?.kind).toBe("closed");
    });

    it("takes a failed turn as old news when the page loads, and the failure that left no chat at the table as still to say", () => {
        expect(failuresSaidAtLoad({ ...driven, failed })).toBe(2);
        expect(failuresSaidAtLoad({ ...none, failed })).toBe(0);
        expect(failuresSaidAtLoad(none)).toBe(0);
        expect(failuresSaidAtLoad(undefined)).toBe(0);
    });

    it("forgets the failures said once the table has none, so that a table started again, which counts from one, is heard", () => {
        expect(failuresSaid({ ...none, failed }, 2)).toBe(2);
        expect(failuresSaid(driven, 2)).toBe(0);
        expect(failureToSay({ ...none, failed: { ...failed, number: 1 } }, failuresSaid(none, 2))?.kind).toBe("closed");
    });

    it("offers to start the chat again when it does not listen, in place of sending the player to a window it does not have", () => {
        expect(drivenAsleep(driven, false)).toBe(true);
        expect(drivenAsleep(driven, true)).toBe(false);
        expect(drivenAsleep(driven, undefined)).toBe(false);
        expect(drivenAsleep(inTerminal, false)).toBe(false);
    });

    it("has a line of its own for each failure the table tells apart, of a chat that left and of a turn, naming the host, in both languages", () => {
        for (const text of languages) {
            const { closed, turnFailed } = text.table.inPage;
            expect(Object.keys(closed).sort()).toEqual([...failureCodes].sort());
            expect(Object.keys(turnFailed).sort()).toEqual([...failureCodes].sort());
            expect(new Set(failureCodes.map((code) => closed[code]("Claude Code"))).size).toBe(failureCodes.length);
            expect(closed["not-signed-in"]("Claude Code")).toContain("Claude Code");
            expect(turnFailed["usage-limit"]("Claude", "Claude Code")).toContain("Claude Code");
            // A turn that failed for no reason the player can act on says only to write again.
            expect(turnFailed["program-ended"]("Claude", "Claude Code")).toBe(turnFailed.other("Claude", "Claude Code"));
        }

        expect(languages[0]!.table.inPage.closed["not-signed-in"]("Claude Code")).toBe("Claude Code non è entrato nel tuo account. Apri Claude Code una volta, fuori da Chesspal, ed entra; poi riapri la chat da qui.");
        expect(languages[1]!.table.inPage.closed["usage-limit"]("Claude Code")).toBe("You have reached the usage limit of your Claude Code account: open the chat again later, or choose another.");
    });

    it("never names the terminal, the host's window, /clear to type or chesspal play in the words of a chat in the page, in both languages", () => {
        for (const text of languages) {
            expect(saidInPage(text).filter((words) => terminal.test(words))).toEqual([]);
        }

        // The words they stand in for do, so the test would see one left behind.
        expect(terminal.test(languages[0]!.asleep("Claude"))).toBe(true);
        expect(terminal.test(languages[1]!.table.opening)).toBe(true);
    });

    it("keeps the player on the page where the words sent them to the host's window, and leaves every other word as it is", () => {
        for (const text of languages) {
            const kept = withoutTerminal(text);
            expect(kept.clearChat("Claude")).toBe(text.table.inPage.clearChat("Claude"));
            expect(kept.refused["clear-chat"](0, "Claude")).toBe(text.table.inPage.clearChat("Claude"));
            expect(kept.commandHere("Claude")).toBe(text.table.inPage.commandHere("Claude"));
            expect(kept.offline("Claude")).toBe(text.table.inPage.offline("Claude"));
            expect(kept.refused.illegal(0, "Claude")).toBe(text.refused.illegal(0, "Claude"));
            expect(kept.table).toBe(text.table);
        }
    });

    it("says on the switch that it is experimental, and from the next chat, in both languages: with every host driven, it names none", () => {
        const [italian, english] = languages.map((text) => text.table.inPage);
        expect(italian!.experimental).toBe("Sperimentale");
        expect(italian!.switch).toBe("La chat con l'AI nella pagina, senza terminale");
        expect(italian!.switchNote).toBe("Vale dalla prossima chat.");
        expect(english!.switchNote).toBe("It applies from the next chat.");
        expect(Object.keys(drivenHosts)).toEqual([...hostNames]);

        for (const text of languages) {
            expect(Object.values(drivenHosts).filter((host) => text.table.inPage.switchNote.includes(host))).toEqual([]);
            expect(text.table.inPage.choose("Codex")).toContain("Codex");
            expect(text.table.inPage.reviewChoose("Codex")).toContain("Codex");
        }

        expect(english!.stop("Claude")).toBe("Stop Claude");
        expect(languages[0]!.thinking.answer).toBe("Sta rispondendo");
    });
});

/** Everything the page says of a chat in the page, but the switch's own label, which names what it does without. */
function saidInPage(text: Text): string[]
{
    const { switch: label, closed, turnFailed, noMove, ...words } = text.table.inPage;
    const kept = withoutTerminal(text);
    const said = Object.values(words).map((one) => typeof one === "function" ? one("Claude") : one);
    const failures = failureCodes.flatMap((code) => [closed[code]("Claude Code"), turnFailed[code]("Claude", "Claude Code")]);
    return [...said, ...failures, ...noMove("Claude"), kept.clearChat("Claude"), kept.commandHere("Claude"), kept.offline("Claude"), kept.refused["clear-chat"](0, "Claude")];
}
