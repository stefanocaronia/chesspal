// The dialog of the analyses (D-92): the list of the games analysed or brought to study, and a step that loads a game played elsewhere, one of the latest
// on the sites (D-110) or a PGN pasted or read from a file, which the server keeps to study and puts in analysis.
import { useEffect, useRef, useState } from "preact/hooks";
import type { AiModel } from "../../core/index.ts";
import type { Text } from "../text.ts";
import { Analyses } from "./analyses.tsx";
import { Dialog } from "./dialog.tsx";
import { type SiteGame, SiteGameList } from "./site-games.tsx";
import type { Accounts, OtherProfile } from "./studied.ts";

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
    readonly begun?: true;
    readonly annotator?: AiModel;
    readonly site?: string;
}

/** What the dialog sends: a PGN to bring, or the name of a game to open again. */
export type Studied = { pgn: string; } | { game: string; } | { last: true; };

/**
 * The dialog the header's button opens; `onStudy` sends the choice and gives back why the server refused it, or undefined once it took it. The games played
 * here name their sides as their analysis does: the player by `you`, the AI by its model when the game keeps it (D-82), else by `ai`.
 */
export function StudyDialog({ open, onStudy, onClose, onProfile, you, accounts, others, ai, text }: {
    open: boolean;
    onStudy: (studied: Studied) => Promise<string | undefined>;
    onClose: () => void;
    /** Opens the profile, where the player puts their names on the sites (D-110). */
    onProfile: () => void;
    you: string;
    /** The player's names on the sites, by which the games they load are theirs (D-93). */
    accounts: Accounts | undefined;
    /** The other profiles here, named in the list by their names on the sites too. */
    others: readonly OtherProfile[];
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
            {loading ? <LoadForm onStudy={onStudy} onProfile={onProfile} accounts={accounts} text={text} /> : <Analyses onStudy={onStudy} onLoad={() => setLoading(true)} you={you} accounts={accounts} others={others} ai={ai} text={text} />}
        </Dialog>
    );
}

/** The step that loads a game played elsewhere: one of the latest on the sites, or its PGN pasted, or read from a file. */
function LoadForm({ onStudy, onProfile, accounts, text }: {
    onStudy: (studied: Studied) => Promise<string | undefined>;
    onProfile: () => void;
    accounts: Accounts | undefined;
    text: Text;
})
{
    const words = text.study;
    const [pgn, setPgn] = useState("");
    const [problem, setProblem] = useState<string | undefined>(undefined);
    const [sending, setSending] = useState(false);
    // The game of the sites being sent, and why the server refused the last one picked, said under the list.
    const [picked, setPicked] = useState<string | undefined>(undefined);
    const [pickRefused, setPickRefused] = useState<string | undefined>(undefined);
    const field = useRef<HTMLTextAreaElement>(null);

    // With a mouse only: on a phone the keyboard would cover the step.
    useEffect(() => {
        if (matchMedia("(pointer: fine)").matches) {
            field.current?.focus();
        }
    }, []);

    const send = (sent: string): void => {
        setSending(true);
        setPickRefused(undefined);
        void onStudy({ pgn: sent }).then((refused) => {
            setSending(false);
            setProblem(refused);
        });
    };

    const pick = (game: SiteGame): void => {
        setPicked(game.name);
        setPickRefused(undefined);
        setProblem(undefined);
        void onStudy({ pgn: game.pgn }).then((refused) => {
            setPicked(undefined);
            setPickRefused(refused);
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
                send(pgn);
            }}
        >
            <SiteGameList accounts={accounts} picked={picked} problem={pickRefused} onPick={pick} onProfile={onProfile} text={text} />
            <label class="field">
                <span>{words.paste}</span>
                <textarea
                    ref={field}
                    rows={4}
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
            <button class="start" type="submit" disabled={pgn.trim() === "" || sending || picked !== undefined}>{words.start}</button>
        </form>
    );
}
