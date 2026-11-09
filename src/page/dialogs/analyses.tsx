// The list of the analyses (D-92): the games analysed or brought to study, found by a search, to open again, analyse again or delete, each row with its
// menu over the dialog and the question it asks in its place.
import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import { ResultTile } from "../game/result-tile.tsx";
import { signature } from "../players/model-name.ts";
import type { StudyText, Text } from "../text.ts";
import { searched } from "./search.ts";
import { type Accounts, accountSide, playerIn, studiedSides } from "./studied.ts";
import type { AnalysisItem, Studied } from "./study.tsx";

/** The list, read anew at each opening: the search, the row that loads a game, then a row for each game found, with its menu or its question. */
export function Analyses({ onStudy, onLoad, you, accounts, ai, text }: {
    onStudy: (studied: Studied) => Promise<string | undefined>;
    onLoad: () => void;
    you: string;
    accounts: Accounts | undefined;
    ai: string;
    text: Text;
})
{
    const words = text.study;
    const [analyses, reload] = useAnalyses();
    const [query, setQuery] = useState("");
    const [menu, setMenu] = useState<{ name: string; anchor: HTMLElement; } | undefined>(undefined);
    const [asking, setAsking] = useState<{ name: string; asked: Asked; } | undefined>(undefined);
    const [busy, setBusy] = useState(false);
    const [problem, setProblem] = useState<string | undefined>(undefined);
    useClosing(menu !== undefined, () => setMenu(undefined));
    useClosing(asking !== undefined, () => setAsking(undefined));

    const act = async (name: string, asked: Asked): Promise<void> => {
        setBusy(true);
        const refused = asked === "remove" ? await deletion("/api/delete-game", name) : await deletion("/api/delete-review", name);
        // Analysing again opens the game without its review: the chat's analyst goes over it (D-89).
        const after = refused === undefined && asked === "redo" ? await onStudy({ game: name }) : refused;
        setBusy(false);
        setAsking(undefined);
        setProblem(after);
        reload();
    };

    const open = (name: string): void => {
        setBusy(true);
        void onStudy({ game: name }).then((refused) => {
            setBusy(false);
            setProblem(refused);
        });
    };

    const rows = analyses.map((item) => {
        const named = namedSides(item, you, accounts, ai, text);
        // How it went only for the player's own games: played here, or loaded and named by their name on the site (D-93).
        const played = item.name.startsWith("games/") ? named.you : accountSide(tagsOf(item), accounts);
        const outcome = played === undefined ? undefined : outcomeOf(item.result, played);
        return { item, named, outcome };
    });
    const found = searched(rows, query, ({ item, named, outcome }) => searchText(item, named.sides, outcome, text));

    return (
        <div class="analyses">
            <label class="search">
                <svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M10.5 17A6.5 6.5 0 1 0 10.5 4A6.5 6.5 0 0 0 10.5 17ZM15.5 15.5L20 20" />
                </svg>
                <input type="search" value={query} placeholder={words.search} aria-label={words.search} spellcheck={false} onInput={(event) => setQuery(event.currentTarget.value)} />
            </label>
            <button class="load-row" type="button" onClick={onLoad}>
                <span class="plus" aria-hidden="true">
                    <svg class="icon" viewBox="0 0 24 24">
                        <path d="M12 5V19M5 12H19" />
                    </svg>
                </span>
                <span>
                    <b>{words.bring}</b>
                    <small>{words.bringNote}</small>
                </span>
            </button>
            {problem === undefined ? null : <p class="problem" role="alert">{problem}</p>}
            {analyses.length > 0 && found.length === 0 ? <p class="none">{words.noMatch}</p> : null}
            {found.length === 0 ? null : (
                <ul class="games" aria-label={words.yours}>
                    {found.map(({ item, named, outcome }) =>
                        asking?.name === item.name
                            ? (
                                <Question
                                    key={item.name}
                                    asked={asking.asked}
                                    game={named.sides}
                                    when={dayOf(item.date, text.language)}
                                    by={by(item)}
                                    busy={busy}
                                    onYes={() => void act(item.name, asking.asked)}
                                    onNo={() => setAsking(undefined)}
                                    words={words}
                                />
                            )
                            : (
                                <li key={item.name} class="game">
                                    <button class="reopen" type="button" disabled={busy} onClick={() => open(item.name)}>
                                        <ResultTile result={item.result} />
                                        <span class="what">
                                            <b class="who">{named.sides}</b>
                                            <span class="meta">
                                                {[dayOf(item.date, text.language), words.moves(item.moves), item.opening].filter((part) => part !== undefined).join(" · ")}
                                            </span>
                                            {item.reviewed ? <Reviewed by={by(item)} words={words} /> : null}
                                        </span>
                                        <span class="score">
                                            <b>{scoreOf(item.result)}</b>
                                            {outcome === undefined ? <span /> : <OutcomeBadge outcome={outcome} words={words} />}
                                        </span>
                                    </button>
                                    <span class="row-actions">
                                        <button
                                            class={`icon-button${menu?.name === item.name ? " on" : ""}`}
                                            type="button"
                                            title={words.more}
                                            aria-label={words.more}
                                            aria-expanded={menu?.name === item.name}
                                            disabled={busy}
                                            onClick={(event) => setMenu(menu?.name === item.name ? undefined : { name: item.name, anchor: event.currentTarget })}
                                        >
                                            <svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
                                                <path d="M5 12H5.01M12 12H12.01M19 12H19.01" />
                                            </svg>
                                        </button>
                                    </span>
                                    {menu?.name === item.name
                                        ? (
                                            <RowMenu
                                                anchor={menu.anchor}
                                                reviewed={item.reviewed}
                                                onPick={(asked) => {
                                                    setMenu(undefined);
                                                    setAsking({ name: item.name, asked });
                                                }}
                                                onClose={() => setMenu(undefined)}
                                                words={words}
                                            />
                                        )
                                        : null}
                                </li>
                            )
                    )}
                </ul>
            )}
        </div>
    );
}

