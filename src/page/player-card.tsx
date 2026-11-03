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

/** The player's picture until the profiles bring theirs (T-19): a simple face, in a circle. */
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
