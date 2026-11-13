// How far a review has got (D-69), as the analyst works.
import type { ReviewCount } from "./plies.ts";

/**
 * The line that says the analyst works, and under it a thin bar with the count, 12/33: a bar that runs back and forth before the first move is said, full
 * and breathing while the word on the whole game is written; still, in the soft ink, when the review stopped unfinished.
 */
export function ReviewProgress({ count, label, stopped = false }: { count: ReviewCount; label: string; stopped?: boolean; })
{
    const { done, total } = count;
    const started = done > 0;
    const state = stopped ? " stopped" : !started ? " waiting" : done >= total ? " writing" : "";

    return (
        <span
            class={`review-progress${state}`}
            role="progressbar"
            aria-label={label}
            aria-valuemin={0}
            aria-valuemax={total}
            {...(started || stopped ? { "aria-valuenow": done, "aria-valuetext": `${done}/${total}` } : {})}
        >
            <span class="track" aria-hidden="true">
                <span class="fill" style={started ? { width: `${(100 * done) / Math.max(total, 1)}%` } : undefined} />
            </span>
            {started || stopped ? <span class="count" aria-hidden="true">{done}/{total}</span> : null}
        </span>
    );
}
