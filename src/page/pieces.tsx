// Zoe's set (T-9, D-46): classic Staunton shapes drawn from scratch on a grid of 100 (D-2), each a stack of solid parts and a few inner lines.
import type { ComponentChildren } from "preact";

/** A piece by its FEN letter, uppercase for White, drawn to fill its box; its colours come from the theme. */
export function Piece({ letter }: { letter: string; })
{
    const shape = shapes[letter.toUpperCase()];

    if (shape === undefined) {
        return null;
    }

    return (
        <svg class={`piece ${letter === letter.toUpperCase() ? "white" : "black"}`} viewBox="0 0 100 100" aria-hidden="true">
            <g class="body">{shape.body()}</g>
            <g class="detail">{shape.detail()}</g>
        </svg>
    );
}

// The parts drawn bottom to top, so the seams show: the foot, a ring, then the piece's own parts.
const foot = (half: number) => <path d={`M${50 - half} 89C${50 - half} 83 ${53 - half} 80 ${58 - half} 80H${42 + half}C${47 + half} 80 ${50 + half} 83 ${50 + half} 89Z`} />;
const ring = (half: number, y: number) => <rect x={50 - half} y={y} width={half * 2} height="6" rx="2" />;

const shapes: Readonly<Record<string, { body: () => ComponentChildren; detail: () => ComponentChildren; }>> = {
    P: {
        body: () => (
            <>
                {foot(25)}
                {ring(19, 75)}
                <path d="M35 76C38 67 44 61 45 55H55C56 61 62 67 65 76Z" />
                <rect x="37" y="51" width="26" height="6" rx="3" />
                <circle cx="50" cy="38" r="13" />
            </>
        ),
        detail: () => null,
    },
    R: {
        body: () => (
            <>
                {foot(28)}
                {ring(22, 75)}
                <path d="M32 76L35.5 42H64.5L68 76Z" />
                {ring(19, 38)}
                <path d="M31 40V17H39.5V24H46V17H54V24H60.5V17H69V40Z" />
            </>
        ),
        detail: () => <path d="M35.6 48H64.4" />,
    },
    N: {
        body: () => (
            <>
                {foot(27)}
                {ring(21, 75)}
                <path d="M71 76C75 59 74 41 65 28C63 25 61 23 59 22L60 11L53 18C51 17.5 49 17.5 47 18C38 21 31 30 25 41L19 51C17 55 18 59 22 61C25 62.5 28 62 31 60L37 56C40 54 44 53 47 52C44 58 38 64 34 70L31 76Z" />
            </>
        ),
        detail: () => (
            <>
                <path d="M41 33.5C42.5 31.5 45 31 46.5 32.5" />
                <circle class="dot" cx="44" cy="35" r="2.3" />
                <circle class="dot" cx="23.5" cy="53" r="1.6" />
                <path d="M64 31C69 42 70 56 67 70" />
                <path d="M47 52C49 49 50 46 50 43" />
            </>
        ),
    },
    B: {
        body: () => (
            <>
                {foot(25)}
                {ring(19, 75)}
                <path d="M35 76C38 66 43 61 44 56H56C57 61 62 66 65 76Z" />
                <rect x="36" y="51" width="28" height="6" rx="3" />
                <circle cx="50" cy="11" r="4.5" />
                <path d="M50 15C62 23 67 33 63.5 44C62 49 57 52 50 52C43 52 38 49 36.5 44C33 33 38 23 50 15Z" />
            </>
        ),
        detail: () => (
            <>
                <path d="M56 27L47.5 38" />
                <path d="M45 45.5H55" />
            </>
        ),
    },
    Q: {
        body: () => (
            <>
                {foot(28)}
                {ring(22, 75)}
                <path d="M32 76C37 66 41 59 41 52H59C59 59 63 66 68 76Z" />
                <rect x="35" y="47" width="30" height="6" rx="3" />
                <path d="M35 49L26 24L37.5 38L40 18L47 35L50 14L53 35L60 18L62.5 38L74 24L65 49Z" />
                <circle cx="26" cy="22.5" r="4" />
                <circle cx="40" cy="16" r="4" />
                <circle cx="50" cy="11.5" r="4" />
                <circle cx="60" cy="16" r="4" />
                <circle cx="74" cy="22.5" r="4" />
            </>
        ),
        detail: () => <path d="M38 42H62" />,
    },
    K: {
        body: () => (
            <>
                {foot(28)}
                {ring(22, 75)}
                <path d="M32 76C37 66 41 59 41 52H59C59 59 63 66 68 76Z" />
                <rect x="35" y="47" width="30" height="6" rx="3" />
                <path d="M47 6H53V12H59V18H53V27H47V18H41V12H47Z" />
                <path d="M35.5 48C30 38 34 27 50 27C66 27 70 38 64.5 48Z" />
            </>
        ),
        detail: () => <path d="M38 41H62" />,
    },
};
