// The talk on the board page (D-51, D-53): one thread of the AI's words and the player's in the order said, the box to write in under it, and the AI's note
// on the move shown of a game in analysis.
import { type ComponentChildren, createContext, type RefObject } from "preact";
import { useContext, useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import type { MoveReview, Opening, Side } from "../../core/index.ts";
import { Torretta } from "../avatars/torretta.tsx";
import { BadgeIcon, NoteIcon } from "../game/badges.tsx";
import { Figurines, ForkIcon } from "../game/move-list.tsx";
import { type Ply, type ReviewCount, type SentVariation, talkLimits, type TalkLine, type ThreadItem } from "../game/plies.ts";
import { ReviewProgress } from "../game/review-progress.tsx";
import { signature } from "../players/model-name.ts";
import type { Text } from "../text.ts";
import { hasVoice, hush, onReading, type Reading, reading, skip, speak, type Voice } from "./voice.ts";

/**
 * The talk as one thread, as a chat app shows it: the AI's bubbles on the left, the player's on the right, the newest at the foot, each group's last with a
 * tail; in the corner the move the words go with, when it changes, and how far the player's last line got. It follows the newest unless the player scrolled up
 * to read; then a button takes them down. In analysis each line of the player's names in its corner the move it was written on instead (D-101).
 */
export function Thread({ items, voice, name, about, text }: {
    items: readonly ThreadItem[];
    /** The voice that reads aloud the AI's words added while the page is open, when the player wants it. */
    voice?: Voice;
    name: string;
    about?: About;
    text: Text;
})
{
    const list = useRef<HTMLOListElement>(null);
    const said = items.filter((item) => item.who === "ai").map((item) => item.text);
    useSpokenNews(said, voice);
    const read = useReading(voice);
    const { moreAbove, moreBelow, away, unseen, toNewest } = useNewestInSight(list, items);
    const lastWritten = items.findLastIndex((item) => item.who === "player");
    let spoken = -1;

    return (
        <div class="thread-box">
            <ol ref={list} class={`thread${moreAbove ? " more-above" : ""}${moreBelow ? " more-below" : ""}`} aria-live="polite">
                {items.map((item, index) => {
                    const last = items[index + 1]?.who !== item.who;
                    const corner = (
                        <Corner
                            place={cornerPlace(item, about, text)}
                            status={index === lastWritten ? <Status heard={item.line?.heard} name={name} text={text} /> : null}
                        />
                    );

                    if (item.who === "ai") {
                        spoken++;
                        return (
                            <li key={index} class={last ? "from-ai last" : "from-ai"}>
                                <p class="say">
                                    <SkipReading at={wordKey(spoken, item.text)} read={read} voice={voice} />
                                    <Marked text={item.text} />
                                    {corner}
                                </p>
                            </li>
                        );
                    }

                    return (
                        <li key={index} class={last ? "from-player last" : "from-player"}>
                            <p class="said">
                                {item.text}
                                {corner}
                            </p>
                        </li>
                    );
                })}
            </ol>
            {away
                ? (
                    <button type="button" class="to-newest" title={unseen ? text.newMessages : text.toNewest} aria-label={unseen ? text.newMessages : text.toNewest} onClick={toNewest}>
                        <svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
                            <path d="M12 5V19M6 13L12 19L18 13" />
                        </svg>
                        {unseen ? <span class="dot" aria-hidden="true" /> : null}
                    </button>
                )
                : null}
        </div>
    );
}

/**
 * The AI's word on the move shown of a game in analysis (D-69), in bubbles under the AI's card, pointing at it: the move, its badge by name, and its note
 * when it wrote one; read out as the player steps through the game.
 */
export function AiNote({ ply, opening, closing, summary, reviewing, count, onComplete, name, by, voice, text }: {
    ply?: Ply;
    opening?: Opening;
    closing?: string;
    summary?: string;
    /** The AI is still reviewing the game: the note says so too. */
    reviewing?: true;
    /** How far the review has got, under the line that says the AI reviews, or that the review is not complete. */
    count?: ReviewCount;
    /** Nobody is finishing the review: the note says so, with the button that brings the game back to the AI (D-109). */
    onComplete?: () => void;
    name: string;
    /** Who made the analysis (D-81), signed at the note's foot only when it is not the model that played the game. */
    by?: { annotator: string; effort?: string; } | undefined;
    /** The voice that reads the note aloud, when the player wants it. */
    voice?: Voice;
    text: Text;
})
{
    // On a move of the book without the AI's note, the AI reports what the book says: the opening in the title, the variation under it.
    const book = ply?.review?.note === undefined ? opening : undefined;
    const shown: MoveReview | undefined = ply?.review ?? (book === undefined ? undefined : { badge: "book" });
    const title = [shown?.badge === undefined || (book !== undefined && shown.badge === "book") ? undefined : text.badges[shown.badge], book?.family].filter((part) => part !== undefined).join(" · ");
    const note = shown?.note ?? book?.variation;
    // Each bubble read on its own, so the mark that skips one sits on the one read: the move's, the game's review, the end.
    const moveWords = ply === undefined || shown === undefined ? "" : [title, note].filter((part) => part !== undefined && part !== "").join(". ");
    const spoken: Reading[] = [
        { key: `move:${moveWords}`, words: moveWords },
        { key: `review:${summary ?? ""}`, words: summary?.replace(/\s*•\s+/g, ". ") ?? "" },
        { key: `closing:${closing ?? ""}`, words: closing ?? "" },
    ];
    const keys = spoken.map((part) => part.key).join("\n");
    const read = useReading(voice);
    const box = useRef<HTMLDivElement>(null);
    const moreBelow = useMoreBelow(box);

    useEffect(() => {
        if (voice !== undefined) {
            speak(spoken, voice);
        }

        return hush;
    }, [keys, voice]);

    return (
        <div ref={box} class={moreBelow ? "ai-note more-below" : "ai-note"} aria-live="polite">
            {ply === undefined || shown === undefined ? null : (
                <p class={`say move-note ${shown.badge ?? ""}`}>
                    <SkipReading at={spoken[0]!.key} read={read} voice={voice} />
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
                    {shown.arrows === undefined && shown.squares === undefined ? null : <Legend review={shown} words={text.drawn} />}
                </p>
            )}
            {summary === undefined ? null : <GameReview by={name} summary={summary} skipping={<SkipReading at={spoken[1]!.key} read={read} voice={voice} />} text={text} />}
            {closing === undefined ? null : (
                <p class="say closing">
                    <SkipReading at={spoken[2]!.key} read={read} voice={voice} />
                    <Marked text={closing} />
                </p>
            )}
            {reviewing === true
                ? (
                    <div class="say reviewing">
                        <p role="status">{text.reviewing(name)}</p>
                        {count === undefined ? null : <ReviewProgress count={count} label={text.reviewing(name)} />}
                    </div>
                )
                : null}
            {onComplete === undefined ? null : (
                <div class="say incomplete">
                    <p>
                        <span role="status">{text.incomplete}</span>
                        <button type="button" title={text.completeHint} aria-label={text.completeHint} onClick={onComplete}>{text.complete}</button>
                    </p>
                    {count === undefined || count.done === 0 ? null : <ReviewProgress count={count} label={text.incomplete} stopped />}
                </div>
            )}
            {by === undefined ? null : <p class="by">{text.noteBy(signature(by.annotator, by.effort))}</p>}
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

/** Where the pointer is among the squares and moves in the AI's words: the board lights that square up. */
export const PointSquare = createContext<(square: string | undefined) => void>(() => undefined);

// **a few words** the AI put in bold, as Markdown writes them.
const boldWords = /\*\*(.+?)\*\*/;

// A square or a move in SAN or with the pieces' figurines (D-86, D-87), with its number if it has one; the capture group keeps it in split's parts.
const boardWords = /(?<![\p{L}\d])((?:\d+\.(?:\.\.)?\s?)?(?:O-O(?:-O)?|[KQRBN♔-♟]?[a-h]?[1-8]?x?[a-h][1-8](?:=[QRBN♔-♟])?)[+#]?[!?]{0,2})(?![\p{L}\d])/u;

/**
 * What the colours drawn with a note or the coach's hint mean, the ones it uses, in the words of who drew them: the legend, for the player (D-69, Zoe).
 */
export function Legend({ review, words }: { review: Pick<MoveReview, "arrows" | "squares">; words: Text["drawn"]; })
{
    const used = [...new Set([...(review.arrows ?? []), ...(review.squares ?? [])].map((drawn) => drawn.colour))];

    return (
        <span class="legend">
            {used.map((colour) => (
                <span key={colour} class={colour}>
                    <i aria-hidden="true" />
                    {words[colour]}
                </span>
            ))}
        </span>
    );
}

/**
 * In analysis (D-101): the move shown, which the words go with, none at the start; going back to the move a line of the player's was written on, and putting
 * back on the board the variation it was written on (D-116).
 */
export interface About
{
    readonly ply?: Ply;
    readonly onShow: (at: number) => void;
    readonly onLine: (variation: SentVariation) => void;
}

/**
 * The box the player writes in: Enter or the button sends the words alone, the next move takes them with it. 200 characters from one move of the AI's to
 * the next: once they are written, the box goes until its move (D-54). In analysis it says the move the words go with (D-101).
 */
export function Compose({ spent, draft, onDraft, onSend, canMove, name, problem, about, text }: {
    spent: number;
    draft: string;
    onDraft: (draft: string) => void;
    onSend: () => void;
    canMove: boolean;
    name: string;
    problem?: string;
    about?: About;
    text: Text;
})
{
    const left = talkLimits.line - spent;
    const blank = draft.trim() === "";
    const prompt = about === undefined ? text.writeTo(name) : text.askAbout(name);

    const submit = (): void => {
        if (!blank) {
            onSend();
        }
    };

    if (left <= 0) {
        return null;
    }

    return (
        <form
            class={about === undefined ? "compose" : "compose asking"}
            onSubmit={(event) => {
                event.preventDefault();
                submit();
            }}
        >
            <p class="limit" role="status">{problem ?? ""}</p>
            <textarea
                rows={2}
                maxLength={left}
                placeholder={prompt}
                aria-label={prompt}
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
                    : <span class="hint">{about === undefined ? !blank && canMove ? text.withMove : "" : <OnMove ply={about.ply} text={text} />}</span>}
                <button class="send" type="submit" disabled={blank}>
                    {text.send}
                    <svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M5 12H18M13 7L18 12L13 17" />
                    </svg>
                </button>
            </div>
        </form>
    );
}

/**
 * The talk narrowed to a card beside the board: the Torretta above, the player below, each with their name and side written down the card, a ring on
 * whoever moves and a dot on the Torretta when the AI spoke meanwhile.
 */
export function TalkFaces({ name, aiPicture, you, picture, ai, player, aiMoves, playerMoves, unread, text }: {
    name: string;
    /** The picture above, the Torretta's but for a game in analysis played by others (D-69). */
    aiPicture?: ComponentChildren;
    /** The player's name and picture. */
    you: string;
    picture: ComponentChildren;
    /** The sides, none between games. */
    ai?: Side;
    player?: Side;
    aiMoves: boolean;
    playerMoves: boolean;
    unread: boolean;
    text: Text;
})
{
    return (
        <div class="faces">
            <RailPlayer place="ai" picture={aiPicture ?? <Torretta size={40} bust />} name={name} {...(ai === undefined ? {} : { side: text.sides[ai] })} moves={aiMoves} unread={unread} />
            <RailPlayer place="you" picture={picture} name={you} {...(player === undefined ? {} : { side: text.sides[player] })} moves={playerMoves} />
        </div>
    );
}

/**
 * In a bubble's corner, small: the move the words go with, or in analysis where the player's line was written, and the mark of how far the player's last
 * line got.
 */
function Corner({ place, status }: { place: ComponentChildren; status: ComponentChildren; })
{
    if (place === null && status === null) {
        return null;
    }

    return (
        <span class="corner">
            {place}
            {status}
        </span>
    );
}

/** What a bubble's corner names: in a game the move the words go with, when it changed; in analysis where the player's line was written, none at the start. */
function cornerPlace(item: ThreadItem, about: About | undefined, text: Text): ComponentChildren
{
    if (about === undefined) {
        return item.move === undefined ? null : <CornerMove move={item.move} />;
    }

    const shown = item.line?.shown;
    return shown?.move === undefined && shown?.variation === undefined ? null : <ShownPlace shown={shown} about={about} text={text} />;
}

/** The move the words go with, as the move list writes it, its pieces in the words' colour: the number already says the side. */
function CornerMove({ move }: { move: Ply; })
{
    return (
        <span class="corner-move">
            <span class="visually-hidden">{move.number}{move.side === "white" ? "." : "..."}{move.san}</span>
            <span aria-hidden="true">
                <span class="move-number">{move.number}{move.side === "white" ? "." : "..."}</span>
                <Figurines san={move.san} side={move.side} mono />
            </span>
        </span>
    );
}

/** Where a line of the player's was written: on a variation the board showed, its mark; else the game's move, none at the start. */
function ShownPlace({ shown, about, text }: { shown: TalkLine["shown"]; about: About; text: Text; })
{
    const variation = shown?.variation;

    if (variation?.move !== undefined) {
        return <ShownLine variation={variation} onShow={() => about.onLine(variation)} text={text} />;
    }

    return (
        <>
            {shown?.move === undefined ? null : <ShownMove move={shown.move} onShow={() => about.onShow(shown.at)} text={text} />}
            {variation === undefined ? null : <ShownLine variation={variation} onShow={() => about.onLine(variation)} text={text} />}
        </>
    );
}

/**
 * The variation a line of the player's was written on, small in the line's corner: the fork's sign in the accent and the move the board showed, none when
 * it was set aside; a press puts the variation back on the board (D-116).
 */
function ShownLine({ variation, onShow, text }: { variation: SentVariation; onShow: () => void; text: Text; })
{
    const { move } = variation;
    const label = text.variation.show(variation.text);
    const [, number = "", san = ""] = /^(\d+\.+)(.+)$/.exec(move ?? "") ?? [];

    return (
        <button type="button" class="shown-move shown-line" title={label} aria-label={label} onClick={onShow}>
            <ForkIcon />
            {move === undefined ? null : (
                <>
                    <span class="move-number">{number}</span>
                    <Figurines san={san} side={number.endsWith("...") ? "black" : "white"} mono />
                </>
            )}
        </button>
    );
}

/** The move a line of the player's was written on, 14.♘f3, small in the line's corner: a press shows it on the board again (Zoe). */
function ShownMove({ move, onShow, text }: { move: string; onShow: () => void; text: Text; })
{
    const [, number = "", san = move] = /^(\d+\.+)(.+)$/.exec(move) ?? [];

    return (
        <button type="button" class="shown-move" title={text.goTo(move)} aria-label={text.goTo(move)} onClick={onShow}>
            <span class="move-number">{number}</span>
            <Figurines san={san} side={number.endsWith("...") ? "black" : "white"} mono />
        </button>
    );
}

/** What the words go with in analysis: the move shown, or the whole game at its start. */
function OnMove({ ply, text }: { ply: Ply | undefined; text: Text; })
{
    if (ply === undefined) {
        return <>{text.onWholeGame}</>;
    }

    return (
        <>
            {text.onMove} <span class="move-number">{ply.number}{ply.side === "white" ? "." : "..."}</span>
            <Figurines san={ply.san} side={ply.side} />
        </>
    );
}

function OnBoard({ text }: { text: string; })
{
    const point = useContext(PointSquare);
    return (
        <>
            {text.split(boardWords).map((part, index) =>
                index % 2 === 1
                    ? (
                        <b key={index} class="on-board" onPointerEnter={() => point(squareIn(part))} onPointerLeave={(event) => event.pointerType === "mouse" && point(undefined)}>
                            <Takes move={part} />
                        </b>
                    )
                    : part
            )}
        </>
    );
}

/** A move with its capture's x light, as the move list writes it: the piece and the squares stand out (Stefano, for readers with ADHD). */
function Takes({ move }: { move: string; })
{
    return <>{move.split("x").map((part, index) => index === 0 ? part : [<span key={index} class="takes">x</span>, part])}</>;
}

/** The square a word names: a square, or where a move goes, the last square in it; none for a castling. */
function squareIn(word: string): string | undefined
{
    return /[a-h][1-8](?!.*[a-h][1-8])/.exec(word)?.[0];
}

/** The AI's word on the whole game (D-69), in the Torretta's bubble at the start of the game: a paragraph, and its points as a list. */
function GameReview({ by, summary, skipping, text }: { by: string; summary: string; skipping: ComponentChildren; text: Text; })
{
    const [lead = "", ...points] = summary.split(/\s*•\s+/);

    return (
        <section class="say review" aria-label={text.reviewBy(by)}>
            {/* The mark that skips the reading sits in the title's line, at its end: the review is a grid, where a float would be a row of its own */}
            <p class="head">
                <svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M12 4V20M8 20H16M5 7H19M5 7L2.5 13A2.5 2 0 0 0 7.5 13ZM19 7L16.5 13A2.5 2 0 0 0 21.5 13Z" />
                </svg>
                {text.reviewBy(by)}
                {skipping}
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

function RailPlayer({ place, picture, name, side, moves, unread = false }: {
    place: "ai" | "you";
    picture: ComponentChildren;
    name: string;
    side?: string;
    moves: boolean;
    unread?: boolean;
})
{
    return (
        <div class={`rail-player ${place}${moves ? " moving" : ""}`}>
            <span class={`face${unread ? " unread" : ""}`}>{picture}</span>
            <span class="rail-name">
                {name} {side === undefined ? null : <span class="note">· {side}</span>}
            </span>
        </div>
    );
}

/** Reads aloud each word the AI adds while the page is open, not those already there, a bubble after the other; the voice turned off stops it. */
function useSpokenNews(words: readonly string[], voice: Voice | undefined): void
{
    const heard = useRef(words.length);
    const speaking = voice !== undefined;

    useEffect(() => {
        if (voice !== undefined && words.length > heard.current) {
            speak(words.slice(heard.current).map((word, index) => ({ key: wordKey(heard.current + index, word), words: word })), voice);
        }

        heard.current = words.length;
    }, [words.length, voice]);

    useEffect(() => speaking ? hush : undefined, [speaking]);
}

/** A word of the AI's by its place in the game and its text, so a word of another game in the same place is not taken for it. */
function wordKey(index: number, word: string): string
{
    return `${index}:${word}`;
}

/** The key of the bubble the voice reads, none while it reads nothing or is off. */
function useReading(voice: Voice | undefined): string | undefined
{
    const [key, setKey] = useState(reading);
    useEffect(() => onReading(setKey), []);
    return voice === undefined ? undefined : key;
}

/**
 * In the corner of a bubble the voice may read, a mark that stops reading it while it is read, and the next goes on; its room is kept while the voice is on,
 * so the words never move when it comes and goes.
 */
function SkipReading({ at, read, voice }: { at: string; read: string | undefined; voice: Voice | undefined; })
{
    if (voice === undefined || (read !== at && !hasVoice(voice.language))) {
        return null;
    }

    if (read !== at) {
        return <span class="skip-reading" aria-hidden="true" />;
    }

    return (
        <button type="button" class="skip-reading" title={voice.skipReading} aria-label={voice.skipReading} onClick={() => skip(at)}>
            <svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M5 7L12 12L5 17ZM12 7L19 12L12 17ZM19 6.5V17.5" />
            </svg>
        </button>
    );
}

/**
 * Keeps the newest bubble in sight: on a new one, or when the column changes height, the thread goes to its foot, unless the player has scrolled up to read;
 * then the button that takes them down shows, with a dot once a new bubble came meanwhile. Says too whether there is more above and below, for the fades.
 */
function useNewestInSight(list: RefObject<HTMLElement>, items: readonly ThreadItem[]): {
    moreAbove: boolean;
    moreBelow: boolean;
    away: boolean;
    unseen: boolean;
    toNewest: () => void;
}
{
    const awayNow = useRef(false);
    const [moreAbove, setMoreAbove] = useState(false);
    const [moreBelow, setMoreBelow] = useState(false);
    const [away, setAway] = useState(false);
    const [unseen, setUnseen] = useState(false);
    const newest = items.at(-1);

    const toNewest = (): void => {
        const element = list.current;

        if (element !== null) {
            element.scrollTop = element.scrollHeight;
        }
    };

    const measure = (): void => {
        const element = list.current;

        if (element === null) {
            return;
        }

        const below = element.scrollHeight - element.scrollTop - element.clientHeight;
        awayNow.current = below > awayBy;
        setAway(awayNow.current);
        setMoreAbove(element.scrollTop > 1);
        setMoreBelow(below > 1);

        if (!awayNow.current) {
            setUnseen(false);
        }
    };

    useEffect(() => {
        const element = list.current;

        if (element === null) {
            return;
        }

        const follow = (): void => {
            if (!awayNow.current) {
                toNewest();
            }

            measure();
        };

        element.addEventListener("scroll", measure, { passive: true });
        const observer = new ResizeObserver(follow);
        observer.observe(element);

        return () => {
            element.removeEventListener("scroll", measure);
            observer.disconnect();
        };
    }, [list]);

    // The player's own line always brings them down to it.
    useLayoutEffect(() => {
        if (!awayNow.current || newest?.who === "player") {
            toNewest();
        } else {
            setUnseen(true);
        }

        measure();
    }, [items.length, newest?.text]);

    return { moreAbove, moreBelow, away, unseen, toNewest };
}

/** Whether a box that scrolls has more below what it shows, for the fade at its foot: measured as it scrolls, changes size or shows something else. */
function useMoreBelow(box: RefObject<HTMLElement>): boolean
{
    const [moreBelow, setMoreBelow] = useState(false);

    const measure = (): void => {
        const element = box.current;

        if (element !== null) {
            setMoreBelow(element.scrollHeight - element.scrollTop - element.clientHeight > 1);
        }
    };

    useLayoutEffect(measure);

    useEffect(() => {
        const element = box.current;

        if (element === null) {
            return;
        }

        element.addEventListener("scroll", measure, { passive: true });
        const observer = new ResizeObserver(measure);
        observer.observe(element);

        return () => {
            element.removeEventListener("scroll", measure);
            observer.disconnect();
        };
    }, [box]);

    return moreBelow;
}

/** How far above its foot the player may have scrolled the thread and still follow the newest, in pixels. */
const awayBy = 48;

/**
 * Under the player's last line, a mark with its words as title: one check once written, two once the AI has read it; once it has answered, its answer says it and
 * the mark leaves, its room kept so the line does not move.
 */
function Status({ heard, name, text }: { heard: TalkLine["heard"]; name: string; text: Text; })
{
    if (heard === "answered") {
        return <span class="status" aria-hidden="true" />;
    }

    const read = heard === "read";
    const label = read ? text.readBy(name) : text.sent;
    return (
        <span class={read ? "status read" : "status"} role="img" title={label} aria-label={label}>
            <svg class="icon" viewBox="0 0 21 24" aria-hidden="true">
                {read ? <path d="M2 12.5L6 16.5L13.5 8M10 15.5L11 16.5L18.5 8" /> : <path d="M3.5 12.5L7.5 16.5L15 8" />}
            </svg>
        </span>
    );
}
