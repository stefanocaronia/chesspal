// The checks every driver of a chat passes, whatever its host: declared once, run for each driver on its own recorded flows.
import { describe, expect, it } from "vitest";
import type { HostChat, HostEvent } from "../../src/hosts/index.ts";
import { listen, turnEnds } from "./fake-host.ts";

/**
 * What a flow shows: the AI's prose ("prose"); tools of the chesspal server the chat does not allow, asked and refused ("refused");
 * a turn the player stops ("interrupt"); a chat taken up again ("resumed").
 */
export type Scenario = "prose" | "refused" | "interrupt" | "resumed";

/** A chat opened on a scenario's flow, with what the flow expects of it. */
export interface Opened
{
    chat: HostChat;
    /** The fake host's record: the lines the driver wrote, what it did that the flow does not hold, and whether the whole flow was played. */
    host: { written: unknown[]; problems: string[]; done(): boolean; };
    /** The player's words, turn by turn, and the AI's whole blocks of text in each. */
    turns: string[];
    texts: string[][];
    /** The session taken up, in "resumed"; the turn stopped, in "interrupt". */
    session?: string;
    interruptTurn?: number;
}

export interface ChecklistDriver
{
    host: string;
    open(scenario: Scenario): Opened;
    /** Whether a line the driver wrote asks the host for the model, or carries the player's words. */
    isModelRequest(line: unknown): boolean;
    isPlayerWords(line: unknown): boolean;
}

/** Declares the checklist's tests for a driver. */
export function checklist(driver: ChecklistDriver): void
{
    describe(`the chat in ${driver.host}: the checklist of every host`, () => {
        it("tells a turn of prose in pieces that join into the whole text", async () => {
            const opened = driver.open("prose");
            const { events, until } = listen(opened.chat);
            opened.chat.send(opened.turns[0]!);
            await until((all) => turnEnds(all).length === 1);
            const texts = events.filter((event) => event.type === "text");
            expect(joinBlocks(texts)).toEqual(opened.texts[0]);
            expect(texts.length).toBeGreaterThan(opened.texts[0]!.length);
            expect(turnEnds(events)).toEqual([{ type: "turnEnd", reason: "done" }]);
            expect(opened.host.problems).toEqual([]);
        });

        it("tells tools and permissions with their kinds", async () => {
            const opened = driver.open("refused");
            const { events, until } = listen(opened.chat);
            await playTurns(opened, until, opened.turns.length);
            const permissions = events.filter((event) => event.type === "permission");
            const chesspalTools = events.filter((event) => event.type === "tool").filter((event) => event.kind === "chesspal");
            expect(permissions.length).toBeGreaterThan(0);
            expect(permissions.every((event) => event.kind === "chesspal" && !event.allowed)).toBe(true);
            expect(chesspalTools.filter((event) => event.state === "started").length).toBe(permissions.length);
            expect(chesspalTools.filter((event) => event.state === "failed").length).toBe(permissions.length);
            expect(events.filter((event) => event.type === "tool").every((event) => !event.name.startsWith("mcp__"))).toBe(true);
            expect(opened.host.done()).toBe(true);
            expect(opened.host.problems).toEqual([]);
        });

        it("ends a turn stopped by interrupt() as interrupted", async () => {
            const opened = driver.open("interrupt");
            const turn = opened.interruptTurn ?? 0;
            const { events, until } = listen(opened.chat);
            await playTurns(opened, until, turn);
            const before = events.length;
            opened.chat.send(opened.turns[turn]!);
            await until((all) => all.slice(before).some((event) => event.type === "text"));
            opened.chat.interrupt();
            await until((all) => turnEnds(all).length === turn + 1);
            expect(turnEnds(events).at(-1)).toEqual({ type: "turnEnd", reason: "interrupted" });
            expect(opened.host.problems).toEqual([]);
        });

        it("takes a chat up again in its session", async () => {
            const opened = driver.open("resumed");
            const { events, until } = listen(opened.chat);
            opened.chat.send(opened.turns[0]!);
            await until((all) => turnEnds(all).length === 1);
            expect(events.find((event) => event.type === "session")).toMatchObject({ session: opened.session });
            expect(turnEnds(events)).toEqual([{ type: "turnEnd", reason: "done" }]);
            expect(opened.host.problems).toEqual([]);
        });

        it("has the model asked, and confirmed, before it writes the player's words", async () => {
            const opened = driver.open("prose");
            const { until } = listen(opened.chat);
            opened.chat.send(opened.turns[0]!);
            expect(opened.host.written.some(driver.isPlayerWords)).toBe(false);
            await until((all) => turnEnds(all).length === 1);
            const asked = opened.host.written.findIndex(driver.isModelRequest);
            const words = opened.host.written.findIndex(driver.isPlayerWords);
            expect(asked).toBeGreaterThanOrEqual(0);
            expect(words).toBeGreaterThan(asked);
            expect(opened.host.problems).toEqual([]);
        });
    });
}

/** Plays the first `count` turns of a flow to their ends. */
async function playTurns(opened: Opened, until: (condition: (events: HostEvent[]) => boolean) => Promise<void>, count: number): Promise<void>
{
    for (let turn = 0; turn < count; turn++) {
        expect(opened.chat.send(opened.turns[turn]!)).toBe(true);
        await until((all) => turnEnds(all).length === turn + 1);
    }
}

/** The text of each block, its pieces joined. */
function joinBlocks(texts: HostEvent[]): string[]
{
    const blocks: string[] = [];

    for (const event of texts) {
        if (event.type === "text") {
            blocks[event.block] = (blocks[event.block] ?? "") + event.text;
        }
    }

    return blocks;
}
