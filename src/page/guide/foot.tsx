// The guide's foot: who made Chesspal, the code on GitHub and the package on npm, a heart to support it, and the credits folded, as the README has them.
import type { Text } from "../text.ts";
import { Inline } from "./markdown.tsx";

/** Where Chesspal lives, and how to support it. */
export const footLinks = {
    author: "https://stefanocaronia.it",
    github: "https://github.com/stefanocaronia/chesspal",
    npm: "https://www.npmjs.com/package/chesspal",
    support: "https://www.paypal.com/paypalme/stefanocaronia",
};

/** The foot of the guide. */
export function GuideFoot({ text }: { text: Text; })
{
    const words = text.guide;

    return (
        <footer class="guide-foot">
            <p class="foot-own">
                <span>
                    {"© 2026 "}
                    <a href={footLinks.author} target="_blank" rel="noreferrer">Stefano Caronia</a>
                    {" · Chesspal"}
                </span>
                <a href={footLinks.github} target="_blank" rel="noreferrer" title="GitHub" aria-label={words.onGitHub}>
                    <svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
                        <path d={githubPath} />
                    </svg>
                </a>
                <a href={footLinks.npm} target="_blank" rel="noreferrer" title="npm" aria-label={words.onNpm}>
                    <svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
                        <path d={npmPath} />
                    </svg>
                </a>
                <a class="foot-support" href={footLinks.support} target="_blank" rel="noreferrer">
                    <svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
                        <path d={heartPath} />
                    </svg>
                    {words.support}
                </a>
            </p>
            <details class="credits">
                <summary>{words.credits}</summary>
                <ul>
                    {words.creditLines.map((line) => (
                        <li key={line}>
                            <Inline text={line} go={() => undefined} />
                        </li>
                    ))}
                </ul>
            </details>
        </footer>
    );
}

// The icons of rpg-engine's foot.
const githubPath =
    "M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.4 5.4 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65S8.93 17.38 9 18v4 M9 18c-4.51 2-5-2-7-2";
const npmPath = "M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73Z M12 22V12 M3.29 7 12 12l8.71-5 M7.5 4.27l9 5.15";
const heartPath = "M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z";
