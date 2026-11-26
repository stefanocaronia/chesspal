// The thought cloud at the Torretta's corner (Zoe's sketch): filled while the AI thinks on its move, outlined while it thinks on the player's time (D-72).
// The face and the light stay the mood's (D-70): the cloud says what it does, the face how it feels.
import type { ComponentChildren } from "preact";
import type { Text } from "../text.ts";

/** What the AI thinks on, as the server tells it; and `answer`, the page's own, for a chat the table drives at work on anything but its move. */
export type Thinking = "move" | "ponder" | "answer";

/** The AI's picture with its thought cloud while it thinks; the picture alone else. */
export function Thinker({ thinking, words, children }: { thinking: Thinking | undefined; words: Text["thinking"]; children: ComponentChildren; })
{
    return (
        <span class="thinker">
            {children}
            {thinking === undefined ? null : <Thought thinking={thinking} words={words} />}
        </span>
    );
}

/** The cloud alone, as on the folded talk's tab: named for a screen reader that explores it, never announced, since the AI's move says it is done. */
export function Thought({ thinking, words }: { thinking: Thinking; words: Text["thinking"]; })
{
    // An answer looks as a move does: the AI at work, in the accent; its words tell them apart.
    const look = thinking === "ponder" ? "ponder" : "move";
    const dots = look === "move" ? { radius: 1.8, at: [6.8, 11.5, 16.2] } : { radius: 1.4, at: [7.3, 11.5, 15.7] };

    return (
        <svg class={`thought ${look}`} viewBox="0 0 24 20" role="img" aria-label={words[thinking]}>
            <title>{words[thinking]}</title>
            <path class="cloud" d="M7 1.5h9a5.5 5.5 0 0 1 0 11H7a5.5 5.5 0 0 1 0-11Z" />
            <circle class="cloud" cx="19" cy="16.5" r="2.1" />
            {dots.at.map((x) => <circle key={x} class="dot" cx={x} cy="7" r={dots.radius} />)}
        </svg>
    );
}
