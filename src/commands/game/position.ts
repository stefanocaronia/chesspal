import { z } from "zod";
import { type PieceLetter, type Profile, type Side, type SideProfile } from "../../core/index.ts";
import { analystAgent } from "../../host-files/index.ts";
import { gameFolder } from "../../profiles/index.ts";
import { colourName, gameAt, gameShown, materialText, positionAfter, positionLine, refuseUnseen, studyInput } from "../answers/index.ts";
import { defineCommand } from "../registry/index.ts";

/** The positional profile of a position: of a game studied, with where it stands. */
type Described = Profile & { where?: string; };

/** The positional profile of the game in progress (D-19), or of any position of a game over (D-68): separate facts, never a score. */
export const position = defineCommand({
    name: "position",
    description:
        "Shows the positional facts of the position, from the strong level up and at every level once the game is over: material, pawns (isolated, doubled, backward, passed, islands), open files, rooks and queens on the seventh, bishops, "
        + "outposts, centre, space, control, mobility, development and castling, king safety, the phase, the draw rules and, with only kings and pawns, "
        + "the rule of the square and the opposition. Facts only, never a score: weigh them yourself. Call it when you set or change your plan: out of "
        + "the opening, after a big exchange, in the endgame; not at every move. With move, and game for a game of the archive, the facts of any position of a "
        + 'game over, to analyse it. Example: position {}, position {move: "24."}.',
    input: z.object(studyInput),
    readOnly: true,
    idempotent: true,
    sharedWith: [analystAgent],
    run: ({ game, move }, context): Described => {
        if (game !== undefined || move !== undefined) {
            const studied = gameShown(context, game);
            const at = positionAfter(studied.record, move);
            return { ...at.game.profile, where: positionLine(at, studied.name) };
        }

        const current = gameAt(gameFolder(context.home()), context.now());

        if (current === undefined) {
            throw new Error("There is no game to describe: start one with new_game.");
        }

        refuseUnseen(current, "strategy", "position");
        return current.game.profile;
    },
    format: (described) => [...(described.where === undefined ? [] : [described.where]), ...profileLines(described)].join("\n"),
});

/** The profile as lines for the AI, White's facts before Black's; a line with nothing to say is left out. */
export function profileLines(profile: Profile): string[]
{
    const sides = [["white", profile.white], ["black", profile.black]] as const;
    const perSide = (line: (side: SideProfile) => string | undefined) =>
        sides.map(([side, facts]) => {
            const text = line(facts);
            return text === undefined ? undefined : `${colourName(side)} ${text}`;
        }).filter((text) => text !== undefined).join("; ");
    const lines = [
        `Phase: ${profile.phase}`,
        `Material: ${materialText(profile.material)}`,
        ...sides.map(([side, facts]) => pawnLine(side, facts)),
        filesLine(profile),
        seventhLine(perSide((side) => joined(side.onSeventh))),
        bishopsLine(profile),
        `Outposts: ${perSide((side) => joined(side.outposts.map((outpost) => (outpost.piece === undefined ? outpost.square : `${outpost.piece}${outpost.square}`)))) || "none"}`,
        `Centre (White/Black pieces reaching it): ${profile.centre.map(centreText).join(", ")}`,
        `Space (squares of the other half attacked): White ${profile.white.space}, Black ${profile.black.space}`,
        `Control: only White ${profile.controlled.white}, only Black ${profile.controlled.black}, both ${profile.controlled.contested}`,
        `Mobility: ${perSide((side) => (side.mobility === undefined ? undefined : mobilityText(side.mobility)))}`,
        `Development: ${perSide(developmentText)}`,
        ...sides.flatMap(([side, facts]) => (facts.king === undefined ? [] : [kingLine(side, facts.king)])),
        drawLine(profile),
        ...endingLines(profile),
    ];

    return lines.filter((line) => line !== "");
}

const pieceOrder: readonly PieceLetter[] = ["K", "Q", "R", "B", "N", "P"];

function pawnLine(side: Side, { pawns }: SideProfile): string
{
    const kinds = [["isolated", pawns.isolated], ["doubled", pawns.doubled], ["backward", pawns.backward], ["passed", pawns.passed]] as const;
    const named = kinds.filter(([, squares]) => squares.length > 0).map(([kind, squares]) => `${kind} ${squares.join(" ")}`);
    return `${colourName(side)} pawns: ${[...named, `islands ${pawns.islands.join(", ") || "none"}`].join("; ")}`;
}

