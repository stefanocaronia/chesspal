// A player's card beside the board: their picture, name and side, whose move it is, the pieces they took and how far ahead they are (D-20).
import type { ComponentChildren } from "preact";
import type { PieceLetter, Side } from "../core/index.ts";
import { Piece } from "./pieces.tsx";
import type { Text } from "./text.ts";

/** The card of one player: the AI's above its words, the player's below theirs; the player's says when it is their move. */
export function PlayerCard({ place, picture, name, side, taken, ahead, turn = false, text }: {
    place: "ai" | "you";
    picture: ComponentChildren;
    name: string;
    side: Side;
    taken: readonly PieceLetter[];
    ahead: number;
    turn?: boolean;
    text: Text;
})
{
    const opponent = side === "white" ? "black" : "white";
    return (
        <section class={`card player ${place}`}>
            <div class="player-line">
                {picture}
                <div class="who">
                    <div class="name">
                        {name}{" "}
                        <span class="note">
                            · {text.sides[side]}
                            {turn
                                ? (
                                    <>
                                        {" "}· <b class="turn">{text.yourTurn}</b>
                                    </>
                                )
                                : null}
                        </span>
                    </div>
                    <div class="taken" role="img" aria-label={text.taken(taken.map((piece) => text.piece(piece, opponent)), ahead)}>
                        {groupsOf(taken).map((group) => (
                            <span key={group[0]} class="group">
                                {group.map((piece, index) => <Piece key={index} letter={opponent === "white" ? piece : piece.toLowerCase()} />)}
                            </span>
                        ))}
                        {ahead > 0 ? <span class="balance">+{ahead}</span> : null}
                    </div>
                </div>
            </div>
        </section>
    );
}

/** The player's picture until the profiles bring theirs (T-19): a plain figure. */
export function Avatar()
{
    return (
        <svg class="avatar" viewBox="0 0 64 64" width="48" height="48" aria-hidden="true">
            <circle class="back" cx="32" cy="32" r="32" />
            <circle class="figure" cx="32" cy="26" r="11" />
            <path class="figure" d="M12 56C14 44 22 39 32 39C42 39 50 44 52 56Z" />
        </svg>
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
