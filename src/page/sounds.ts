// The board's sounds (T-71): a move, a capture, a check, a mate, a draw. Synthesised with Web Audio until Stefano's recordings take their place.
import type { Game } from "../core/index.ts";

/** What a move sounds like. */
export type Sound = "move" | "capture" | "check" | "mate" | "draw";

/** The sound of the game's last move, from how the board stands after it; none before the first move. */
export function soundOf(game: Game): Sound | undefined
{
    const last = game.lastMove;
    const { outcome } = game;

    if (last === undefined) {
        return undefined;
    }

    if (outcome.over) {
        return outcome.ending === "checkmate" ? "mate" : "draw";
    }

    return game.position.check ? "check" : last.san.includes("x") ? "capture" : "move";
}

/** Whether the player left the sounds on, as this browser remembers: on at first. */
export function soundOn(): boolean
{
    try {
        return localStorage.getItem(remembered) !== "off";
    } catch {
        return true;
    }
}

/** Remembers whether the player wants the sounds. */
export function rememberSound(on: boolean): void
{
    try {
        localStorage.setItem(remembered, on ? "on" : "off");
    } catch {
        // The choice lasts as long as the page.
    }
}

/** Lets the page play sounds: a browser plays none before the player has touched the page, so the first touch wakes them. */
export function wakeSounds(): void
{
    addEventListener("pointerdown", () => void audio()?.resume(), { once: true });
}

/** Plays a sound; a browser without Web Audio plays none. */
export function playSound(sound: Sound): void
{
    const context = audio();

    if (context === undefined) {
        return;
    }

    for (const { frequency, at, length, wave, volume } of tones[sound]) {
        const oscillator = new OscillatorNode(context, { type: wave, frequency });
        const gain = new GainNode(context, { gain: 0 });
        const start = context.currentTime + at;
        // A quick attack and a fall, as a struck note has.
        gain.gain.linearRampToValueAtTime(volume, start + 0.005);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + length);
        oscillator.connect(gain).connect(context.destination);
        oscillator.start(start);
        oscillator.stop(start + length);
    }
}

interface Tone
{
    readonly frequency: number;
    readonly at: number;
    readonly length: number;
    readonly wave: OscillatorType;
    readonly volume: number;
}

const remembered = "chesspal-sound";

// A wooden knock for a piece set down, two for a capture, a call for a check, a chord for a mate, a falling pair for a draw.
const tones: Readonly<Record<Sound, readonly Tone[]>> = {
    move: [{ frequency: 190, at: 0, length: 0.08, wave: "triangle", volume: 0.5 }, { frequency: 1200, at: 0, length: 0.02, wave: "sine", volume: 0.12 }],
    capture: [{ frequency: 170, at: 0, length: 0.08, wave: "triangle", volume: 0.5 }, { frequency: 240, at: 0.06, length: 0.1, wave: "triangle", volume: 0.45 }],
    check: [{ frequency: 660, at: 0, length: 0.14, wave: "sine", volume: 0.25 }, { frequency: 880, at: 0.11, length: 0.2, wave: "sine", volume: 0.25 }],
    mate: [523, 659, 784, 1047].map((frequency, index) => ({ frequency, at: index * 0.06, length: 0.9, wave: "sine" as const, volume: 0.18 })),
    draw: [{ frequency: 440, at: 0, length: 0.3, wave: "sine", volume: 0.2 }, { frequency: 349, at: 0.22, length: 0.45, wave: "sine", volume: 0.2 }],
};

let shared: AudioContext | undefined;

function audio(): AudioContext | undefined
{
    try {
        shared ??= new AudioContext();
        return shared;
    } catch {
        return undefined;
    }
}