function filesLine(profile: Profile): string
{
    const parts = [
        profile.openFiles.length === 0 ? "" : `open ${profile.openFiles.join(" ")}`,
        ...(["white", "black"] as const).map((side) => {
            const files = profile[side].halfOpenFiles;
            return files.length === 0 ? "" : `half-open for ${colourName(side)} ${files.join(" ")}`;
        }),
        ...(["white", "black"] as const).map((side) => {
            const heavy = profile[side].heavyOnFiles;
            return heavy.length === 0 ? "" : `${colourName(side)} heavy pieces on them ${heavy.join(" ")}`;
        }),
    ].filter((part) => part !== "");

    return `Files: ${parts.join("; ") || "no open or half-open file"}`;
}

function seventhLine(pieces: string): string
{
    return pieces === "" ? "" : `Rooks and queens on the seventh rank (the second for Black): ${pieces}`;
}

function bishopsLine(profile: Profile): string
{
    const parts = (["white", "black"] as const).flatMap((side) => {
        const facts = profile[side];
        const each = facts.bishops.map((bishop) => `B${bishop.square} ${bishop.pawnsOnColour}/${bishop.pawns}`);
        return each.length === 0 ? [] : [`${colourName(side)}${facts.bishopPair ? " (pair)" : ""} ${each.join(", ")}`];
    });

    return parts.length === 0 ? "" : `Bishops (own pawns on its colour/all): ${parts.join("; ")}${profile.oppositeBishops ? "; opposite-coloured" : ""}`;
}

function centreText({ square, piece, white, black }: Profile["centre"][number]): string
{
    const on = piece === undefined ? "" : ` ${colourName(piece.side)} ${piece.letter}`;
    return `${square}${on} ${white}/${black}`;
}

function mobilityText(mobility: NonNullable<SideProfile["mobility"]>): string
{
    const total = Object.values(mobility).reduce((sum, count) => sum + count, 0);
    return total === 0 ? "0" : `${total} (${pieceOrder.filter((letter) => mobility[letter] !== undefined).map((letter) => `${letter}${mobility[letter]}`).join(" ")})`;
}

function developmentText(side: SideProfile): string
{
    const castled = side.castled === undefined ? "" : side.castled === "no" ? "not castled" : `castled ${side.castled}`;
    const rights = side.castlingRights.length === 0 ? "" : `may castle ${side.castlingRights.join(" ")}`;
    const home = side.undeveloped.length === 0 ? "" : `at home ${side.undeveloped.join(" ")}`;
    return [castled, rights, home].filter((part) => part !== "").join(", ") || "nothing to say";
}

function kingLine(side: Side, king: NonNullable<SideProfile["king"]>): string
{
    const files = king.openFiles.length === 0 ? "" : `, no own pawn on ${king.openFiles.join(" ")}`;
    return `${colourName(side)} K${king.square}: shield ${king.shield.join(" ") || "none"}${files}, enemy attacks around it ${king.attacksNear}`;
}

function drawLine({ draw }: Profile): string
{
    const parts = [
        draw.repetitions > 1 ? `position seen ${draw.repetitions} times` : "",
        draw.fiftyMovesLeft <= 20 ? `${draw.fiftyMovesLeft} half-moves left before the fifty-move draw` : "",
        draw.insufficient ? "material insufficient to mate" : "",
    ].filter((part) => part !== "");

    return parts.length === 0 ? "" : `Draw rules: ${parts.join("; ")}`;
}

function endingLines({ pawnEnding }: Profile): string[]
{
    if (pawnEnding === undefined) {
        return [];
    }

    const squares = pawnEnding.squares.map((square) => `${square.pawn} ${square.caught ? "inside" : "outside"} the enemy king's square`);
    const opposition = pawnEnding.opposition === undefined ? "nobody" : colourName(pawnEnding.opposition);
    return [`Pawn ending: ${[...squares, `opposition: ${opposition}`].join("; ")}`];
}

function joined(items: readonly string[]): string | undefined
{
    return items.length === 0 ? undefined : items.join(" ");
}
