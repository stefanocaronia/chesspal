// The dialog of the analyses (D-92): the games analysed or brought to study, to open again, analyse again or delete, each row with its menu and the
// question it asks; and a step that loads a game played elsewhere as a PGN, pasted or read from a file, which the server keeps to study and puts in analysis.
import { useEffect, useRef, useState } from "preact/hooks";
import type { AiModel } from "../../core/index.ts";
import { ResultTile } from "../game/result-tile.tsx";
import { signature } from "../players/model-name.ts";
import type { StudyText, Text } from "../text.ts";
import { Dialog } from "./dialog.tsx";
import { type Accounts, accountSide, playerIn, studiedSides } from "./studied.ts";

/** An analysis as the server lists it (`GET /api/analyses`). */
export interface AnalysisItem
{
    readonly name: string;
    readonly white: string;
    readonly black: string;
    readonly aiModel?: AiModel;
    readonly date?: string;
    readonly result: string;
    readonly opening?: string;
    readonly moves: number;
    readonly reviewed: boolean;
    readonly annotator?: AiModel;
    readonly site?: string;
}

/** What the dialog sends: a PGN to bring, or the name of a game to open again. */
export type Studied = { pgn: string; } | { game: string; } | { last: true; };

/**
 * The dialog the header's button opens; `onStudy` sends the choice and gives back why the server refused it, or undefined once it took it. The games played
 * here name their sides as their analysis does: the player by `you`, the AI by its model when the game keeps it (D-82), else by `ai`.
 */
export function StudyDialog({ open, onStudy, onClose, you, accounts, ai, text }: {
    open: boolean;
    onStudy: (studied: Studied) => Promise<string | undefined>;
    onClose: () => void;
    you: string;
    /** The player's names on the sites, by which the games they load are theirs (D-93). */
    accounts: Accounts | undefined;
    ai: string;
    text: Text;
})
{
    const [loading, setLoading] = useState(false);

    // Each opening starts from the list.
    useEffect(() => {
        if (!open) {
            setLoading(false);
        }
    }, [open]);

    return (
        <Dialog open={open} title={loading ? text.study.bring : text.study.title} onBack={loading ? () => setLoading(false) : undefined} onClose={onClose} text={text}>
            {loading ? <LoadForm onStudy={onStudy} text={text} /> : <Analyses onStudy={onStudy} onLoad={() => setLoading(true)} you={you} accounts={accounts} ai={ai} text={text} />}
        </Dialog>
    );
}

/** What a row asks before it acts: analyse the game again, delete its analysis, or delete it. */
type Asked = "redo" | "unreview" | "remove";

/** The list, read anew at each opening: the row that loads a game, then a row for each game, with its menu or its question. */
function Analyses({ onStudy, onLoad, you, accounts, ai, text }: {
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
    const [menu, setMenu] = useState<string | undefined>(undefined);
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

    return (
        <div class="analyses">
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
            {analyses.length === 0 ? null : (
                <ul class="games" aria-label={words.yours}>
                    {analyses.map((item) => {
                        const named = namedSides(item, you, accounts, ai, text);
                        // How it went only for the player's own games: played here, or loaded and named by their name on the site (D-93).
                        const played = item.name.startsWith("games/") ? named.you : accountSide(tagsOf(item), accounts);

                        return asking?.name === item.name
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
                                            <span class={item.reviewed ? "state reviewed" : "state"}>
                                                {item.reviewed ? [words.reviewed, by(item)].filter((part) => part !== undefined).join(" · ") : words.unreviewed}
                                            </span>
                                        </span>
                                        <span class="score">
                                            <b>{item.result === "1/2-1/2" ? "½–½" : item.result.replace("-", "–")}</b>
                                            {played === undefined ? null : <small>{outcomeOf(item.result, played, words)}</small>}
                                        </span>
                                    </button>
                                    <span class="row-actions">
                                        <button
                                            class={`icon-button${menu === item.name ? " on" : ""}`}
                                            type="button"
                                            title={words.more}
                                            aria-label={words.more}
                                            aria-expanded={menu === item.name}
                                            disabled={busy}
                                            onClick={() => setMenu(menu === item.name ? undefined : item.name)}
                                        >
                                            <svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
                                                <path d="M5 12H5.01M12 12H12.01M19 12H19.01" />
                                            </svg>
                                        </button>
                                    </span>
                                    {menu === item.name
                                        ? (
                                            <RowMenu
                                                reviewed={item.reviewed}
                                                onPick={(asked) => {
                                                    setMenu(undefined);
                                                    setAsking({ name: item.name, asked });
                                                }}
                                                words={words}
                                            />
                                        )
                                        : null}
                                </li>
                            );
                    })}
                </ul>
            )}
        </div>
    );
}

