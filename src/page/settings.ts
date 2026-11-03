// The player's settings on the page (D-56): the look, the game's aids and the language, remembered by this browser until the profiles take them (T-19).

/** The piece sets: our two, whose colours the player picks, and cburnett with its own (D-52). */
export const pieceSets = ["nitida", "torretta", "cburnett"] as const;
export type PieceSet = typeof pieceSets[number];

/** The choices of each look, by the ids the style sheet knows; the first is the default (T-82). */
export const looks = {
    board: ["azzurro", "verde", "noce", "ardesia", "grigio", "lavanda", "ciliegio", "menta", "carta"],
    pieces: ["classico", "avorio", "notte", "bordeaux"],
    marks: ["arancione", "rosso", "blu", "verde"],
} as const;

export type Look = keyof typeof looks;

/** What the player chose. */
export interface Settings
{
    readonly theme: "system" | "light" | "dark";
    readonly board: string;
    readonly set: PieceSet;
    readonly pieces: string;
    readonly marks: string;
    readonly dots: boolean;
    readonly sound: boolean;
    readonly language: "auto" | "it" | "en";
}

/** The settings this browser remembers, each one it does not know taking its default; the theme and the sounds chosen before the panel come along. */
export function loadSettings(): Settings
{
    const saved = read(remembered);
    const stored: Partial<Record<keyof Settings, unknown>> = saved === null ? {} : parsed(saved);
    const oldTheme = read("chesspal-theme");
    return {
        theme: oneOf(stored.theme, ["system", "light", "dark"], oldTheme === "light" || oldTheme === "dark" ? oldTheme : "system"),
        board: oneOf(stored.board, looks.board, looks.board[0]),
        set: oneOf(stored.set, pieceSets, pieceSets[0]),
        pieces: oneOf(stored.pieces, looks.pieces, looks.pieces[0]),
        marks: oneOf(stored.marks, looks.marks, looks.marks[0]),
        dots: typeof stored.dots === "boolean" ? stored.dots : true,
        sound: typeof stored.sound === "boolean" ? stored.sound : read("chesspal-sound") !== "off",
        language: oneOf(stored.language, ["auto", "it", "en"], "auto"),
    };
}

/** Remembers the settings in this browser. */
export function saveSettings(settings: Settings): void
{
    try {
        localStorage.setItem(remembered, JSON.stringify(settings));
    } catch {
        // The choices last as long as the page.
    }
}

/** Shows the settings' look on the page: the theme, the board's skin, the pieces' colours and the marks' colour, as attributes the style sheet reads. */
export function showSettings(settings: Settings): void
{
    const root = document.documentElement.dataset;
    root.theme = settings.theme === "system" ? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light") : settings.theme;
    root.board = settings.board;
    root.pieces = settings.pieces;
    root.marks = settings.marks;
}

/** The languages the page speaks in, by the setting: the browser's, or the one chosen. */
export function languagesOf(settings: Settings): readonly string[]
{
    return settings.language === "auto" ? navigator.languages : [settings.language];
}

const remembered = "chesspal-settings";

function read(key: string): string | null
{
    try {
        return localStorage.getItem(key);
    } catch {
        return null;
    }
}

function parsed(saved: string): Partial<Record<keyof Settings, unknown>>
{
    try {
        const value: unknown = JSON.parse(saved);
        return typeof value === "object" && value !== null ? value : {};
    } catch {
        return {};
    }
}

function oneOf<Choice extends string>(value: unknown, choices: readonly Choice[], fallback: Choice): Choice
{
    return choices.find((choice) => choice === value) ?? fallback;
}
