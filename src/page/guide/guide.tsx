// The guide, from the book in the header: how to play, in the page's language (guide/<code>.md), a page at a time, chosen in its index or with the arrows at
// its foot, the credits the last; its anchors are the English guide's, so that a link finds its heading in both languages.
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { Dialog } from "../dialogs/dialog.tsx";
import type { Text } from "../text.ts";
import { anchorOf, type Block, markdownBlocks } from "./blocks.ts";
import { GuideCredits } from "./credits.tsx";
import { Blocks } from "./markdown.tsx";

/** The guide in its dialog. */
export function GuideDialog({ open, onClose, text }: { open: boolean; onClose: () => void; text: Text; })
{
    return (
        <Dialog open={open} title={text.guide.title} onClose={onClose} text={text}>
            <Guide text={text} />
        </Dialog>
    );
}

/** A page of the guide: its heading and its blocks. */
interface Page
{
    heading: Extract<Block, { kind: "heading"; }>;
    blocks: Block[];
}

function Guide({ text }: { text: Text; })
{
    const words = text.guide;
    const guide = useGuide(text.language);
    const { lead, pages, anchors } = useMemo(() => guidePages(guide.own, guide.english), [guide]);
    const [shown, setShown] = useState(0);
    // The heading to bring into sight once its page is drawn: "" for the page's top.
    const [sought, setSought] = useState<string>();
    const top = useRef<HTMLDivElement>(null);
    const title = useRef<HTMLHeadingElement>(null);
    const titles = [...pages.map((page) => page.heading.text), words.credits];
    const page = pages[shown];

    const show = (index: number, id = ""): void => {
        setShown(index);
        setSought(id);
    };

    // A link to a heading shows its page, and the heading in it.
    const go = (anchor: string): void => {
        const id = idOf(anchor);
        const index = pages.findIndex((one) => [one.heading, ...one.blocks].some((block) => anchors.get(block) === id));

        if (index >= 0) {
            show(index, id);
        }
    };

    // A page turned: its chip in sight in the index, the focus on its title, which a screen reader says, and its top or the heading sought in sight.
    useEffect(() => {
        if (sought === undefined) {
            return;
        }

        setSought(undefined);
        top.current?.querySelector(".guide-chip[aria-current]")?.scrollIntoView({ inline: "center", block: "nearest" });
        title.current?.focus({ preventScroll: true });
        const heading = sought === "" ? null : document.getElementById(sought);

        if (heading === null) {
            top.current?.closest("dialog")?.scrollTo({ top: 0 });
        } else {
            heading.scrollIntoView({ block: "start" });
        }
    }, [sought]);

    if (pages.length === 0) {
        return <div class="guide" ref={top} />;
    }

    return (
        <div class="guide" ref={top}>
            <nav class="guide-index" aria-label={words.contents}>
                {titles.map((title, index) => (
                    <button key={title} type="button" class="guide-chip" aria-current={index === shown ? "page" : undefined} onClick={() => show(index)}>
                        {title}
                    </button>
                ))}
            </nav>
            <article class="guide-page">
                <div class="guide-text">
                    <h3 id={page === undefined ? undefined : anchors.get(page.heading)} ref={title} tabIndex={-1}>
                        {titles[shown]}
                    </h3>
                    {page === undefined ? <GuideCredits text={text} /> : (
                        <>
                            {shown === 0 ? <Blocks blocks={lead} anchors={anchors} go={go} /> : null}
                            <Blocks blocks={page.blocks} anchors={anchors} go={go} />
                        </>
                    )}
                </div>
                <div class="guide-turn">
                    {shown === 0 ? null : <TurnButton back title={titles[shown - 1] ?? ""} label={words.previous} onTurn={() => show(shown - 1)} />}
                    {shown === titles.length - 1 ? null : <TurnButton title={titles[shown + 1] ?? ""} label={words.next} onTurn={() => show(shown + 1)} />}
                </div>
            </article>
        </div>
    );
}

/** An arrow at a page's foot, with the title of the page it shows. */
function TurnButton({ back = false, title, label, onTurn }: { back?: boolean; title: string; label: string; onTurn: () => void; })
{
    const arrow = (
        <svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
            <path d={back ? "M14.5 6L8.5 12L14.5 18" : "M9.5 6L15.5 12L9.5 18"} />
        </svg>
    );

    return (
        <button type="button" class={back ? "back" : "next"} aria-label={`${label}: ${title}`} onClick={onTurn}>
            {back ? arrow : null}
            {title}
            {back ? null : arrow}
        </button>
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

/** The guide's lead, the lines before its first page, its title aside; its pages; and each heading's anchor, the English one at its place. */
function guidePages(own: string, english: string): { lead: Block[]; pages: Page[]; anchors: Map<Block, string>; }
{
    const blocks = markdownBlocks(own);
    const headings = blocks.filter((block) => block.kind === "heading");
    const englishHeadings = markdownBlocks(english).filter((block) => block.kind === "heading");
    const sameShape = headings.length === englishHeadings.length && headings.every((heading, index) => heading.level === englishHeadings[index]?.level);
    const anchors = new Map<Block, string>(headings.map((heading, index) => [heading, idOf(anchorOf((sameShape ? englishHeadings[index] : heading)?.text ?? heading.text))]));
    const first = blocks.findIndex((block) => block.kind === "heading" && block.level === 2);
    const lead = (first < 0 ? blocks : blocks.slice(0, first)).filter((block) => !(block.kind === "heading" && block.level === 1));
    const pages: Page[] = [];

    for (const block of first < 0 ? [] : blocks.slice(first)) {
        if (block.kind === "heading" && block.level === 2) {
            pages.push({ heading: block, blocks: [] });
        } else {
            pages.at(-1)?.blocks.push(block);
        }
    }

    return { lead, pages, anchors };
}

// A heading's id on the page, apart from the page's own.
function idOf(anchor: string): string
{
    return `guide-${anchor}`;
}
