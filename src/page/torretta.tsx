// The Torretta (D-45, D-46): the opponent and the logo, a rook that is a robot. Its screen shows the AI's mood (D-14, D-70): only the eyes, the mouth and the light change.
import { useRef } from "preact/hooks";
import type { Mood } from "../core/index.ts";

/** The Torretta at a size in pixels, with the face of a mood (neutral by default); with a label it is an image a screen reader names, else a decoration. */
export function Torretta({ size, label, mood = "neutral" }: { size: number; label?: string; mood?: Mood; })
{
    // The face pops in when the mood changes, never when the Torretta first shows (the logo, a card, a dialog).
    const changed = useChanged(mood);

    return (
        <svg class={`torretta mood-${mood}`} viewBox="0 0 128 128" width={size} height={size} role={label === undefined ? undefined : "img"} aria-label={label} aria-hidden={label === undefined ? "true" : undefined}>
            <path class="antenna" d="M64 31V19" />
            <circle class="light" cx="64" cy="16" r="5" />
            <rect class="shade" x="29" y="64" width="12" height="26" rx="2" />
            <rect class="shade" x="87" y="64" width="12" height="26" rx="2" />
            <path class="body" d="M34 30H47V40H57V30H71V40H81V30H94V54L89 58L92 106H36L39 58L34 54Z" />
            <rect class="shade" x="30" y="104" width="68" height="12" rx="4" />
            <rect class="screen" x="44" y="63" width="40" height="32" rx="7" />
            <g class={changed ? "expression changed" : "expression"} key={mood}>
                <Face mood={mood} />
            </g>
        </svg>
    );
}

/** Whether the mood has changed since the Torretta first showed: true from its first change on, so a face already shown never starts its entrance again. */
function useChanged(mood: Mood): boolean
{
    const first = useRef(mood);
    const changed = useRef(false);
    changed.current ||= mood !== first.current;
    return changed.current;
}

/** The eyes and the mouth of a mood, on the screen (x 44–84, y 63–95); strokes of 3.4 at least, to read at 40 px. */
function Face({ mood }: { mood: Mood; })
{
    switch (mood) {
        case "happy":
            // Eyes closed in two arcs, a wide open smile.
            return (
                <>
                    <path class="eyes line" d="M50.5 78.5a4.5 4.5 0 0 1 9 0M68.5 78.5a4.5 4.5 0 0 1 9 0" />
                    <path class="mouth" d="M57 84h14a7 7 0 0 1-14 0Z" />
                </>
            );
        case "surprised":
            // Wide eyes and a round mouth.
            return (
                <>
                    <g class="eyes">
                        <circle cx="54.5" cy="75.5" r="5.8" />
                        <circle cx="73.5" cy="75.5" r="5.8" />
                    </g>
                    <ellipse class="mouth" cx="64" cy="88.5" rx="3.4" ry="4" />
                </>
            );
        case "worried":
            // Brows raised in the middle, smaller eyes, a frown; the light turns red.
            return (
                <>
                    <path class="brows" d="M50 70L58 67M70 67L78 70" />
                    <g class="eyes">
                        <circle cx="55" cy="78.5" r="3.8" />
                        <circle cx="73" cy="78.5" r="3.8" />
                    </g>
                    <path class="mouth line" d="M56.5 91q7.5-6 15 0" />
                </>
            );
        case "thoughtful":
            // A glance to the side under one raised brow, the mouth pushed to the other side; the light breathes.
            return (
                <>
                    <path class="brows" d="M71 68L80 66" />
                    <g class="eyes">
                        <circle cx="58" cy="76.5" r="3.9" />
                        <circle cx="76" cy="76.5" r="3.9" />
                    </g>
                    <path class="mouth line" d="M52.5 89L63 87" />
                </>
            );
        case "sad":
            // No brows, the face sunk low: eyes half shut under lids that droop outwards, a deep frown; the light goes out.
            return (
                <>
                    <path class="eyes" d="M60.3 77.1A5.6 5.6 0 0 1 49.7 80.9ZM78.3 80.9A5.6 5.6 0 0 1 67.7 77.1Z" />
                    <path class="mouth line" d="M57.5 92.5q6.5-6.5 13 0" />
                </>
            );
        default:
            return (
                <>
                    <g class="eyes">
                        <circle cx="55" cy="76" r="4.6" />
                        <circle cx="73" cy="76" r="4.6" />
                    </g>
                    <rect class="mouth" x="58" y="85.4" width="12" height="3.2" rx="1.6" />
                </>
            );
    }
}
