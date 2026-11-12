// How a game went for the player, as the lists of games mark it: the analyses' and the latest games on the sites'.
import type { StudyText } from "../text.ts";

/** How a game went for the player. */
export type Outcome = "won" | "lost" | "drawn";

/** How a game went for the player, as chess.com marks it: a green square with a plus, a red one with a minus, a grey one with an equals sign. */
export function OutcomeBadge({ outcome, words }: { outcome: Outcome; words: StudyText; })
{
    return (
        <svg class={`outcome ${outcome}`} viewBox="0 0 16 16" role="img" aria-label={words.outcome[outcome]}>
            <title>{words.outcome[outcome]}</title>
            <rect width="16" height="16" rx="4" />
            <path d={outcomeSigns[outcome]} />
        </svg>
    );
}

/** How a game went for the player: won, lost or drawn; nothing for a game without a result. */
export function outcomeOf(result: string, you: "white" | "black"): Outcome | undefined
{
    if (result === "1/2-1/2") {
        return "drawn";
    }

    return result === "1-0" || result === "0-1" ? (result === "1-0") === (you === "white") ? "won" : "lost" : undefined;
}

const outcomeSigns: Readonly<Record<Outcome, string>> = { won: "M5 8h6M8 5v6", lost: "M5 8h6", drawn: "M5 6.5h6M5 9.5h6" };
