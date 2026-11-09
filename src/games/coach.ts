// What the coach writes during a game with the helps on (D-88): its judgments of the player's moves, its hint for their turn and who it sees ahead (D-90),
// in coach.json beside game.json, where no command of the opponent's reads them; the judgments and the leads go into the game's PGN once it is over.
import { readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { type Badge, badges, type DrawColour, type DrawnArrow, type DrawnSquare, Game, type GameRecord, type Lead, leadOf, leadText, readLead, type RecordedMove, reviewed, reviewOf, withLead } from "../core/index.ts";
import type { CurrentGame } from "./current-game.ts";
import { writeAtomically } from "./files.ts";

/** The coach's word on a move of the player's: the move by the plies up to it, its badge and note, and the moves of theirs its note names. */
export interface CoachJudgment
{
    readonly ply: number;
    readonly badge?: Badge;
    readonly note?: string;
    /** The moves in SAN its note names that the player could play: the page shows it only once none is legal on their turn (Anatolij). */
    readonly held?: string[];
    /** Only as shown, never kept: a held note the player's last move let go, which the card shows now (Zoe). */
    readonly released?: true;
}

/** The coach's hint for the player's turn, for the position it was given in, with what it draws on the board to show it. */
export interface CoachHint
{
    readonly position: number;
    readonly text: string;
    readonly arrows?: DrawnArrow[];
    readonly squares?: DrawnSquare[];
}

/** Who the coach sees ahead in a position the player was to move in (D-90), by the plies up to it. */
export interface CoachLead
{
    readonly position: number;
    readonly lead: Lead;
}

/** What the coach wrote in a game. */
export interface CoachWords
{
    readonly judgments: readonly CoachJudgment[];
    readonly hint?: CoachHint;
    readonly leads?: readonly CoachLead[];
}

/** What the coach wrote in the game going on: nothing when the file is another game's, or missing. */
export function coachWords(folder: string, current: CurrentGame): CoachWords
{
    const { judgments, hint, leads = [] } = keptFor(folder, current);
    const read = leads.flatMap(({ position, lead }) => {
        const known = readLead(lead);
        return known === undefined ? [] : [{ position, lead: known }];
    });
    return { judgments, ...(hint === undefined ? {} : { hint }), ...(read.length === 0 ? {} : { leads: read }) };
}

/** Keeps the coach's word on a move of the player's, in place of one it wrote on the same move. */
export function keepJudgment(folder: string, current: CurrentGame, judgment: CoachJudgment): void
{
    const kept = keptFor(folder, current);
    const judgments = [...kept.judgments.filter((one) => one.ply !== judgment.ply), judgment].sort((one, other) => one.ply - other.ply);
    write(folder, { ...kept, judgments });
}

/** Keeps the coach's hint for the player's turn, in place of the one before. */
export function keepHint(folder: string, current: CurrentGame, hint: CoachHint): void
{
    write(folder, { ...keptFor(folder, current), hint });
}

/** Keeps who the coach sees ahead in a position, in place of what it said there before. */
export function keepLead(folder: string, current: CurrentGame, { position, lead }: CoachLead): void
{
    const kept = keptFor(folder, current);
    const leads = [...(kept.leads ?? []).filter((one) => one.position !== position), { position, lead: leadText(lead) }].sort((one, other) => one.position - other.position);
    write(folder, { ...kept, leads });
}

/** Since when the coach has waited for the player's move in a position: the first time it asked, `now` then. */
export function coachWaitingSince(folder: string, current: CurrentGame, position: number, now: Date): Date
{
    const kept = keptFor(folder, current);

    if (kept.waiting?.position === position) {
        return new Date(kept.waiting.since);
    }

    write(folder, { ...kept, waiting: { position, since: now.toISOString() } });
    return now;
}

/** Whether a coach has started on the game as it is now: until one has, the chat is told again to start it (Priya). */
export function coachStarted(folder: string, current: CurrentGame): boolean
{
    return keptFor(folder, current).begun === current.game.record.moves.length;
}

/** Notes that a coach starts on the game as it is now: true for the first, false for another the chat started on it too, which stops. */
export function startCoach(folder: string, current: CurrentGame): boolean
{
    const kept = keptFor(folder, current);
    const plies = current.game.record.moves.length;

    if (kept.begun === plies) {
        return false;
    }

    write(folder, { ...kept, begun: plies });
    return true;
}

/** Forgets the coach's words on the game over, when its review is deleted (D-92): they would go back into its PGN. */
export function forgetCoach(folder: string): void
{
    rmSync(join(folder, fileName), { force: true });
}

/**
 * What the player may see of it in the game as it is: the judgments but those that name a move the player may play, held while the opponent is to move
 * too (Anatolij), and the hint only in its own position. A held one that the last pair of moves let go is marked, for the card to show it
 * now, however far back its move (Zoe).
 */
export function coachShown({ judgments, hint, leads = [] }: CoachWords, { game, ai }: CurrentGame): CoachWords
{
    const plies = game.record.moves.length;
    const legal = game.position.turn === ai ? undefined : legalMoves(game);
    const shown = judgments.filter(({ held }) => held === undefined || (legal !== undefined && !names(held, legal)));
    const before = legal === undefined || plies < 2 || shown.every(({ held }) => held === undefined)
        ? undefined
        : legalMoves(new Game({ tags: game.record.tags, moves: game.record.moves.slice(0, plies - 2) }));
    const marked = before === undefined ? shown : shown.map((judgment) => judgment.held !== undefined && names(judgment.held, before) ? { ...judgment, released: true as const } : judgment);
    return { judgments: marked, ...(hint === undefined || hint.position !== plies ? {} : { hint }), ...(leads.length === 0 ? {} : { leads }) };
}

/**
 * The record with the coach's judgments in the comments of the moves they judge, as the analyst writes its own: for the game over. A move the analyst has
 * reviewed already keeps its review (Federico); the book's badge alone is no review, and stays under a note alone, as annotate_game keeps it.
 */
export function withCoach(record: GameRecord, { judgments, leads = [] }: CoachWords): GameRecord
{
    if (judgments.length === 0 && leads.length === 0) {
        return record;
    }

    const moves = record.moves.map((move, index) => {
        const judgment = judgments.find((one) => one.ply === index + 1);
        const review = reviewOf(move.comment);

        if (judgment === undefined || (review !== undefined && (review.badge !== "book" || review.note !== undefined))) {
            return move;
        }

        const badge = judgment.badge ?? review?.badge;
        return reviewed(move, { ...(badge === undefined ? {} : { badge }), ...(judgment.note === undefined ? {} : { note: judgment.note }) });
    });
    return { ...record, moves: withLeads(moves, leads) };
}

/** The moves with who the coach saw ahead after each (D-90), where nobody has said it there since: on the move that led to the position it was given in. */
function withLeads(moves: readonly RecordedMove[], leads: readonly CoachLead[]): RecordedMove[]
{
    return moves.map((move, index) => {
        const lead = leads.find((one) => one.position === index + 1)?.lead;
        return lead === undefined || leadOf(move.comment) !== undefined ? move : withLead(move, lead);
    });
}

/** The legal moves in a position, without their checks. */
function legalMoves(game: Game): Set<string>
{
    return new Set(game.legalMoves().map((move) => withoutCheck(move.san)));
}

/** Whether a note's moves name one of the legal moves. */
function names(held: readonly string[], legal: ReadonlySet<string>): boolean
{
    return held.some((san) => legal.has(withoutCheck(san)));
}

/** A move in SAN without its check or mate, which the position it is played in decides: Qxf7# then is Qxf7+ now. */
function withoutCheck(san: string): string
{
    return san.replace(/[+#]$/, "");
}

const fileName = "coach.json";
const colours: [DrawColour, ...DrawColour[]] = ["green", "red", "yellow", "blue"];

const coachFile = z.object({
    started: z.string(),
    judgments: z.array(z.object({ ply: z.int().min(1), badge: z.enum(badges).optional(), note: z.string().optional(), held: z.array(z.string()).optional() })),
    leads: z.array(z.object({ position: z.int().min(0), lead: z.string() })).optional(),
    hint: z.object({
        position: z.int().min(0),
        text: z.string(),
        arrows: z.array(z.object({ colour: z.enum(colours), from: z.string(), to: z.string() })).optional(),
        squares: z.array(z.object({ colour: z.enum(colours), square: z.string() })).optional(),
    }).optional(),
    waiting: z.object({ position: z.int().min(0), since: z.iso.datetime() }).optional(),
    begun: z.int().min(0).optional(),
});

type CoachFile = z.infer<typeof coachFile>;

/** What is kept for a game, by when it started: nothing yet when the file is another game's, or missing. */
function keptFor(folder: string, current: CurrentGame): CoachFile
{
    const kept = read(folder);
    return kept?.started === current.started ? kept : { started: current.started, judgments: [] };
}

function read(folder: string): CoachFile | undefined
{
    try {
        return coachFile.parse(JSON.parse(readFileSync(join(folder, fileName), "utf8")));
    } catch {
        // None yet, or one Chesspal cannot read: the coach's words are only a help, and the next one written replaces it.
        return undefined;
    }
}

function write(folder: string, kept: CoachFile): void
{
    writeAtomically(join(folder, fileName), `${JSON.stringify(kept, null, 2)}\n`);
}
