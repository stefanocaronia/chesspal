import type { GameRecord } from "../../core/index.ts";
import type { OpeningTags } from "../../games/index.ts";
import { openingName } from "./opening-book.ts";

/** The opening a game reached, in the ECO and Opening tags the archive writes: none from another position or outside the book. */
export function openingTags(record: GameRecord): OpeningTags
{
    const opening = openingName(record);

    if (opening === undefined) {
        return {};
    }

    // The ECO code, then the name: B50 Sicilian Defense.
    const space = opening.indexOf(" ");
    return { ECO: opening.slice(0, space), Opening: opening.slice(space + 1) };
}
