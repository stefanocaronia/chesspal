// The talk on the board page (D-51, D-53): the AI's words in bubbles that point at the Torretta, the player's above the box they write in.
import { type ComponentChildren, createContext, type RefObject } from "preact";
import { useContext, useEffect, useLayoutEffect, useRef } from "preact/hooks";
import type { Mood, MoveReview, Opening, Side } from "../core/index.ts";
import { BadgeIcon, NoteIcon } from "./badges.tsx";
import { Figurines } from "./move-list.tsx";
import { type Ply, talkLimits, type TalkLine } from "./plies.ts";
import type { Text } from "./text.ts";
import { Torretta } from "./torretta.tsx";
import { hush, speak } from "./voice.ts";

/**
 * The AI's words of the game, a bubble each, the newest by the Torretta: below it, or above it on a board turned round; the first points at it. With the helps
 * on, its judgment of the player's last move comes newest, in a line that opens on its note (D-78).
 */
export function AiWords({ words, newestFirst, voice, judged, text }: { words: readonly string[]; newestFirst: boolean; voice?: string; judged?: Ply; text: Text; })
{
    const list = useRef<HTMLOListElement>(null);
    useOnlyWhole(list, words, newestFirst);
    useSpokenNews(words, voice);

    const says = (
        <ol ref={list} class="says" aria-live="polite">
            {inOrder(
                words.map((word, index) => (
                    <li key={index} class="say" style={aged(words.length - 1 - index)}>
                        <Marked text={word} />
                    </li>
                )),
                newestFirst,
            )}
        </ol>
    );

    // The judgment sits by the Torretta, out of the bubbles' order: it never pushes the AI's words away.
    if (judged === undefined) {
        return says;
    }

    const line = <Judged ply={judged} text={text} />;
    return newestFirst ? <>{line}{says}</> : <>{says}{line}</>;
}

/**
 * The AI's word on the move shown of a game in analysis (D-69), in a bubble that points down at the Torretta beside the AI's name: the move, its badge by name,
 * and its note when it wrote one; read out as the player steps through the game. The Torretta and the name stay when the move has no word.
 */
export function AiNote({ ply, opening, closing, summary, name, mood, voice, text }: {
    ply?: Ply;
    opening?: Opening;
    closing?: string;
    summary?: string;
    name: string;
    /** The AI's mood on the move shown, which the Torretta that speaks shows too (D-70). */
    mood: Mood;
    /** The language to read the note aloud in, when the player wants it. */
    voice?: string;
    text: Text;
})
{
    // On a move of the book without the AI's note, the AI reports what the book says: the opening in the title, the variation under it.
    const book = ply?.review?.note === undefined ? opening : undefined;
    const shown: MoveReview | undefined = ply?.review ?? (book === undefined ? undefined : { badge: "book" });
    const title = [shown?.badge === undefined || (book !== undefined && shown.badge === "book") ? undefined : text.badges[shown.badge], book?.family].filter((part) => part !== undefined).join(" · ");
    const note = shown?.note ?? book?.variation;
    const spoken = [ply === undefined || shown === undefined ? undefined : title, ply === undefined ? undefined : note, summary?.replace(/\s*•\s+/g, ". "), closing].filter((part) => part !== undefined && part !== "").join(". ");

    useEffect(() => {
        if (voice !== undefined) {
            speak(spoken, voice);
        }

        return hush;
    }, [spoken, voice]);

    // The Torretta stays in sight through the whole analysis, under its bubbles, which show only where it wrote something.
    return (
        <div class="ai-note" aria-live="polite">
            {ply === undefined || shown === undefined ? null : (
                <p class={`say move-note ${shown.badge ?? ""}`}>
                    <span class="head">
                        {shown.badge === undefined ? <NoteIcon /> : <BadgeIcon badge={shown.badge} />}
                        <b>
                            <span class="visually-hidden">{ply.number}{ply.side === "white" ? "." : "..."}{ply.san}</span>
                            <span aria-hidden="true">
                                <span class="move-number">{ply.number}{ply.side === "white" ? "." : "..."}</span>
                                <Figurines san={ply.san} side={ply.side} />
                            </span>
                        </b>{" "}
                        {title}
                    </span>
                    {note === undefined ? null : (
                        <span class="note">
                            <Marked text={note} />
                        </span>
                    )}
                    {shown.arrows === undefined && shown.squares === undefined ? null : <Legend review={shown} text={text} />}
                </p>
            )}
            {summary === undefined ? null : <GameReview by={name} summary={summary} text={text} />}
            {closing === undefined ? null : (
                <p class="say closing">
                    <Marked text={closing} />
                </p>
            )}
            <p class="who">
                <Torretta size={36} mood={mood} />
                {name}
            </p>
        </div>
    );
}

