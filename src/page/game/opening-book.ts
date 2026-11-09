// The book of the openings (D-16), fetched once the game has a move: the page names the opening itself, from the moves it replays.
import { useEffect, useState } from "preact/hooks";
import type { OpeningIndex } from "../../core/index.ts";

let fetched: Promise<OpeningIndex | undefined> | undefined;

/** The book, once it is needed and has come; undefined before, or when it cannot be had. */
export function useOpeningBook(needed: boolean): OpeningIndex | undefined
{
    const [book, setBook] = useState<OpeningIndex | undefined>(undefined);

    useEffect(() => {
        if (needed && book === undefined) {
            fetched ??= fetch("/core/openings.json").then((response) => response.ok ? response.json() as Promise<OpeningIndex> : undefined).catch(() => undefined);
            void fetched.then(setBook);
        }
    }, [needed]);

    return book;
}