/** What a row asks before it acts: analyse the game again, delete its analysis, or delete it. */
type Asked = "redo" | "unreview" | "remove";

/**
 * A row's menu, over the dialog and the page in the browser's top layer, under its button or above it when there is no room: analyse again and delete the
 * analysis, for a game reviewed; delete the game, apart and in red. Scrolling closes it, which would leave its button.
 */
function RowMenu({ anchor, reviewed, onPick, onClose, words }: {
    anchor: HTMLElement;
    reviewed: boolean;
    onPick: (asked: Asked) => void;
    onClose: () => void;
    words: StudyText;
})
{
    const menu = useRef<HTMLDivElement>(null);

    useLayoutEffect(() => {
        const element = menu.current!;
        element.showPopover();
        placeUnder(element, anchor);
        element.querySelector("button")?.focus();
        window.addEventListener("scroll", onClose, true);
        window.addEventListener("resize", onClose);

        return () => {
            window.removeEventListener("scroll", onClose, true);
            window.removeEventListener("resize", onClose);
        };
    }, []);

    return (
        <div ref={menu} class="row-menu" popover="manual">
            {reviewed
                ? (
                    <>
                        <button type="button" onClick={() => onPick("redo")}>
                            <svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
                                <path d="M19 12A7 7 0 1 1 16.5 6.6M17 3V7H13" />
                            </svg>
                            <span>
                                {words.redo}
                                <small>{words.redoNote}</small>
                            </span>
                        </button>
                        <button type="button" onClick={() => onPick("unreview")}>
                            <svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
                                <path d="M5 19H19M8 15L4.5 11.5L12 4L18 10L11 17H8ZM8.5 7.5L14.5 13.5" />
                            </svg>
                            <span>
                                {words.unreview}
                                <small>{words.unreviewNote}</small>
                            </span>
                        </button>
                        <hr />
                    </>
                )
                : null}
            <button class="danger" type="button" onClick={() => onPick("remove")}>
                <TrashIcon />
                <span>{words.remove}</span>
            </button>
        </div>
    );
}

