// The talk on the board page (D-51, D-53): the AI's words in bubbles that point at the Torretta, the player's above the box they write in.
import { type ComponentChildren, type RefObject } from "preact";
import { useLayoutEffect, useRef } from "preact/hooks";
import type { Side } from "../core/index.ts";
import { talkLimits, type TalkLine } from "./plies.ts";
import type { Text } from "./text.ts";
import { Torretta } from "./torretta.tsx";

/** The AI's words since the player's move, a bubble each; the first points at the Torretta. */
export function AiWords({ words }: { words: readonly string[]; })
{
    const list = useRef<HTMLOListElement>(null);
    useScrolledToEnd(list, words);

    return (
        <ol ref={list} class="says" aria-live="polite">
            {words.map((word, index) => <li key={index} class="say">{word}</li>)}
        </ol>
    );
}

/**
 * The player's words still on the page, the last with how far it got, and the box they write in: Enter or the button sends the words alone, the next move
 * takes them with it. 200 characters from one move of the AI's to the next: once they are written, the box goes until its move (D-54).
 */
export function Compose({ lines, spent, draft, onDraft, onSend, canMove, name, problem, text }: {
    lines: readonly TalkLine[];
    spent: number;
    draft: string;
    onDraft: (draft: string) => void;
    onSend: () => void;
    canMove: boolean;
    name: string;
    problem?: string;
    text: Text;
})
{
    const list = useRef<HTMLOListElement>(null);
    useScrolledToEnd(list, lines.map((line) => line.text));
    const left = talkLimits.line - spent;
    const blank = draft.trim() === "";

    const submit = (): void => {
        if (!blank) {
            onSend();
        }
    };

    return (
        <>
            <ol ref={list} class="sent" aria-live="polite">
                {lines.map((line, index) => (
                    <li key={index}>
                        <p class="said">{line.text}</p>
                        {index === lines.length - 1 ? <Status heard={line.heard} name={name} text={text} /> : null}
                    </li>
                ))}
            </ol>
            {left <= 0 ? null : (
                <form
                    class="compose"
                    onSubmit={(event) => {
                        event.preventDefault();
                        submit();
                    }}
                >
                    <p class="limit" role="status">{problem ?? ""}</p>
                    <textarea
                        rows={2}
                        maxLength={left}
                        placeholder={text.writeTo(name)}
                        aria-label={text.writeTo(name)}
                        value={draft}
                        onInput={(event) => onDraft(event.currentTarget.value)}
                        onKeyDown={(event) => {
                            if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
                                event.preventDefault();
                                submit();
                            }
                        }}
                    />
                    <div class="foot">
                        {spent + draft.length >= talkLimits.line - 50
                            ? <span class="count">{spent + draft.length}/{talkLimits.line}</span>
                            : <span class="hint">{!blank && canMove ? text.withMove : ""}</span>}
                        <button class="send" type="submit" disabled={blank}>
                            {text.send}
                            <svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
                                <path d="M5 12H18M13 7L18 12L13 17" />
                            </svg>
                        </button>
                    </div>
                </form>
            )}
        </>
    );
}

/** A list that scrolls, kept at its newest line whenever its lines change. */
/**
 * The talk narrowed to a card beside the board (T-84): the Torretta above, the player below, each with their name and side written down the card, a ring on
 * whoever moves and a dot on the Torretta when the AI spoke meanwhile.
 */
export function TalkFaces({ name, you, picture, ai, player, aiMoves, playerMoves, unread, text }: {
    name: string;
    /** The player's name and picture. */
    you: string;
    picture: ComponentChildren;
    ai: Side;
    player: Side;
    aiMoves: boolean;
    playerMoves: boolean;
    unread: boolean;
    text: Text;
})
{
    return (
        <div class="faces">
            <RailPlayer place="ai" picture={<Torretta size={40} />} name={name} side={text.sides[ai]} moves={aiMoves} unread={unread} />
            <RailPlayer place="you" picture={picture} name={you} side={text.sides[player]} moves={playerMoves} />
        </div>
    );
}

function RailPlayer({ place, picture, name, side, moves, unread = false }: {
    place: "ai" | "you";
    picture: ComponentChildren;
    name: string;
    side: string;
    moves: boolean;
    unread?: boolean;
})
{
    return (
        <div class={`rail-player ${place}${moves ? " moving" : ""}`}>
            <span class={`face${unread ? " unread" : ""}`}>{picture}</span>
            <span class="rail-name">
                {name} <span class="note">· {side}</span>
            </span>
        </div>
    );
}

function useScrolledToEnd(list: RefObject<HTMLElement>, lines: readonly string[]): void
{
    useLayoutEffect(() => {
        if (list.current !== null) {
            list.current.scrollTop = list.current.scrollHeight;
        }
    }, [list, lines.length, lines.at(-1)]);
}

/** Under the player's last line: one check once written, two once the AI has read it. */
function Status({ heard, name, text }: { heard: TalkLine["heard"]; name: string; text: Text; })
{
    const read = heard === "read" || heard === "answered";
    return (
        <span class={read ? "status read" : "status"}>
            <svg class="icon" viewBox="0 0 21 24" aria-hidden="true">
                {read ? <path d="M2 12.5L6 16.5L13.5 8M10 15.5L11 16.5L18.5 8" /> : <path d="M3.5 12.5L7.5 16.5L15 8" />}
            </svg>
            {read ? text.readBy(name) : text.sent}
        </span>
    );
}
