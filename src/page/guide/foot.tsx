// The guide's foot: the credits, as the README has them; who made Chesspal, its links and its version are in the page's foot (layout/footer.tsx).
import type { Text } from "../text.ts";
import { Inline } from "./markdown.tsx";

/** The foot of the guide. */
export function GuideFoot({ text }: { text: Text; })
{
    const words = text.guide;

    return (
        <footer class="guide-foot">
            <h3>{words.credits}</h3>
            <ul>
                {words.creditLines.map((line) => (
                    <li key={line}>
                        <Inline text={line} go={() => undefined} />
                    </li>
                ))}
            </ul>
        </footer>
    );
}
