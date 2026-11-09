// The badges the AI puts on the moves of a game it reviews (D-69): a disc in the badge's colour with its sign, drawn by us. One drawing for the move list
// (16px) and the corner of a square (about 28px); the colours are the page's --badge-* variables, for the light and the dark theme.
import type { JSX } from "preact";
import { type Badge, badges, type Side } from "../../core/index.ts";
import type { Ply } from "./plies.ts";

/** A move's badge, as an inline SVG of class `move-badge`: 16px in a line of text, a third of the square in a `.square`. With a title it is an image with
 * that name; without, it is hidden from screen readers, for the text beside it to say it. */
export function BadgeIcon({ badge, title }: { badge: Badge; title?: string; })
{
    return (
        <svg class={`move-badge ${badge}`} viewBox="0 0 20 20" role={title === undefined ? undefined : "img"} aria-label={title} aria-hidden={title === undefined ? "true" : undefined}>
            {title === undefined ? null : <title>{title}</title>}
            <circle cx="10" cy="10" r="10" style={{ fill: `var(--badge-${badge})` }} />
            <g style={{ color: `var(--badge-${badge}-ink, var(--badge-ink))` }} fill="currentColor" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
                {sign(badge)}
            </g>
        </svg>
    );
}

/** A move the AI wrote a note on without a badge: a grey disc with a speech bubble, a word and not a judgment. */
export function NoteIcon({ title }: { title?: string; })
{
    return (
        <svg class="move-badge note" viewBox="0 0 20 20" role={title === undefined ? undefined : "img"} aria-label={title} aria-hidden={title === undefined ? "true" : undefined}>
            {title === undefined ? null : <title>{title}</title>}
            <circle cx="10" cy="10" r="10" style={{ fill: "var(--badge-note)" }} />
            <path d="M5.5 6.5H14.5V12H9.5L6.8 14.4V12H5.5Z" fill="var(--badge-ink)" stroke="var(--badge-ink)" stroke-width="1" stroke-linejoin="round" />
        </svg>
    );
}

/** How many moves of one side carry each badge, from the best to the worst, those with none left out (D-69): the AI's badges counted, never judged. */
export function BadgeCounts({ plies, side, names }: { plies: readonly Ply[]; side: Side; names: Readonly<Record<Badge, string>>; })
{
    const counted = badges.map((badge) => [badge, plies.filter((ply) => ply.side === side && ply.review?.badge === badge).length] as const).filter(([, count]) => count > 0);

    return counted.length === 0 ? null : (
        <ul class="badge-counts">
            {counted.map(([badge, count]) => (
                <li key={badge} title={names[badge]}>
                    <BadgeIcon badge={badge} />
                    <span class="visually-hidden">{names[badge]}:</span> {count}
                </li>
            ))}
        </ul>
    );
}

/** The sign on a badge's disc: the glyphs !! ! ?! ? ?? where chess has them, our own drawings for the others: a star, two ticks and one, an open book, and the target that was there. */
function sign(badge: Badge): JSX.Element
{
    switch (badge) {
        case "brilliant":
            return <>{bang(7.2)}{bang(12.8)}</>;
        case "great":
            return bang(10);
        case "best":
            return <path d="M10 4.1L11.6 8.3L16 8.5L12.6 11.3L13.8 15.6L10 13.1L6.2 15.6L7.4 11.3L4 8.5L8.4 8.3Z" stroke-width="1.2" />;
        case "excellent":
            return <path d="M5.4 8L8.6 11L14.6 5.2M5.4 12.2L8.6 15.2L14.6 9.4" fill="none" stroke-width="2" />;
        case "good":
            return <path d="M5.6 10.4L8.6 13.4L14.4 7.3" fill="none" stroke-width="2.6" />;
        case "book":
            return <path d="M9.3 6.4C7.9 5.4 6.1 5 4.3 5.2V14.2C6.1 14 7.9 14.4 9.3 15.4ZM10.7 6.4C12.1 5.4 13.9 5 15.7 5.2V14.2C13.9 14 12.1 14.4 10.7 15.4Z" stroke-width="0.8" />;
        case "inaccuracy":
            return <>{query(7.3, 1.9, 2.3)}{bang(13.2, 2.4)}</>;
        case "mistake":
            return query(10, 2.9, 2.6);
        case "miss":
            return (
                <>
                    <circle cx="10" cy="10" r="4.9" fill="none" stroke-width="2" />
                    <circle cx="10" cy="10" r="1.7" stroke="none" />
                </>
            );
        case "blunder":
            return <>{query(6.5, 1.7, 2.1)}{query(13.5, 1.7, 2.1)}</>;
    }
}

/** An exclamation mark centred on x: a bar and its dot. */
function bang(x: number, width = 2.8): JSX.Element
{
    return (
        <>
            <path d={`M${x} 4.6V10.9`} fill="none" stroke-width={width} />
            <circle cx={x} cy="15.2" r={width * 0.56} stroke="none" />
        </>
    );
}

/** A question mark centred on x, its hook as wide as twice the half width given: a curl and its dot. */
function query(x: number, half: number, width: number): JSX.Element
{
    const hook = `M${x - half} 6.9C${x - half} 5.1 ${x - half * 0.5} 4.2 ${x} 4.2C${x + half * 0.6} 4.2 ${x + half} 5.1 ${x + half} 6.7C${x + half} 8.7 ${x} 9 ${x} 10.9`;
    return (
        <>
            <path d={hook} fill="none" stroke-width={width} />
            <circle cx={x} cy="15.2" r={width * 0.6} stroke="none" />
        </>
    );
}
