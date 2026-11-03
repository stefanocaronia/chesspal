// The game's column on the right of the board (D-53): when the game started, its move, the moves; the player may fold it into a tab, as this browser remembers.
import type { ComponentChildren } from "preact";
import { useEffect, useRef } from "preact/hooks";
import { MoveList } from "./move-list.tsx";
import type { Ply } from "./plies.ts";
import type { Text } from "./text.ts";

const remembered = "chesspal-column";

/** The column folded as this browser left it, else folded where three columns would leave the board small. */
export function startFolded(): boolean
{
    let chosen: string | null = null;

    try {
        chosen = localStorage.getItem(remembered);
    } catch {
        // A browser that keeps nothing for the page: the width decides.
    }

    return chosen === "folded" || (chosen !== "open" && matchMedia("(min-width: 841px) and (max-width: 1099px)").matches);
}

/** Remembers whether the player folded the column. */
export function rememberFolded(folded: boolean): void
{
    try {
        localStorage.setItem(remembered, folded ? "folded" : "open");
    } catch {
        // The choice lasts as long as the page.
    }
}

/** The column and the tab it folds into: the page's class shows one of them, and a phone always the column, under the board. */
export function GameColumn({ plies, result, started, move, folded, onFold, text }: {
    plies: readonly Ply[];
    result?: string;
    started?: string;
    move: number;
    folded: boolean;
    onFold: (folded: boolean) => void;
    text: Text;
})
{
    const foldButton = useRef<HTMLButtonElement>(null);
    const tab = useRef<HTMLButtonElement>(null);
    const clicked = useRef(false);

    // The button clicked hides: the keyboard goes on from the one shown in its place.
    useEffect(() => {
        if (clicked.current) {
            clicked.current = false;
            (folded ? tab : foldButton).current?.focus();
        }
    }, [folded]);

    const fold = (away: boolean): void => {
        clicked.current = true;
        onFold(away);
    };

    const when = started === undefined ? "" : new Date(started).toLocaleString(text.language, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

    return (
        <>
            <aside class="side" id="game" aria-label={text.game}>
                <div class="side-head">
                    <h2>{text.game}</h2>
                    <button ref={foldButton} class="fold" type="button" title={text.fold} aria-label={text.fold} aria-controls="game" aria-expanded="true" onClick={() => fold(true)}>
                        <Icon>
                            <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
                            <path d="M14.5 4.5V19.5M8 9.5L10.5 12L8 14.5" />
                        </Icon>
                    </button>
                </div>
                {started === undefined ? <p class="card empty">{text.noGame}</p> : (
                    <>
                        <dl class="card game-card">
                            <div>
                                <dt>{text.started}</dt>
                                <dd>{when}</dd>
                            </div>
                            <div>
                                <dt>{text.move}</dt>
                                <dd>{move}</dd>
                            </div>
                        </dl>
                        <MoveList plies={plies} result={result} text={text} />
                    </>
                )}
            </aside>
            <div class="tab-away">
                <button ref={tab} class="tab" type="button" title={text.unfold} aria-label={text.unfold} aria-controls="game" aria-expanded="false" onClick={() => fold(false)}>
                    <Icon>
                        <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
                        <path d="M14.5 4.5V19.5M10 9.5L7.5 12L10 14.5" />
                    </Icon>
                    <Icon>
                        <path d="M5 7H5.01M5 12H5.01M5 17H5.01M9 7H19M9 12H19M9 17H15" />
                    </Icon>
                </button>
            </div>
        </>
    );
}

function Icon({ children }: { children: ComponentChildren; })
{
    return <svg class="icon" viewBox="0 0 24 24" aria-hidden="true">{children}</svg>;
}
