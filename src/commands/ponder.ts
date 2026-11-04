import { z } from "zod";
import { Game, levelOf, sees } from "../core/index.ts";
import { type CurrentGame, currentPlan, endOf, keepThought, talkLimits, type Thought, thoughtKey } from "../games/index.ts";
import { gameFolder } from "../profiles/index.ts";
import { sentence } from "./ai-move.ts";
import { gameAt } from "./clock.ts";
import { type GameSummary, positionLines, summaryOf } from "./game-summary.ts";
import { levelText } from "./levels.ts";
import { defineCommand } from "./registry.ts";
import { say as sayWords } from "./say.ts";
import { boardView, colourName, compactView } from "./view.ts";

/** What ponder answers: stop, the position to think on, the position after a reply, the thoughts kept, or still the player's move. */
type Pondered =
    | { stop: true; }
    | { start: Start; }
    | { after: GameSummary; position: number; reply: string; }
    | { kept: readonly Thought[]; position: number; }
    | { waiting: number; }
    | { said: number; };

/** The position the player is to move in, as the AI thinks on it. */
interface Start
{
    position: number;
    line: string;
    plan?: string;
    talk: string[];
}

/**
 * The AI's thinking on the player's time (D-72), for the agent that does it: the position, the view after a reply, its answer kept for its move, and its
 * words on the board page. Its calls are not the chat's: the doorbell still wakes the chat for the player's move.
 */
export const ponder = defineCommand({
    name: "ponder",
    description: "For the chesspal-ponder agents only, while the player is to move: ponder {} gives the position to think on; ponder {position, reply} the "
        + "position after a likely reply, as you will see it; ponder {position, reply, move, why} keeps your answer to it, which you are given when they play it; "
        + 'ponder {position, say} says a word on the board page; ponder {position, done: true} waits for their move. Whenever it says stop, stop. Example: ponder {position: 24, reply: "Nxe5", move: "d6", why: "The knight has to go back."}.',
    input: z.object({
        position: z.int().min(0).optional().describe("the position's number, as ponder {} gives it"),
        reply: z.string().min(1).optional().describe("a move the player may play, in SAN (Nxe5) or as squares (f3e5)"),
        move: z.string().min(1).optional().describe("your answer to that reply, in SAN or as squares"),
        why: sentence(200).optional().describe("why, in one sentence: kept for you, hidden from the player"),
        say: z.string().trim().min(1).max(talkLimits.ai).optional().describe(
            "your words for the player on the board page, once, in one short sentence: pieces and moves in words, never in notation; never your plans or threats",
        ),
        done: z.boolean().optional().describe("true when you have no more replies to think on: it waits for the player's move"),
    }),
    byAgent: true,
    run: async ({ position, reply, move, why, say, done = false }, context): Promise<Pondered> => {
        const folder = gameFolder(context.folder);
        const current = toPonder(folder, context.now(), position);

        if (current === undefined) {
            return { stop: true };
        }

        if (position === undefined) {
            if (reply !== undefined || move !== undefined || why !== undefined || say !== undefined || done) {
                throw new Error("Give the position's number with it: call ponder {} first, which gives it. Nothing changed.");
            }

            return { start: startOf(current) };
        }

        if (say !== undefined) {
            sayWords(folder, "ai", say, context.now());
            return { said: position };
        }

        if (done) {
            return await waitForMove(folder, context, position);
        }

        if (reply === undefined) {
            throw new Error(`Name a reply of the player's: ponder {position: ${position}, reply}, or ponder {position: ${position}, done: true} when you have no more. Nothing changed.`);
        }

        const after = new Game(current.game.record);
        const played = after.play(reply);

        if (!played.played) {
            throw new Error(`${played.message} The player's legal moves: ${played.legal.join(" ")}. Nothing changed.`);
        }

        if (move === undefined) {
            return { after: summaryOf({ game: after, ai: current.ai, started: current.started, talk: [] }, context.now()), position, reply: played.move.san };
        }

        if (why === undefined) {
            throw new Error(`Say why in one sentence: ponder {position: ${position}, reply, move, why}. Nothing changed.`);
        }

        const answer = after.play(move);

        if (!answer.played) {
            throw new Error(`${answer.message} Your legal moves after ${played.move.san}: ${answer.legal.join(" ")}. Nothing changed.`);
        }

        return { kept: keepThought(folder, thoughtKey(current), { reply: played.move.san, move: answer.move.san, why }), position };
    },
    format: (pondered) => {
        if ("stop" in pondered) {
            return "Stop now: the player has moved, or the game is over. End with one word.";
        }

        if ("start" in pondered) {
            return startLines(pondered.start).join("\n");
        }

        if ("after" in pondered) {
            const { after, position, reply } = pondered;
            return [`If the player plays ${reply}:`, ...positionLines(after), `Keep your answer: ponder {position: ${position}, reply: "${reply}", move, why}.`].join("\n");
        }

        if ("kept" in pondered) {
            const replies = pondered.kept.map((thought) => thought.reply).join(", ");
            return `Kept: your answers to ${replies}. Think on another likely reply, or call ponder {position: ${pondered.position}, done: true} when you have no more.`;
        }

        if ("said" in pondered) {
            return "Said on the board page, where the player reads it.";
        }

        return `Still the player's move: think on another likely reply, or call ponder {position: ${pondered.waiting}, done: true} again.`;
    },
});

