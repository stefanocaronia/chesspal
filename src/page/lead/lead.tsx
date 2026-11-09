// Who is ahead as the AI estimates it (D-90): a two-colour bar in the game's card, with the helps on and in analysis, and in analysis a chart of the game,
// as chess.com draws them, that goes to the move clicked. The page draws the AI's figures, never computes them (D-6, D-19).
import { FoldButton, useCardFold } from "../game/card-fold.tsx";
import type { Ply } from "../game/plies.ts";
import type { Text } from "../text.ts";
import { chartBadges, sideAhead, type Standing } from "./view.ts";

/**
 * The bar: White's share from the left, Black's from the right, with the figure on the side ahead; even and bare before the first estimate, so that the card
 * keeps its lines in place, and faded on a position after the one estimated (Zoe, review of T-148).
 */
export function LeadBar({ standing, shown, text }: { standing: Standing | undefined; shown: number; text: Text; })
{
    const ahead = standing === undefined ? undefined : sideAhead(standing);
    const earlier = standing !== undefined && standing.plies < shown;
    const said = standing === undefined ? text.lead.none : `${spoken(standing, text)}${earlier ? `. ${text.lead.earlier}` : ""}`;
    return (
        <div class={`lead-bar${earlier ? " earlier" : ""}`} role="img" aria-label={said} title={`${said}. ${text.lead.hint}`}>
            <span class="white" style={{ width: `${((standing?.share ?? 0) + 1) * 50}%` }} />
            {standing === undefined ? null : <span class={`figure ${ahead ?? "even"}`} aria-hidden="true">{figure(standing, text)}</span>}
        </div>
    );
}

/**
 * The chart of the game in analysis, in a card that folds: White's share as the white area, the moves marked by a badge as dots, kept whole inside its
 * edges, the move shown as a line.
 */
export function LeadChart({ plies, standings, shown, onShow, text }: { plies: readonly Ply[]; standings: readonly Standing[]; shown: number; onShow: (plies: number) => void; text: Text; })
{
    const [folded, fold] = useCardFold("chart");
    const width = Math.max(plies.length, 1);
    const heightOf = (share: number) => 1 - share;
    const first = standings[0];
    const last = standings.at(-1);

    if (first === undefined || last === undefined) {
        return null;
    }

    // From the first estimate at the start, as the chart has nothing before it, to the last move estimated.
    const line = [`M0 ${heightOf(first.share)}`, ...standings.map(({ plies: at, share }) => `L${at} ${heightOf(share)}`)].join(" ");
    const area = `${line} L${last.plies} 2 L0 2 Z`;
    const dots = plies.flatMap((ply, index) => {
        const badge = ply.review?.badge;
        const at = standings.find((standing) => standing.plies === index + 1);
        return badge === undefined || at === undefined || !chartBadges.has(badge) ? [] : [{ badge, at }];
    });

    const go = (event: MouseEvent): void => {
        const box = (event.currentTarget as HTMLElement).getBoundingClientRect();
        onShow(Math.round(((event.clientX - box.left) / box.width) * width));
    };

    return (
        <section class={`card lead-card${folded ? " folded" : ""}`}>
            <h3 class="card-title">
                <FoldButton folded={folded} onFold={fold} text={text}>
                    <ChartIcon />
                    {text.lead.chart}
                </FoldButton>
            </h3>
            {folded ? null : (
                <div class="lead-chart" role="img" aria-label={text.lead.chartHint} title={text.lead.chartHint} onClick={go}>
                    <svg viewBox={`0 0 ${width} 2`} preserveAspectRatio="none" aria-hidden="true">
                        <path class="white-area" d={area} />
                        {/* The moves not estimated yet, while the AI goes over the game: grey, never Black's (Zoe, review of T-148) */}
                        {last.plies < width ? <rect class="pending" x={last.plies} y="0" width={width - last.plies} height="2" /> : null}
                        <path class="even" d={`M0 1 L${width} 1`} vector-effect="non-scaling-stroke" />
                    </svg>
                    <span class="shown" style={{ left: inside((shown / width) * 100, 2) }} aria-hidden="true" />
                    {dots.map(({ badge, at }) => (
                        <span
                            key={at.plies}
                            class={`dot ${badge}`}
                            style={{ left: inside((at.plies / width) * 100, 6), top: inside((heightOf(at.share) / 2) * 100, 6) }}
                            aria-hidden="true"
                        />
                    ))}
                </div>
            )}
        </section>
    );
}

/** A place along the chart, in percent, kept whole inside its edges by so many pixels. */
function inside(percent: number, pixels: number): string
{
    return `clamp(${pixels}px, ${percent}%, calc(100% - ${pixels}px))`;
}

/** The figure on the bar, as chess.com writes it: the pawns ahead, #3 for a mate seen, the result once the board ended the game, as the game's card writes it. */
function figure(standing: Standing, text: Text): string
{
    const { lead, mated, drawn } = standing;

    if (mated !== undefined) {
        return mated === "black" ? "1–0" : "0–1";
    }

    if (drawn) {
        return "½–½";
    }

    if (lead === undefined) {
        return "";
    }

    return "mate" in lead ? `#${Math.abs(lead.mate)}` : pawnsText(Math.abs(lead.pawns), text);
}

/** What a screen reader and the tooltip say of who is ahead. */
function spoken(standing: Standing, text: Text): string
{
    const { lead, mated, drawn } = standing;
    const ahead = sideAhead(standing);

    if (mated !== undefined) {
        return text.lead.mated(mated);
    }

    if (drawn) {
        return text.lead.drawn;
    }

    if (lead === undefined || ahead === undefined) {
        return text.lead.even;
    }

    return "mate" in lead ? text.lead.mate(ahead, Math.abs(lead.mate)) : text.lead.ahead(ahead, pawnsText(Math.abs(lead.pawns), text));
}

/** Pawns with one decimal, as the player's language writes them. */
function pawnsText(pawns: number, text: Text): string
{
    return pawns.toLocaleString(text.language, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

function ChartIcon()
{
    return (
        <svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M3 12H21M3 17L8 9L12 14L16 6L21 11" />
        </svg>
    );
}