/** A row's menu: analyse again and delete the analysis, for a game reviewed; delete the game, apart and in red. */
function RowMenu({ reviewed, onPick, words }: { reviewed: boolean; onPick: (asked: Asked) => void; words: StudyText; })
{
    return (
        <div class="row-menu">
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

/** The step that loads a game played elsewhere: its PGN pasted, or read from a file. */
function LoadForm({ onStudy, text }: { onStudy: (studied: Studied) => Promise<string | undefined>; text: Text; })
{
    const words = text.study;
    const [pgn, setPgn] = useState("");
    const [problem, setProblem] = useState<string | undefined>(undefined);
    const [sending, setSending] = useState(false);
    const field = useRef<HTMLTextAreaElement>(null);

    // With a mouse only: on a phone the keyboard would cover the step.
    useEffect(() => {
        if (matchMedia("(pointer: fine)").matches) {
            field.current?.focus();
        }
    }, []);

    const read = (file: File | undefined): void => {
        void file?.text().then((read) => {
            setPgn(read);
            setProblem(undefined);
        });
    };

    return (
        <form
            class="profile-form study"
            onSubmit={(event) => {
                event.preventDefault();
                setSending(true);
                void onStudy({ pgn }).then((refused) => {
                    setSending(false);
                    setProblem(refused);
                });
            }}
        >
            <label class="field">
                <span>{words.paste}</span>
                <textarea
                    ref={field}
                    rows={10}
                    value={pgn}
                    spellcheck={false}
                    placeholder={'[White "…"]\n[Black "…"]\n\n1. e4 e5 2. Nf3 …'}
                    onInput={(event) => {
                        setPgn(event.currentTarget.value);
                        setProblem(undefined);
                    }}
                />
            </label>
            <label class="field file">
                <span>{words.file}</span>
                <input type="file" accept=".pgn,application/x-chess-pgn,text/plain" onChange={(event) => read(event.currentTarget.files?.[0])} />
            </label>
            <p class="note">{words.note}</p>
            {problem === undefined ? null : <p class="problem" role="alert">{problem}</p>}
            <button class="start" type="submit" disabled={pgn.trim() === "" || sending}>{words.start}</button>
        </form>
    );
}

/** Who played a game listed, as its analysis names them, «Stefano – Opus 5.5 · xhigh», and the player's side when they played one. */
function namedSides(item: AnalysisItem, you: string, accounts: Accounts | undefined, ai: string, text: Text): { sides: string; you?: "white" | "black"; }
{
    const model = item.aiModel === undefined ? ai : signature(item.aiModel.model, item.aiModel.effort);
    const sides = studiedSides(tagsOf(item), you, model, text.sides, accounts);
    const side = playerIn(sides);
    return { sides: `${sides.white.name} – ${sides.black.name}`, ...(side === undefined ? {} : { you: side }) };
}

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

/** How a game played here went for the player: won, lost or drawn; nothing for a game without a result. A game loaded from elsewhere says none. */
function outcomeOf(result: string, you: "white" | "black", words: StudyText): string | undefined
{
    if (result === "1/2-1/2") {
        return words.outcome.drawn;
    }

    return result === "1-0" || result === "0-1" ? (result === "1-0") === (you === "white") ? words.outcome.won : words.outcome.lost : undefined;
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