/** The AI's judgment of the player's move, with the helps on: its badge and the move in a line, which opens on its note (D-78). */
function Judged({ ply, text }: { ply: Ply; text: Text; })
{
    const { badge, note } = ply.review ?? {};
    const head = (
        <>
            {badge === undefined ? <NoteIcon /> : <BadgeIcon badge={badge} />}
            <b>
                <span class="move-number">{ply.number}{ply.side === "white" ? "." : "..."}</span>
                <Figurines san={ply.san} side={ply.side} />
            </b>{" "}
            {badge === undefined ? null : text.badges[badge]}
        </>
    );

    return (
        <div class={`say move-note judged ${badge ?? ""}`}>
            {note === undefined ? <span class="head">{head}</span> : (
                <details>
                    <summary class="head">{head}</summary>
                    <span class="note">
                        <Marked text={note} />
                    </span>
                </details>
            )}
        </div>
    );
}

/** The squares and moves in the AI's words, such as e3, Cxe4, 7.Nd4 or O-O: in bold, as the player looks for them on the board. */
export function Marked({ text }: { text: string; })
{
    // The words the AI wrote between two asterisks first, in bold as it chose; the squares and moves in the rest, and in them, in the accent.
    return (
        <>
            {text.split(boldWords).map((part, index) =>
                index % 2 === 1
                    ? (
                        <b key={index}>
                            <OnBoard text={part} />
                        </b>
                    )
                    : <OnBoard key={index} text={part} />
            )}
        </>
    );
}

/** Where the pointer is among the squares and moves in the AI's words (T-111): the board lights that square up. */
export const PointSquare = createContext<(square: string | undefined) => void>(() => undefined);

function OnBoard({ text }: { text: string; })
{
    const point = useContext(PointSquare);
    return (
        <>
            {text.split(boardWords).map((part, index) =>
                index % 2 === 1
                    ? <b key={index} class="on-board" onPointerEnter={() => point(squareIn(part))} onPointerLeave={(event) => event.pointerType === "mouse" && point(undefined)}>{part}</b>
                    : part
            )}
        </>
    );
}

/** The square a word names: a square, or where a move goes, the last square in it; none for a castling. */
function squareIn(word: string): string | undefined
{
    return /[a-h][1-8](?!.*[a-h][1-8])/.exec(word)?.[0];
}

// **a few words** the AI put in bold, as Markdown writes them.
const boldWords = /\*\*(.+?)\*\*/;

