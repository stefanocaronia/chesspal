// The guide's blocks (blocks.ts) drawn as the page's own elements, never as HTML; in a line bold, italic, code and links, to a page of the web or to a heading
// by its anchor. Copied from rpg-engine's guide (src/dashboard/help/markdown.tsx).
import type { ComponentChildren } from "preact";
import type { Block } from "./blocks.ts";

/** Blocks drawn as the page's elements: headings one level under the part's, each with the anchor given by its place among them; a link to an anchor calls go. */
export function Blocks({ blocks, anchors, go }: { blocks: Block[]; anchors: Map<Block, string>; go: (anchor: string) => void; })
{
    return <>{blocks.map((block, index) => <BlockView key={index} block={block} anchors={anchors} go={go} />)}</>;
}

/** A line's text with its bold, italic, code and links. */
export function Inline({ text, go }: { text: string; go: (anchor: string) => void; })
{
    const parts: ComponentChildren[] = [];
    const marks = /\*\*(.+?)\*\*|\*(.+?)\*|`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)/g;
    let from = 0;

    for (const match of text.matchAll(marks)) {
        parts.push(text.slice(from, match.index));
        const [, bold, italic, code, label, target] = match;
        const key = match.index;

        if (bold !== undefined) {
            parts.push(
                <strong key={key}>
                    <Inline text={bold} go={go} />
                </strong>,
            );
        } else if (italic !== undefined) {
            parts.push(
                <em key={key}>
                    <Inline text={italic} go={go} />
                </em>,
            );
        } else if (code !== undefined) {
            parts.push(<code key={key}>{code}</code>);
        } else {
            parts.push(<LinkView key={key} label={label ?? ""} target={target ?? ""} go={go} />);
        }

        from = match.index + match[0].length;
    }

    parts.push(text.slice(from));
    return <>{parts}</>;
}

function BlockView({ block, anchors, go }: { block: Block; anchors: Map<Block, string>; go: (anchor: string) => void; })
{
    switch (block.kind) {
        case "heading": {
            const Tag = `h${Math.min(block.level + 1, 6)}` as "h4";
            return (
                <Tag id={anchors.get(block)}>
                    <Inline text={block.text} go={go} />
                </Tag>
            );
        }

        case "paragraph":
            return (
                <p>
                    <Inline text={block.text} go={go} />
                </p>
            );

        case "list": {
            const items = block.items.map((item, index) => (
                <li key={index}>
                    <Inline text={item} go={go} />
                </li>
            ));
            return block.ordered ? <ol>{items}</ol> : <ul>{items}</ul>;
        }

        case "table":
            return (
                <div class="guide-table">
                    <table>
                        <thead>
                            <tr>
                                {block.head.map((cell, index) => (
                                    <th key={index} scope="col">
                                        <Inline text={cell} go={go} />
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {block.rows.map((row, index) => (
                                <tr key={index}>
                                    {row.map((cell, column) => (
                                        <td key={column}>
                                            <Inline text={cell} go={go} />
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            );
        case "quote":
            return (
                <blockquote>
                    <Blocks blocks={block.blocks} anchors={anchors} go={go} />
                </blockquote>
            );
        case "code":
            return <pre><code>{block.text}</code></pre>;
        case "rule":
            return null;
    }
}

/** A link: to a heading of the guide, which go brings into sight, leaving the address as it is (it names the game); to a page of the web, in a new tab. */
function LinkView({ label, target, go }: { label: string; target: string; go: (anchor: string) => void; })
{
    if (target.startsWith("#")) {
        return (
            <a
                href={target}
                onClick={(event) => {
                    event.preventDefault();
                    go(target.slice(1));
                }}
            >
                <Inline text={label} go={go} />
            </a>
        );
    }

    // Only a web address is a link, never a script.
    if (!/^https?:\/\//i.test(target)) {
        return <Inline text={label} go={go} />;
    }

    return (
        <a href={target} target="_blank" rel="noreferrer">
            <Inline text={label} go={go} />
        </a>
    );
}