/** The question a row asks in place of the row: deleting in red, analysing again in the accent. */
function Question({ asked, game, when, by, busy, onYes, onNo, words }: {
    asked: Asked;
    game: string;
    when: string | undefined;
    by: string | undefined;
    busy: boolean;
    onYes: () => void;
    onNo: () => void;
    words: StudyText;
})
{
    const { question, note, yes } = asked === "redo" ? words.askRedo(game, by) : asked === "unreview" ? words.askUnreview(game) : words.askRemove(game, when);
    // The safe answer takes the focus, as the menu's item had it.
    const cancel = useRef<HTMLButtonElement>(null);
    useEffect(() => cancel.current?.focus(), []);

    return (
        <li class={`ask ${asked === "redo" ? "redo" : "danger"}`} role="alertdialog" aria-label={question}>
            <p>
                <b>{question}</b>
                <small>{note}</small>
            </p>
            <span class="buttons">
                <button ref={cancel} type="button" disabled={busy} onClick={onNo}>
                    {words.cancel}
                </button>
                <button class="yes" type="button" disabled={busy} onClick={onYes}>
                    {asked === "remove" ? <TrashIcon /> : null}
                    {yes}
                </button>
            </span>
        </li>
    );
}

function TrashIcon()
{
    return (
        <svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 7H20M9 7V4.5H15V7M6.5 7L7.5 20H16.5L17.5 7M10.5 11V16M13.5 11V16" />
        </svg>
    );
}

// The gap between the menu and its button, and the least margin it keeps from the window's edges.
const menuGap = 4;
const edge = 8;

/** Puts a menu under its button, its right edges aligned, or above the button when it would go past the window's bottom. */
function placeUnder(menu: HTMLElement, anchor: HTMLElement): void
{
    const button = anchor.getBoundingClientRect();
    const box = menu.getBoundingClientRect();
    const below = button.bottom + menuGap + box.height <= window.innerHeight - edge;
    menu.style.top = `${below ? button.bottom + menuGap : Math.max(edge, button.top - menuGap - box.height)}px`;
    menu.style.left = `${Math.max(edge, button.right - box.width)}px`;
}

/** Who played a game listed, as its analysis names them, «Stefano – Opus 5.5 · xhigh», and the player's side when they played one. */
function namedSides(item: AnalysisItem, you: string, accounts: Accounts | undefined, ai: string, text: Text): { sides: string; you?: "white" | "black"; }
{
    const model = item.aiModel === undefined ? ai : signature(item.aiModel.model, item.aiModel.effort);
    const sides = studiedSides(tagsOf(item), you, model, text.sides, accounts);
    const side = playerIn(sides);
    return { sides: `${sides.white.name} – ${sides.black.name}`, ...(side === undefined ? {} : { you: side }) };
}

/** What the search looks through in a row: who played, the models, the date, the opening and its variation, how it went and whether it is reviewed. */
function searchText(item: AnalysisItem, sides: string, outcome: Outcome | undefined, text: Text): string
{
    const words = text.study;
    const state = item.reviewed ? words.reviewed : words.unreviewed;
    const went = outcome === undefined ? undefined : words.outcome[outcome];
    return [sides, item.aiModel?.model, by(item), item.annotator?.model, dayOf(item.date, text.language), item.opening, scoreOf(item.result), went, state].join(" ");
}

/** How a game went for the player, as chess.com marks it: a green square with a plus, a red one with a minus, a grey one with an equals sign. */
function OutcomeBadge({ outcome, words }: { outcome: Outcome; words: StudyText; })
{
    return (
        <svg class={`outcome ${outcome}`} viewBox="0 0 16 16" role="img" aria-label={words.outcome[outcome]}>
            <title>{words.outcome[outcome]}</title>
            <rect width="16" height="16" rx="4" />
            <path d={outcomeSigns[outcome]} />
        </svg>
    );
}

