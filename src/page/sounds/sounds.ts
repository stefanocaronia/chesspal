// The board's sounds (T-71): a move, a capture, a check, a mate, a draw, recorded by Stefano (T-80); a capture, a check and a mate play over the
// move's, as they are a piece set down too. A resignation, a flag fallen and a draw offered are electronic until he records them (T-100). A browser
// that cannot decode them, or a sound still loading, plays a tone synthesised with Web Audio instead.
import type { Game } from "../../core/index.ts";
import type { HowEnded } from "../game/ending.ts";

const folder = "/page/sounds/";

/** What a move, or a turn of the game without one, sounds like. */
export type Sound = "move" | "capture" | "check" | "mate" | "draw" | "resign" | "flag" | "offer";

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

/** The sound of a game ended without a move: a resignation, a flag fallen, a draw agreed; none for the ends that come with a move. */
export function endSoundOf(how: HowEnded | undefined): Sound | undefined
{
    return how === "resignation" ? "resign" : how === "time" ? "flag" : how === "agreement" ? "draw" : undefined;
}

/** Lets the page play sounds: loads the recordings, and since a browser plays none before the player has touched the page, the first touch wakes them. */
export function wakeSounds(): void
{
    loadRecordings();
    addEventListener("pointerdown", () => void audio()?.resume(), { once: true });
}

/** Plays a sound: its recordings together, else its tone; a browser without Web Audio plays none. */
export function playSound(sound: Sound): void
{
    const context = audio();

    if (context === undefined) {
        return;
    }

    const recorded = layers[sound].flatMap((layer) => recordings.get(layer) ?? []);

    if (recorded.length < layers[sound].length) {
        playTone(context, sound);
        return;
    }

    for (const recording of recorded) {
        const source = new AudioBufferSourceNode(context, { buffer: recording });
        source.connect(context.destination);
        source.start();
    }
}

/** Fetches and decodes the recordings, offline so that the page wakes no sound before a touch; one that fails leaves its tone. */
function loadRecordings(): void
{
    let decoder: OfflineAudioContext;

    try {
        decoder = new OfflineAudioContext({ length: 1, sampleRate: 48000 });
    } catch {
        return;
    }

    for (const sound of Object.keys(tones) as Sound[]) {
        void fetch(`${folder}${sound}.ogg`)
            .then((response) => response.ok ? response.arrayBuffer() : Promise.reject(new Error(`No ${sound}.ogg.`)))
            .then((bytes) => decoder.decodeAudioData(bytes))
            .then((buffer) => recordings.set(sound, buffer), () => undefined);
    }
}

function playTone(context: AudioContext, sound: Sound): void
{
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

// A wooden knock for a piece set down, two for a capture, a call for a check, a chord for a mate, a falling pair for a draw, three falling notes for a
// resignation, a timer's beeps for a flag, a rising pair for a draw offered.
const tones: Readonly<Record<Sound, readonly Tone[]>> = {
    move: [{ frequency: 190, at: 0, length: 0.08, wave: "triangle", volume: 0.5 }, { frequency: 1200, at: 0, length: 0.02, wave: "sine", volume: 0.12 }],
    capture: [{ frequency: 170, at: 0, length: 0.08, wave: "triangle", volume: 0.5 }, { frequency: 240, at: 0.06, length: 0.1, wave: "triangle", volume: 0.45 }],
    check: [{ frequency: 660, at: 0, length: 0.14, wave: "sine", volume: 0.25 }, { frequency: 880, at: 0.11, length: 0.2, wave: "sine", volume: 0.25 }],
    mate: [523, 659, 784, 1047].map((frequency, index) => ({ frequency, at: index * 0.06, length: 0.9, wave: "sine" as const, volume: 0.18 })),
    draw: [{ frequency: 440, at: 0, length: 0.3, wave: "sine", volume: 0.2 }, { frequency: 349, at: 0.22, length: 0.45, wave: "sine", volume: 0.2 }],
    resign: [523, 392, 262].map((frequency, index) => ({ frequency, at: index * 0.11, length: index === 2 ? 0.5 : 0.25, wave: "triangle" as const, volume: 0.25 })),
    flag: [
        ...[0, 0.11, 0.22].map((at) => ({ frequency: 988, at, length: 0.07, wave: "square" as const, volume: 0.06 })),
        { frequency: 440, at: 0.36, length: 0.4, wave: "triangle", volume: 0.25 },
    ],
    offer: [{ frequency: 659, at: 0, length: 0.45, wave: "sine", volume: 0.2 }, { frequency: 880, at: 0.16, length: 0.5, wave: "sine", volume: 0.2 }],
};

/** The recordings each sound plays at once. */
const layers: Readonly<Record<Sound, readonly Sound[]>> = {
    move: ["move"],
    capture: ["move", "capture"],
    check: ["move", "check"],
    mate: ["move", "mate"],
    draw: ["draw"],
    resign: ["resign"],
    flag: ["flag"],
    offer: ["offer"],
};
const recordings = new Map<Sound, AudioBuffer>();
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
