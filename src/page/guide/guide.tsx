// The guide, from the book in the header: how to play, in the page's language (guide/<code>.md), an index of chips, its parts folding, the first two
// open, and its foot; its anchors are the English guide's, so that a link finds its heading in both languages.
import { useEffect, useMemo, useState } from "preact/hooks";
import { Dialog } from "../dialogs/dialog.tsx";
import type { Text } from "../text.ts";
import { anchorOf, type Block, markdownBlocks } from "./blocks.ts";
import { GuideFoot } from "./foot.tsx";
import { Blocks, Inline } from "./markdown.tsx";

/** The guide in its dialog. */
export function GuideDialog({ open, onClose, text }: { open: boolean; onClose: () => void; text: Text; })
{
    return (
        <Dialog open={open} title={text.guide.title} onClose={onClose} text={text}>
            <Guide text={text} />
        </Dialog>
    );
}

/** A part of the guide: its heading and its blocks. */
interface Part
{
    heading: Extract<Block, { kind: "heading"; }>;
    blocks: Block[];
}

function Guide({ text }: { text: Text; })
{
    const guide = useGuide(text.language);
    const [open, setOpen] = useState(() => new Set([0, 1]));
    const [sought, setSought] = useState<string>();
    const { lead, parts, anchors } = useMemo(() => guideParts(guide.own, guide.english), [guide]);

    const toggle = (index: number, event: MouseEvent): void => {
        event.preventDefault();
        setOpen((before) => new Set(before.has(index) ? [...before].filter((one) => one !== index) : [...before, index]));
    };

    // A chip of the index, or a link to a heading, opens its part and brings the heading into sight.
    const go = (id: string): void => {
        const index = parts.findIndex((part) => [part.heading, ...part.blocks].some((block) => anchors.get(block) === id));

        if (index >= 0) {
            setOpen((before) => new Set([...before, index]));
            setSought(id);
        }
    };

    const goToAnchor = (anchor: string): void => go(idOf(anchor));

    useEffect(() => {
        if (sought === undefined) {
            return;
        }

        setSought(undefined);
        document.getElementById(sought)?.scrollIntoView({ block: "start", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    }, [sought]);

    return (
        <div class="guide">
            <Blocks blocks={lead} anchors={anchors} go={goToAnchor} />
            <nav class="guide-index" aria-label={text.guide.contents}>
                {parts.map((part) => (
                    <button key={part.heading.text} type="button" class="guide-chip" onClick={() => go(anchors.get(part.heading) ?? "")}>
                        <Inline text={part.heading.text} go={goToAnchor} />
                    </button>
                ))}
            </nav>
            {parts.map((part, index) => (
                <details key={part.heading.text} id={anchors.get(part.heading)} class="guide-part" open={open.has(index)}>
                    <summary onClick={(event) => toggle(index, event)}>
                        <h3>{part.heading.text}</h3>
                    </summary>
                    <Blocks blocks={part.blocks} anchors={anchors} go={goToAnchor} />
                </details>
            ))}
            <GuideFoot text={text} />
        </div>
    );
}

/** The guide in a language, and in English for its anchors; empty until they are read. */
function useGuide(language: string): { own: string; english: string; }
{
    const [guide, setGuide] = useState({ own: "", english: "" });

    useEffect(() => {
        let current = true;
        void Promise.all([guideIn("en"), language === "en" ? Promise.resolve("") : guideIn(language)]).then(([english, own]) => {
            if (current) {
                setGuide({ own: own === "" ? english : own, english });
            }
        });

        return () => {
            current = false;
        };
    }, [language]);

    return guide;
}

// Each language's guide is read once while the page lives; one the server did not give is asked again the next time.
const read = new Map<string, Promise<string>>();

function guideIn(language: string): Promise<string>
{
    const known = read.get(language) ?? fetch(`/page/guide/${language}.md`).then((response) => (response.ok ? response.text() : Promise.reject(new Error(response.statusText))));
    read.set(language, known);
    return known.catch(() => {
        read.delete(language);
        return "";
    });
}

/** The guide's lead, the lines before its first part, its title aside; its parts; and each heading's anchor, the English one at its place. */
function guideParts(own: string, english: string): { lead: Block[]; parts: Part[]; anchors: Map<Block, string>; }
{
    const blocks = markdownBlocks(own);
    const headings = blocks.filter((block) => block.kind === "heading");
    const englishHeadings = markdownBlocks(english).filter((block) => block.kind === "heading");
    const sameShape = headings.length === englishHeadings.length && headings.every((heading, index) => heading.level === englishHeadings[index]?.level);
    const anchors = new Map<Block, string>(headings.map((heading, index) => [heading, idOf(anchorOf((sameShape ? englishHeadings[index] : heading)?.text ?? heading.text))]));
    const first = blocks.findIndex((block) => block.kind === "heading" && block.level === 2);
    const lead = (first < 0 ? blocks : blocks.slice(0, first)).filter((block) => !(block.kind === "heading" && block.level === 1));
    const parts: Part[] = [];

    for (const block of first < 0 ? [] : blocks.slice(first)) {
        if (block.kind === "heading" && block.level === 2) {
            parts.push({ heading: block, blocks: [] });
        } else {
            parts.at(-1)?.blocks.push(block);
        }
    }

    return { lead, parts, anchors };
}

// A heading's id on the page, apart from the page's own.
function idOf(anchor: string): string
{
    return `guide-${anchor}`;
}