/** A game the AI reviewed: its speech bubble, and the model that wrote the review when the tags say it. */
function Reviewed({ by, words }: { by: string | undefined; words: StudyText; })
{
    return (
        <span class="state reviewed" title={by === undefined ? words.reviewed : `${words.reviewed}: ${by}`}>
            <svg class="icon" viewBox="0 0 24 24" role="img" aria-label={words.reviewed}>
                <path d="M5 5H19V15.5H11L7 19.5V15.5H5Z" />
            </svg>
            {by === undefined ? null : <span>{by}</span>}
        </span>
    );
}

type Outcome = "won" | "lost" | "drawn";

const outcomeSigns: Readonly<Record<Outcome, string>> = { won: "M5 8h6M8 5v6", lost: "M5 8h6", drawn: "M5 6.5h6M5 9.5h6" };

/** The tags of a game listed that name its sides. */
function tagsOf(item: AnalysisItem): Record<string, string>
{
    return { White: item.white, Black: item.black, ...(item.site === undefined ? {} : { Site: item.site }) };
}

/** Who reviewed a game, «Opus 5.5 · high», when its tags say it (D-81). */
function by(item: AnalysisItem): string | undefined
{
    return item.annotator === undefined ? undefined : signature(item.annotator.model, item.annotator.effort);
}

/** A result as the row shows it: 1–0, 0–1, ½–½ or *. */
function scoreOf(result: string): string
{
    return result === "1/2-1/2" ? "½–½" : result.replace("-", "–");
}

/** How a game went for the player: won, lost or drawn; nothing for a game without a result. */
function outcomeOf(result: string, you: "white" | "black"): Outcome | undefined
{
    if (result === "1/2-1/2") {
        return "drawn";
    }

    return result === "1-0" || result === "0-1" ? (result === "1-0") === (you === "white") ? "won" : "lost" : undefined;
}

/** A PGN date, 2026.11.04, as the player reads it: «4 nov», with the year when it is not this one. */
function dayOf(date: string | undefined, language: string): string | undefined
{
    const [, year, month, day] = /^(\d{4})\.(\d{2})\.(\d{2})$/.exec(date ?? "") ?? [];

    if (year === undefined || month === undefined || day === undefined) {
        return date;
    }

    const when = new Date(Number(year), Number(month) - 1, Number(day));
    return when.toLocaleDateString(language, { day: "numeric", month: "short", ...(when.getFullYear() === new Date().getFullYear() ? {} : { year: "numeric" }) });
}

/** A deletion asked of the server: undefined once done, else why it refused. */
async function deletion(route: string, game: string): Promise<string | undefined>
{
    try {
        const response = await fetch(route, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ game }) });
        return response.ok ? undefined : ((await response.json()) as { error?: string; }).error ?? response.statusText;
    } catch (error) {
        return (error as Error).message;
    }
}

/** Closes a menu, or a row's question, at a click outside it or at Escape, which would otherwise close the whole dialog. */
function useClosing(open: boolean, close: () => void): void
{
    useEffect(() => {
        if (!open) {
            return undefined;
        }

        const outside = (event: PointerEvent): void => {
            if (!(event.target as Element).closest(".row-menu, .row-actions, .ask")) {
                close();
            }
        };

        const escape = (event: KeyboardEvent): void => {
            if (event.key === "Escape") {
                event.preventDefault();
                close();
            }
        };

        document.addEventListener("pointerdown", outside);
        document.addEventListener("keydown", escape, true);

        return () => {
            document.removeEventListener("pointerdown", outside);
            document.removeEventListener("keydown", escape, true);
        };
    }, [open]);
}

/** The analyses of the player's folder, read once the dialog opens and again on demand; none while they come, or when the server cannot give them. */
function useAnalyses(): [readonly AnalysisItem[], () => void]
{
    const [analyses, setAnalyses] = useState<readonly AnalysisItem[]>([]);
    const [reads, setReads] = useState(0);

    useEffect(() => {
        void fetch("/api/analyses")
            .then(async (response) => response.ok ? await response.json() as AnalysisItem[] : [])
            .catch(() => [])
            .then(setAnalyses);
    }, [reads]);

    return [analyses, () => setReads((count) => count + 1)];
}
