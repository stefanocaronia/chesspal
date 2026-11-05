import { z } from "zod";
import { boardText, type Facts, materialOf, type Side } from "../core/index.ts";
import { gameFolder } from "../profiles/index.ts";
import { gameAt } from "./clock.ts";
import type { Context } from "./context.ts";
import { type GameSummary, headLines, summaryOf, wordLines } from "./game-summary.ts";
import { refuseUnseen } from "./levels.ts";
import { defineCommand } from "./registry.ts";
import { newWords } from "./say.ts";
import { gameToStudy, positionAfter, positionLine, studyInput } from "./study.ts";
import { fullView, materialText } from "./view.ts";

/**
 * The whole view of the position, with what the player wrote on the board page the AI has not been given yet; the same view of a position of a game
 * studied; or only the board as text for the player.
 */
type Look = { board: string; } | { game: Viewed; words: string[]; } | { study: StudyView; words: string[]; };

/** The game with the facts of its position, whoever is to move. */
type Viewed = GameSummary & { facts: Facts; };

/** A position of a game studied (D-68): where it stands, and its facts. */
interface StudyView
{
    where: string;
    turn: Side;
    fen: string;
    facts: Facts;
}

/** The whole view (D-26), when the compact one after the player's move is not enough; or the board for the player, where the host does not show it (D-36). */
export const look = defineCommand({
    name: "look",
    description: "Shows the whole view of the position, from the club level up and at every level once the game is over: the FEN and, for every piece, what attacks and defends it, then the pins, the checks and the legal "
        + "moves of each piece. The views of player_move, status and new_game give attackers and defenders only for the pieces attacked: call look "
        + 'before you attack or capture a piece that is not attacked yet, or plan an exchange. With only: "board", the board as text for the player, to '
        + "copy into your message where they do not see it. With move, and game for a game of the archive, the same of any position of a game over, to "
        + 'analyse it. Example: look {}, look {move: "12..."}.',
    input: z.object({ only: z.enum(["board"]).optional().describe("board: only the board as text, for the player"), ...studyInput }),
    // Read only for the host: a flag that has fallen is written, as the time already decided.
    readOnly: true,
    idempotent: true,
    run: ({ only, game, move }, context): Look => {
        if (game !== undefined || move !== undefined) {
            return studyLook(context, only, game, move);
        }

        const current = gameAt(gameFolder(context.folder), context.now());

        if (current === undefined) {
            throw new Error("There is no game to look at: start one with new_game.");
        }

        if (only !== "board") {
            refuseUnseen(current, "tactics", 'look without only: "board"');
        }

        return only === "board" ? { board: boardText(current.game.position.fen) } : { game: { ...summaryOf(current, context.now()), facts: current.game.facts }, words: newWords(context) };
    },
    format: (look) => {
        if ("board" in look) {
            return look.board;
        }

        return [...("game" in look ? [...headLines(look.game), ...fullView(look.game.facts, look.game.turn)] : studyLines(look.study)), ...wordLines(look.words)].join("\n");
    },
});

/** A position of a game over, as the view of the game going on gives it. */
function studyLook(context: Context, only: "board" | undefined, name: string | undefined, move: string | undefined): Look
{
    const studied = gameToStudy(context, name);
    const at = positionAfter(studied.record, move);
    const { position } = at.game;

    if (only === "board") {
        return { board: boardText(position.fen) };
    }

    return { study: { where: positionLine(at, studied.name), turn: position.turn, fen: position.fen, facts: at.game.facts }, words: newWords(context) };
}

/** Where the position stands, the material, the FEN, and the whole view. */
function studyLines({ where, turn, fen, facts }: StudyView): string[]
{
    return [
        where,
        `Material: ${materialText(materialOf(fen))}`,
        `FEN: ${fen}`,
        ...fullView(facts, turn),
    ];
}
