// The helps' tactics (D-91): the facts of the position in lines, each opening on its pieces and their squares.
import type { PieceFacts, Side } from "../../core/index.ts";
import { Notch, Pushpin, Skewer } from "../board/marks.tsx";
import { Figurines } from "../game/move-list.tsx";
import { Figurine } from "../pieces/pieces.tsx";
import type { HelpsCardText, Text } from "../text.ts";
import { InfoIcon, type Pointing, pointing, RowIcon } from "./rows.tsx";
import { type HelpsView, pinSquares, riskSquares, squaresOf, type TacticLine } from "./view.ts";

/**
 * The tactics in lines (D-91): one a kind of fact and a side, its count, red when it threatens the player and green when it is their chance; a click opens
 * its pieces, each with its squares (Stefano).
 */
export function Tactics({ helps, opened, onOpen, onPoint, text }: {
    helps: HelpsView;
    opened: ReadonlySet<string>;
    onOpen: (key: string, open: boolean) => void;
    onPoint: (squares: readonly string[]) => void;
    text: Text;
})
{
    const words = text.helpsCard;
    const point = pointing(onPoint);
    const calm = !helps.lines.some((line) => line.kind === "risk" || line.kind === "pin" || line.kind === "skewer");

    return (
        <ul class="help-rows">
            {calm
                ? (
                    <li class="safe">
                        <RowIcon>
                            <circle cx="8" cy="8" r="6.5" />
                            <path d="M5.2 8.2l2 2 3.8-4" />
                        </RowIcon>
                        {words.nothingAtRisk}
                    </li>
                )
                : null}
            {helps.lines.map((line) => {
                const key = line.kind === "loose" ? "loose" : `${line.kind} ${line.side}`;
                const open = opened.has(key);
                return (
                    <li key={key} class={`help-line ${line.kind} ${line.tone}${open ? " open" : ""}`}>
                        <button type="button" class="line-head" aria-expanded={open} onClick={() => onOpen(key, !open)} {...point(squaresOf(line))}>
                            <LineIcon kind={line.kind} />
                            <span class="line-name">{line.kind === "loose" ? words.loose : words.line(line.kind, line.side, helps.you, line.kind !== "check" || line.toMove)}</span>
                            <LineCount line={line} helps={helps} words={words} />
                        </button>
                        {open ? <LineDetails line={line} helps={helps} point={point} text={text} /> : null}
                    </li>
                );
            })}
        </ul>
    );
}

/** A line's sign, as the board draws it: the corner of a piece at risk, the pushpin, the skewer; a check's plus, the loose pieces' i; its colour is the line's. */
function LineIcon({ kind }: { kind: TacticLine["kind"]; })
{
    switch (kind) {
        case "risk":
            return <Notch />;
        case "pin":
            return <Pushpin />;
        case "skewer":
            return <Skewer />;
        case "loose":
            return <InfoIcon />;
        case "check":
            return (
                <RowIcon>
                    <circle cx="8" cy="8" r="6.5" />
                    <path d="M8 5v6M5 8h6" />
                </RowIcon>
            );
    }
}

/** How many: the loose pieces by side, each after its pawn, the player's first (Zoe); the others in one number. */
function LineCount({ line, helps, words }: { line: TacticLine; helps: HelpsView; words: HelpsCardText; })
{
    if (line.kind !== "loose") {
        return <b class="count">{line.items.length}</b>;
    }

    const name = (side: Side): string => helps.you === undefined ? words[side] : side === helps.you ? words.yours : words.theirs;
    const counts = helps.sides.map((side) => ({ side, count: line.items.filter((piece) => piece.side === side).length })).filter(({ count }) => count > 0);

    return (
        <span class="counts">
            {counts.map(({ side, count }) => (
                <span key={side} title={name(side)} aria-label={`${name(side)} ${count}`}>
                    <Figurine letter="P" side={side} />
                    <b class="count">{count}</b>
                </span>
            ))}
        </span>
    );
}

/** A line opened: its pieces, each lighting its own squares; the checks in figures; the loose pieces by side. */
function LineDetails({ line, helps, point, text }: { line: TacticLine; helps: HelpsView; point: (squares: readonly string[]) => Pointing; text: Text; })
{
    const words = text.helpsCard;

    switch (line.kind) {
        case "risk":
            return (
                <ul class="line-details">
                    {line.items.map((risk) => (
                        <li key={risk.piece.square} {...point(riskSquares(risk))}>
                            {text.piece(risk.piece.piece, risk.piece.side)} <Squares squares={[risk.piece.square]} /> · {words.attackers}: <Squares squares={risk.piece.attackers} />
                            {risk.why === "undefended" ? null : (
                                <>
                                    {" "}· {words.defenders}: <Squares squares={risk.piece.defenders} />
                                </>
                            )} · {words[risk.why]}
                        </li>
                    ))}
                </ul>
            );
        case "pin":
            return (
                <ul class="line-details">
                    {line.items.map((pin) => (
                        <li key={pin.piece.square} {...point(pinSquares(pin))}>
                            {text.piece(pin.piece.piece, pin.piece.side)} <Squares squares={[pin.piece.square]} /> {words.pinnedTo(pin.to.piece)} <Squares squares={[pin.to.square]} />, {words.pinnedBy(pin.by.piece)}{" "}
                            <Squares squares={[pin.by.square]} />
                        </li>
                    ))}
                </ul>
            );
        case "skewer":
            return (
                <ul class="line-details">
                    {line.items.map((skewer) => (
                        <li key={skewer.piece.square} {...point(pinSquares(skewer))}>
                            {text.piece(skewer.piece.piece, skewer.piece.side)} <Squares squares={[skewer.piece.square]} /> {words.skeweredBefore(skewer.to.piece)} <Squares squares={[skewer.to.square]} />, {words.pinnedBy(skewer.by.piece)}
                            {" "}
                            <Squares squares={[skewer.by.square]} />
                        </li>
                    ))}
                </ul>
            );
        case "check":
            return (
                <p class="line-details">
                    {line.items.map((check) => (
                        <span key={check} class="help-move">
                            <Figurines san={check} side={line.side} />
                        </span>
                    ))}
                </p>
            );
        case "loose":
            return (
                <p class="line-details">
                    {helps.sides.map((side) => <Pieces key={side} pieces={line.items.filter((piece) => piece.side === side)} />)}
                </p>
            );
    }
}

/** Pieces of one side, each its figure and its square. */
function Pieces({ pieces }: { pieces: readonly PieceFacts[]; })
{
    return pieces.length === 0 ? null : (
        <span class="help-pieces">
            {pieces.map((piece) => (
                <span key={piece.square} class="help-move">
                    <Figurine letter={piece.piece} side={piece.side} />
                    <b class="square-name">{piece.square}</b>
                </span>
            ))}
        </span>
    );
}

function Squares({ squares }: { squares: readonly string[]; })
{
    return <b class="square-name">{squares.join(", ")}</b>;
}