// A square or a move in English or Italian letters, with its number if it has one; the capture group keeps it in split's parts.
const boardWords = /(?<![\p{L}\d])((?:\d+\.(?:\.\.)?\s?)?(?:O-O(?:-O)?|[KQRBNCADT]?[a-h]?[1-8]?x?[a-h][1-8](?:=[QRBNDTAC])?)[+#]?[!?]{0,2})(?![\p{L}\d])/u;

/** The AI's word on the whole game (D-69), in the Torretta's bubble at the start of the game: a paragraph, and its points as a list. */
function GameReview({ by, summary, text }: { by: string; summary: string; text: Text; })
{
    const [lead = "", ...points] = summary.split(/\s*•\s+/);

    return (
        <section class="say review" aria-label={text.reviewBy(by)}>
            <p class="head">
                <svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M12 4V20M8 20H16M5 7H19M5 7L2.5 13A2.5 2 0 0 0 7.5 13ZM19 7L16.5 13A2.5 2 0 0 0 21.5 13Z" />
                </svg>
                {text.reviewBy(by)}
            </p>
            {lead === "" ? null : (
                <p>
                    <Marked text={lead} />
                </p>
            )}
            {points.length === 0 ? null : (
                <ul>
                    {points.map((point, index) => (
                        <li key={index}>
                            <Marked text={point} />
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
}

/** What the colours drawn with a note mean, the ones it uses: the AI's legend, for the player (D-69). */
function Legend({ review, text }: { review: MoveReview; text: Text; })
{
    const used = [...new Set([...(review.arrows ?? []), ...(review.squares ?? [])].map((drawn) => drawn.colour))];

    return (
        <span class="legend">
            {used.map((colour) => (
                <span key={colour} class={colour}>
                    <i aria-hidden="true" />
                    {text.drawn[colour]}
                </span>
            ))}
        </span>
    );
}

/**
 * The player's words of the game, the newest by the box they write in with how far it got, and the box: Enter or the button sends the words alone, the next
 * move takes them with it. 200 characters from one move of the AI's to the next: once they are written, the box goes until its move (D-54).
 */
export function Compose({ lines, newestFirst, spent, draft, onDraft, onSend, canMove, name, problem, text }: {
    lines: readonly TalkLine[];
    /** On a board turned round the box is above the words, and the newest come first. */
    newestFirst: boolean;
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
    useOnlyWhole(list, lines.map((line) => line.text));
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
                {inOrder(
                    lines.map((line, index) => (
                        <li key={index} style={aged(lines.length - 1 - index)}>
                            <p class="said">{line.text}</p>
                            {index === lines.length - 1 ? <Status heard={line.heard} name={name} text={text} /> : null}
                        </li>
                    )),
                    newestFirst,
                )}
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

/**
 * The talk narrowed to a card beside the board (T-84): the Torretta above, the player below, each with their name and side written down the card, a ring on
 * whoever moves and a dot on the Torretta when the AI spoke meanwhile.
 */
export function TalkFaces({ name, aiPicture, you, picture, ai, player, aiMoves, playerMoves, unread, text }: {
    name: string;
    /** The picture above, the Torretta's but for a game in analysis played by others (D-69). */
    aiPicture?: ComponentChildren;
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
            <RailPlayer place="ai" picture={aiPicture ?? <Torretta size={40} />} name={name} side={text.sides[ai]} moves={aiMoves} unread={unread} />
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

/** Reads aloud each word the AI adds while the page is open, not those already there. */
function useSpokenNews(words: readonly string[], voice: string | undefined): void
{
    const heard = useRef(words.length);

    useEffect(() => {
        if (voice !== undefined && words.length > heard.current) {
            speak(words.slice(heard.current).join(" "), voice);
        }

        heard.current = words.length;
    }, [words.length, voice]);
}

/** A list's items, the newest first when it asks. */
function inOrder<Item>(items: Item[], newestFirst: boolean): Item[]
{
    return newestFirst ? items.reverse() : items;
}

/** A word fades with age: the newest whole, the older ones far back, so they never pass for the newest (Stefano), each fainter down to a floor. */
function aged(age: number): { opacity: number; }
{
    return { opacity: age === 0 ? 1 : Math.max(0.2, 0.4 - (age - 1) * 0.1) };
}

/**
 * A list that never scrolls: a bubble that does not fit whole in it is hidden, the oldest first since the newest sit by the card, and shows again when the
 * window grows.
 */
function useOnlyWhole(list: RefObject<HTMLElement>, lines: readonly string[], newestFirst = false): void
{
    useLayoutEffect(() => {
        const element = list.current;

        if (element === null) {
            return;
        }

        const fit = (): void => {
            const box = element.getBoundingClientRect();
            const newest = newestFirst ? element.firstElementChild : element.lastElementChild;

            for (const item of element.children) {
                const place = item.getBoundingClientRect();
                const style = (item as HTMLElement).style;
                // The newest never hides: one longer than the column, as a note with the helps on (D-78), scrolls in itself.
                style.maxHeight = item === newest ? box.height + "px" : "";
                style.overflowY = item === newest && item.scrollHeight > box.height ? "auto" : "";
                style.visibility = item === newest || (place.top >= box.top - 1 && place.bottom <= box.bottom + 1) ? "" : "hidden";
            }
        };

        fit();
        const observer = new ResizeObserver(fit);
        observer.observe(element);
        return () => observer.disconnect();
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
