// The dialog of the analyses (T-92, T-106): the games analysed or brought to study, to open again, and a game played elsewhere brought as a PGN, pasted or read
// from a file, which the server keeps to study and puts in analysis.
import { useEffect, useState } from "preact/hooks";
import { Dialog } from "./dialog.tsx";
import type { Text } from "./text.ts";

/** An analysis as the server lists it (`GET /api/analyses`). */
export interface AnalysisItem
{
    readonly name: string;
    readonly white: string;
    readonly black: string;
    readonly date?: string;
    readonly result: string;
    readonly opening?: string;
    readonly moves: number;
    readonly reviewed: boolean;
}

/** What the dialog sends: a PGN to bring, or the name of a game to open again. */
export type Studied = { pgn: string; } | { game: string; } | { last: true; };

/** The dialog the header's button opens; `onStudy` sends the choice and gives back why the server refused it, or undefined once it took it. */
export function StudyDialog({ open, onStudy, onClose, text }: {
    open: boolean;
    onStudy: (studied: Studied) => Promise<string | undefined>;
    onClose: () => void;
    text: Text;
})
{
    return (
        <Dialog open={open} title={text.study.title} onClose={onClose} text={text}>
            <StudyForm onStudy={onStudy} text={text} />
        </Dialog>
    );
}

/** The form, made again at each opening: the list read anew, empty, with no problem shown. */
function StudyForm({ onStudy, text }: { onStudy: (studied: Studied) => Promise<string | undefined>; text: Text; })
{
    const words = text.study;
    const [pgn, setPgn] = useState("");
    const [problem, setProblem] = useState<string | undefined>(undefined);
    const [sending, setSending] = useState(false);
    const analyses = useAnalyses();

    const study = (studied: Studied): void => {
        setSending(true);
        void onStudy(studied).then((refused) => {
            setSending(false);
            setProblem(refused);
        });
    };

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
                study({ pgn });
            }}
        >
            {analyses.length === 0 ? null : (
                <section class="analyses" aria-label={words.yours}>
                    <h3>{words.yours}</h3>
                    <ul>
                        {analyses.map((item) => (
                            <li key={item.name}>
                                <button type="button" disabled={sending} onClick={() => study({ game: item.name })}>
                                    <b>{item.white} – {item.black}</b>
                                    <span class="result">{item.result}</span>
                                    <span class="note">
                                        {[item.date, item.opening, words.moves(item.moves)].filter((part) => part !== undefined).join(" · ")}
                                    </span>
                                    <span class={item.reviewed ? "state reviewed" : "state"}>{item.reviewed ? words.reviewed : words.unreviewed}</span>
                                </button>
                            </li>
                        ))}
                    </ul>
                    <h3>{words.bring}</h3>
                </section>
            )}
            <label class="field">
                <span>{words.paste}</span>
                <textarea
                    rows={analyses.length === 0 ? 10 : 6}
                    value={pgn}
                    autofocus
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

/** The analyses of the player's folder, read once the dialog opens; none while they come, or when the server cannot give them. */
function useAnalyses(): readonly AnalysisItem[]
{
    const [analyses, setAnalyses] = useState<readonly AnalysisItem[]>([]);

    useEffect(() => {
        void fetch("/api/analyses")
            .then(async (response) => response.ok ? await response.json() as AnalysisItem[] : [])
            .catch(() => [])
            .then(setAnalyses);
    }, []);

    return analyses;
}
