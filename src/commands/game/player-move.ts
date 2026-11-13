import { z } from "zod";
import { type Move, withSanPieces } from "../../core/index.ts";
import { endOf, gameStamp, loadGame, rerunIfChanged } from "../../games/index.ts";
import { hasDoorbell } from "../../host-files/index.ts";
import { gameFolder } from "../../profiles/index.ts";
import { closingLines, coachOnEnd, coachOnEndLine, coachRuns, lastMoveText, moveLines, type MovePlayed, newWords, playMove, positionIn, refuseUnseenPosition, shownMove, withAnalyst } from "../answers/index.ts";
import { type Context, defineCommand, type SeenPosition } from "../registry/index.ts";
import { inviteLine, pageInvite } from "./page-link.ts";

/** The player's move, written in the chat and given by the AI: it answers with the position the AI decides on (D-34). */
export const playerMove = defineCommand({
    name: "player_move",
    description: "Plays the move the player wrote in the chat, and answers with the position for your reply: the FEN, your legal moves by piece and, from "
        + "the club level up, the pieces attacked with their defenders, the pins and the checks; look gives the rest. Give the move in SAN or as squares, and never choose for "
        + 'them: if their words fit two moves, or it is refused, ask them again. Example: player_move {move: "Nf3"}.',
    input: z.object({
        move: z.string().min(1).describe("the player's move, in SAN (Nf3, exd5, O-O, e8=Q) or as squares (g1f3, e7e8q)"),
        offer_draw: z.boolean().optional().describe("true when the player offers a draw with this move: it stands until your move"),
    }),
    alwaysLoad: true,
    showsGame: true,
    positionals: ["move"],
    run: (input, context): PlayerMove => playersMove(input, context, chatAllowance),
    format: (result, context) =>
        [
            `Player: ${result.game.lastMove === undefined ? shownMove(result.move) : lastMoveText(result.game.lastMove)}.`,
            ...moveLines(result),
            ...(result.invite === undefined ? [] : [inviteLine(result.invite)]),
            ...(result.coach === true ? [coachOnEndLine(result.game)] : []),
            ...closingLines(result.game, result.words, false, hasDoorbell(context?.host?.())),
        ].join("\n"),
});

/**
 * A move the player sent alone in the chat, played by Chesspal before the AI reads it: what the AI is told, the position it then sees, the stamp of
 * game.json after it, and the keys of the player's words on the board page given with it, for the chat's server to count them as given.
 */
export interface MoveSentAlone
{
    answer: string;
    position: SeenPosition;
    stamp?: string;
    given: string[];
}

/**
 * Plays the move the player sent alone in the chat, before the AI reads it (D-36): at the moment they sent it, so with no allowance, and answered as
 * player_move answers, with the player's words on the board page the AI has not answered. Refused as player_move refuses it: the AI reads the prompt then.
 */
export function playMoveSentAlone(move: string, context: Context): MoveSentAlone
{
    const folder = gameFolder(context.home());
    const before = new Set(context.given);
    const played = rerunIfChanged(() => playersMove({ move }, context, 0));
    const stamp = gameStamp(folder);
    return {
        answer: `Chesspal has already played the move the player wrote alone in the chat: don't call player_move for it.\n${playerMove.format(played, context)}`,
        position: positionIn(folder),
        ...(stamp === undefined ? {} : { stamp }),
        given: [...context.given].filter((key) => !before.has(key)),
    };
}

/** The player's move, with the board page's address once a game while no browser has it open (D-85), and the coach to start when it ended the game (D-88). */
interface PlayerMove extends MovePlayed
{
    invite?: string;
    coach?: true;
}

/**
 * The time a move in the chat leaves off the player's clock (D-36): the AI writing after its move and reading the player's, about 10 s as Priya measured.
 * The board page's moves need none, nor those Chesspal plays as the player sends them.
 */
const chatAllowance = 10_000;

function playersMove({ move, offer_draw: offerDraw = false }: { move: string; offer_draw?: boolean; }, context: Context, allowance: number): PlayerMove
{
    const folder = gameFolder(context.home());

    // A chat that has seen no game yet, new or resumed, plays the player's own move: its answer shows the game the AI decides on (D-71).
    if (context.positionSeen !== null) {
        refuseUnseenPosition(context, folder);
    }

    refuseKingAsRook(move, folder);

    // A piece's letter of another language is read as SAN's (D-113): Cf3 is the knight's move, Tf1 the rook's.
    const read = withSanPieces(move);
    const readAs = read === move ? "" : `${move.trim()} is read as ${read.trim()}. `;
    const started = context.positionSeen === null ? positionIn(folder).started : context.positionSeen?.started;
    const played = playMove(folder, context.now(), "player", read, (message) => `${readAs}${message} Ask the player again. Nothing changed.`, { allowance, offerDraw, coached: coachRuns(context) });
    // A game over by this move has no more moves to play there: the next game's window gives the address (Federico, round of D-85).
    const invite = played.game.end === undefined ? pageInvite(context, started) : undefined;
    const ended = played.game.end === undefined ? undefined : loadGame(folder);
    const coach = ended !== undefined && coachOnEnd(context, folder, ended);
    return { ...played, game: withAnalyst(played.game, context), words: newWords(context), ...(invite === undefined ? {} : { invite }), ...(coach ? { coach } : {}) };
}

/**
 * Refuses a move written R and a square when the player's king could go there: R is the king in Italian, French and Spanish, and only the player's words
 * tell which. A rook's move that names its file or rank, or given as squares, is never the king's.
 */
function refuseKingAsRook(move: string, folder: string): void
{
    const written = move.trim().replace(/^\d+\s*(?:\.[\s.]*|…\s*)/, "").replace(/\s+/g, "");
    const target = /^[Rr][x:]?([a-h][1-8])[+#]*[!?]*$/.exec(written)?.[1];
    const current = target === undefined ? undefined : loadGame(folder);

    // Another side to move, or a game over, is refused by the move itself.
    if (current === undefined || current.game.position.turn === current.ai || endOf(current.game) !== undefined) {
        return;
    }

    const there = current.game.legalMoves().filter((legal) => legal.to === target);
    const rooks = there.filter((legal) => legal.san.startsWith("R")).map(squaresOf);
    const king = there.find((legal) => legal.san.startsWith("K"));

    if (rooks.length > 0 && king !== undefined) {
        throw new Error(
            `${written} may be the rook's move, ${rooks.join(" or ")}, or the king's, ${squaresOf(king)}: R is the king in Italian, French and Spanish. `
                + "Unless the player's words name the piece, ask them which; then give it as squares. Nothing changed.",
        );
    }

    if (rooks.length === 0 && king !== undefined) {
        throw new Error(
            `${written} is not legal: R is the rook in SAN, and no rook can go to ${target}. The king can, ${king.san}, and R is the king in Italian, French and Spanish: `
                + `ask the player whether they meant the king, and give ${king.san} only once they say so. Nothing changed.`,
        );
    }
}

function squaresOf(move: Move): string
{
    return `${move.from}${move.to}`;
}
