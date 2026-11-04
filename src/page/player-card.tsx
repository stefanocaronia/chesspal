// A player's card beside the board: their picture, name and side, whose move it is, the pieces they took and how far ahead they are (D-20), and their
// clock (T-37).
import type { ComponentChildren } from "preact";
import { useEffect, useState } from "preact/hooks";
import { type Clock, type PieceLetter, type Side, timeLeft } from "../core/index.ts";
import { lowTime, timeShown } from "./clock-time.ts";
import { Piece } from "./pieces.tsx";
import type { Text } from "./text.ts";

/** The card of one player: the AI's above its words, with its level; the player's below theirs, saying when it is their move. */
export function PlayerCard({ place, picture, name, side, level, taken, ahead, turn = false, clock, text }: {
    place: "ai" | "you";
    picture: ComponentChildren;
    /** The name, or the button that opens the profiles. */
    name: ComponentChildren;
    side: Side;
    /** The AI's level in a game: its name, and what the AI sees there (D-61). */
    level?: readonly [name: string, note: string, sees: string];
    taken: readonly PieceLetter[];
    ahead: number;
    turn?: boolean;
    /** The player's clock, in a game with one. */
    clock?: ComponentChildren;
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
                    <div class="taken" role="img" aria-label={text.taken(taken.map((piece) => text.piece(piece, opponent)), ahead)}>
                        {groupsOf(taken).map((group) => (
                            <span key={group[0]} class="group">
                                {group.map((piece, index) => <Piece key={index} letter={opponent === "white" ? piece : piece.toLowerCase()} small />)}
                            </span>
                        ))}
                        {ahead > 0 ? <span class="balance">+{ahead}</span> : null}
                    </div>
                </div>
                {clock}
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
    const running = toMove && !held;

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

/** The player's picture on a page without profiles: a simple face, in a circle. */
export function Avatar()
{
    return (
        <svg class="avatar" viewBox="0 0 64 64" width="48" height="48" aria-hidden="true">
            <circle class="back" cx="32" cy="32" r="32" />
            <path class="shirt" d="M10 66C11 52 20 45 32 45C44 45 53 52 54 66Z" />
            <path class="skin" d="M27 37H37V47C37 50 27 50 27 47Z" />
            <circle class="skin" cx="32" cy="28" r="12" />
            <path class="hair" d="M19.5 29C18 18 24 12.5 32.5 12.5C41 12.5 46.5 18 44.5 29C43 23.5 39 20.5 33 21.5C28 22.5 23 24 19.5 29Z" />
            <circle class="eye" cx="27.5" cy="29.5" r="1.7" />
            <circle class="eye" cx="36.5" cy="29.5" r="1.7" />
            <path class="smile" d="M28.5 34.5Q32 37.5 35.5 34.5" />
        </svg>
    );
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
