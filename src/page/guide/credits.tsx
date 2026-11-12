// The guide's last page: the credits, as the README has them; who made Chesspal, its links and its version are in the page's foot (layout/footer.tsx).
import type { Text } from "../text.ts";
import { Inline } from "./markdown.tsx";

/** The credits' page of the guide, under the title the guide gives every page. */
export function GuideCredits({ text }: { text: Text; })
{
    return (
        <ul>
            {text.guide.creditLines.map((line) => (
                <li key={line}>
                    <Inline text={line} go={() => undefined} />
                </li>
            ))}
        </ul>
    );
}