/** How long ponder waits for the player's move at most, under the minute a host may give a tool (Priya, T-109), and how often it looks. */
export const ponderWait = { most: 50_000, every: 500 } as const;

/** The game whose position the AI thinks on: none once the player has moved, the game is over, or the position given is another. */
function toPonder(folder: string, now: Date, position: number | undefined): CurrentGame | undefined
{
    const current = gameAt(folder, now);

    if (current === undefined || endOf(current.game) !== undefined || current.game.position.turn === current.ai) {
        return undefined;
    }

    return position === undefined || position === current.game.record.moves.length ? current : undefined;
}

/** Waits for the player's move: stop once they have moved, else still their move after a while. */
async function waitForMove(folder: string, context: { now: () => Date; pause?: (milliseconds: number) => Promise<void>; }, position: number): Promise<Pondered>
{
    const pause = context.pause ?? ((milliseconds: number) => new Promise<void>((done) => setTimeout(done, milliseconds)));
    const start = context.now().getTime();

    while (context.now().getTime() - start < ponderWait.most) {
        await pause(ponderWait.every);

        if (toPonder(folder, context.now(), position) === undefined) {
            return { stop: true };
        }
    }

    return { waiting: position };
}

function startOf(current: CurrentGame): Start
{
    const { game, ai, talk } = current;
    const level = levelOf(game.record);
    const plan = currentPlan(game.record);
    const player = game.position.turn;
    const line = [
        `Position ${game.record.moves.length}: the player (${colourName(player)}) to move, move ${game.position.moveNumber}; you play ${colourName(ai)} ${levelText(level)}.`,
        `FEN: ${game.position.fen}`,
        ...(sees(level, "tactics") ? compactView : boardView)(game.facts, player),
    ].join("\n");
    const said = talk.slice(-3).map((spoken) => `${spoken.who === "ai" ? "You" : "Player"}: «${spoken.text.replace(/\s+/g, " ")}»`);
    return { position: game.record.moves.length, line, ...(plan === undefined ? {} : { plan }), talk: said };
}

function startLines({ position, line, plan, talk }: Start): string[]
{
    return [
        line,
        ...(plan === undefined ? [] : [`Your plan: ${plan}`]),
        ...(talk.length === 0 ? [] : ["Last words on the board page:", ...talk]),
        `For each reply you think likely, ponder {position: ${position}, reply} shows the position after it, then ponder {position: ${position}, reply, move, why} keeps `
        + `your answer; ponder {position: ${position}, done: true} when you have no more.`,
    ];
}
