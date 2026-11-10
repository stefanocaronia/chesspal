// A player's card beside the board: their picture, name and side, whose move it is, the pieces they took and how far ahead they are (D-20), and their
// clock.
import type { ComponentChildren } from "preact";
import { useEffect, useState } from "preact/hooks";
import { type Clock, type PieceLetter, type Side, timeLeft } from "../../core/index.ts";
import { Piece } from "../pieces/pieces.tsx";
import type { Text } from "../text.ts";
import { lowTime, timeShown } from "./clock-time.ts";

/** The card of one player: the AI's above its words, with its level; the player's below theirs, saying when it is their move. */
export function PlayerCard({ place, picture, name, signed, side, level, taken, ahead, turn = false, clock, badges, text }: {
    place: "ai" | "you";
    picture: ComponentChildren;
    /** The name, or the button that opens the profiles. */
    name: ComponentChildren;
    /** Under the AI's name, its model and effort, once the host tied them to a move (D-82). */
    signed?: string | undefined;
    /** The side played; none between games, with the table set for the next (D-77). */
    side?: Side;
    /** The AI's level in a game: its name, and what the AI sees there (D-61). */
    level?: readonly [name: string, note: string, sees: string];
    taken: readonly PieceLetter[];
    ahead: number;
    turn?: boolean;
    /** The player's clock, in a game with one. */
    clock?: ComponentChildren;
    /** In a game in analysis, the badges the AI gave this side's moves, under the pieces taken (D-69). */
    badges?: ComponentChildren;
    text: Text;
})
{
    const opponent = side === "white" ? "black" : "white";
    return (
        <section class={`card player ${place}`}>
            <div class="player-line">
                {picture}
                <div class="who">
                    <div class="name" title={typeof name === "string" ? name : undefined}>{name}</div>
                    {signed === undefined ? null : <div class="signed" title={signed}>{signed}</div>}
                    {side === undefined ? null : (
                        <div class="note">
                            {text.sides[side]}
                            {level === undefined ? null : (
                                <>
                                    {" "}· <LevelTip level={level} />
                                </>
                            )}
                            {turn
                                ? (
                                    <>
                                        {" "}· <b class="turn">{text.yourTurn}</b>
                                    </>
                                )
                                : null}
                        </div>
                    )}
                </div>
                {clock}
                {/* Between games a card is the name alone; in a game the pieces taken keep their line, empty too, and run under the clock to the card's edge */}
                {side === undefined && taken.length === 0 && badges === undefined ? null : (
                    <div class="haul">
                        <div class="taken" role="img" aria-label={text.taken(taken.map((piece) => text.piece(piece, opponent)), ahead)}>
                            {groupsOf(taken).map((group) => (
                                <span key={group[0]} class={group[0]?.toUpperCase() === "P" ? "group pawns" : "group"}>
                                    {group.map((piece, index) => <Piece key={index} letter={opponent === "white" ? piece : piece.toLowerCase()} small />)}
                                </span>
                            ))}
                            {ahead > 0 ? <span class="balance">+{ahead}</span> : null}
                        </div>
                        {badges}
                    </div>
                )}
            </div>
        </section>
    );
}

/**
 * A side's time on the game's clock, as the server keeps it: it runs while the side is to move and the game goes on, unless `held` (a move on its way);
 * at nothing it calls `onFlag` once, for the server to say how the game ended.
 */
export function ClockFace({ clock, side, toMove, held, onFlag, text }: { clock: Clock; side: Side; toMove: boolean; held: boolean; onFlag: () => void; text: Text; })
{
    const [now, setNow] = useState(() => Date.now());
    const running = toMove && !held && clock.waiting !== true;

    useEffect(() => {
        if (!running) {
            return;
        }

        setNow(Date.now());
        const ticks = setInterval(() => setNow(Date.now()), 100);
        return () => clearInterval(ticks);
    }, [running, clock]);

    const left = toMove ? timeLeft(clock, side, new Date(now))[side] : clock.left[side];
    const fallen = running && left === 0;

    useEffect(() => {
        if (fallen) {
            onFlag();
        }
    }, [fallen]);

    const shown = timeShown(left);
    const classes = ["clock", running ? "running" : "", left < lowTime ? "low" : ""].filter((name) => name !== "").join(" ");
    return <span class={classes} role="timer" aria-label={text.clock(shown, running)}>{shown}</span>;
}

/** The AI's level, a button that shows under it what the AI sees there (D-61), for a touch as for a mouse. */
function LevelTip({ level }: { level: readonly [name: string, note: string, sees: string]; })
{
    return (
        <>
            <button class="level-name" type="button" popovertarget="ai-level" aria-describedby="ai-level">{level[0]}</button>
            <span id="ai-level" class="level-tip" popover="auto">{level[2]}</span>
        </>
    );
}

/** The pieces taken, grouped by kind: they come the most valuable first, each kind together. */
function groupsOf(taken: readonly PieceLetter[]): PieceLetter[][]
{
    const groups: PieceLetter[][] = [];

    for (const piece of taken) {
        const last = groups.at(-1);

        if (last?.[0] === piece) {
            last.push(piece);
        } else {
            groups.push([piece]);
        }
    }

    return groups;
}
