import { describe, expect, it } from "vitest";
import { settingsFrom } from "../src/page/profile/settings.ts";
import { canStop, drivenAsleep, type DrivenTable, failuresSaid, failuresSaidAtLoad, failureToSay, opensDriven, opensInPage, stoppedOnMove } from "../src/page/table/driven.ts";
import { type Text, textFor, withoutTerminal } from "../src/page/text.ts";

const none: DrivenTable = { chat: false };
const driven: DrivenTable = { chat: true, driven: true };
const inTerminal: DrivenTable = { chat: true };
const failed = { why: "the host's program ended (exit code 1)", number: 2 };
const on = settingsFrom({ chatInPage: true, chatHost: "claude" });
const off = settingsFrom({ chatHost: "claude" });
const languages = [textFor(["it"]), textFor(["en"])];
// The words that send the player to the host's own window, in either language.
const terminal = /terminal|finestra dove|window where|\/clear, then|scrivi \/clear|chesspal play|trust|fid/i;

describe("the page with a chat the table drives", () => {
    it("keeps the switch off until the player turns it on", () => {
        expect(settingsFrom({}).chatInPage).toBe(false);
        expect(settingsFrom({ chatInPage: "yes" }).chatInPage).toBe(false);
        expect(on.chatInPage).toBe(true);
    });

    it("opens the chat in the page for Claude Code alone, with the switch on, and never in place of a chat in a terminal", () => {
        expect(opensInPage(none, on, "claude")).toBe(true);
        expect(opensInPage(driven, on, "claude")).toBe(true);
        expect(opensInPage(none, on, "codex")).toBe(false);
        expect(opensInPage(none, off, "claude")).toBe(false);
        expect(opensInPage(inTerminal, on, "claude")).toBe(false);
        expect(opensInPage(none, on, undefined)).toBe(false);
    });

    it("takes the chat opening for one in the page by the switch and the host the window last opened, until the table says", () => {
        expect(opensDriven({ ...none, opening: "chat" }, on)).toBe(true);
        expect(opensDriven({ ...none, opening: "chat" }, off)).toBe(false);
        expect(opensDriven({ ...none, opening: "chat" }, settingsFrom({ chatInPage: true, chatHost: "codex" }))).toBe(false);
        expect(opensDriven(none, on)).toBe(false);
    });

    it("shows the mark that stops the AI only with a chat the table drives, while the AI thinks on its move", () => {
        expect(canStop(driven, "move")).toBe(true);
        expect(canStop(driven, undefined)).toBe(false);
        expect(canStop(driven, "ponder")).toBe(false);
        expect(canStop(inTerminal, "move")).toBe(false);
        expect(canStop(none, "move")).toBe(false);
        expect(canStop(undefined, "move")).toBe(false);
    });

    it("says the player stopped the AI at the position they did, while it is still to move there and thinks no more", () => {
        expect(stoppedOnMove("game 3", "game 3", true, undefined)).toBe(true);
        expect(stoppedOnMove("game 3", "game 3", true, "move")).toBe(false);
        expect(stoppedOnMove("game 3", "game 4", true, undefined)).toBe(false);
        expect(stoppedOnMove("game 3", "game 3", false, undefined)).toBe(false);
        expect(stoppedOnMove(undefined, "game 3", true, undefined)).toBe(false);
    });

    it("says the failure of the chat that left the table, and of a turn of the chat still at it, never another chat's nor while one opens", () => {
        expect(failureToSay({ ...none, failed }, 0)).toEqual({ kind: "closed", why: failed.why });
        expect(failureToSay({ ...driven, failed }, 0)).toEqual({ kind: "turn", why: failed.why });
        expect(failureToSay({ ...inTerminal, failed }, 0)).toBeUndefined();
        expect(failureToSay({ ...none, opening: "chat", failed }, 0)).toBeUndefined();
        expect(failureToSay(none, 0)).toBeUndefined();
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

    it("says on the switch that it is experimental, for Claude Code, and from the next chat, in both languages", () => {
        const [italian, english] = languages.map((text) => text.table.inPage);
        expect(italian!.experimental).toBe("Sperimentale");
        expect(italian!.switch).toBe("La chat con l'AI nella pagina, senza terminale");
        expect(italian!.switchNote).toBe("Per ora solo con Claude Code. Vale dalla prossima chat.");
        expect(english!.switchNote).toBe("Only with Claude Code for now. It applies from the next chat.");
        expect(english!.stop("Claude")).toBe("Stop Claude");
    });
});

/** Everything the page says of a chat in the page, but the switch's own label, which names what it does without. */
function saidInPage(text: Text): string[]
{
    const { switch: label, ...words } = text.table.inPage;
    const kept = withoutTerminal(text);
    const said = Object.values(words).map((one) => typeof one === "function" ? one("Claude") : one);
    return [...said, kept.clearChat("Claude"), kept.commandHere("Claude"), kept.offline("Claude"), kept.refused["clear-chat"](0, "Claude")];
}
