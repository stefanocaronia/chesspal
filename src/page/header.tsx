// The page's header: the Torretta and the name, the word on a game over, then the commands for the board, the sounds, the theme and the settings.
import type { ComponentChildren } from "preact";
import type { Text } from "./text.ts";
import { Torretta } from "./torretta.tsx";

/**
 * The header, with how a game over ended and the new game standing out by it (T-77), a new game once the page has the folder's, the command that turns the board round and says whether it is turned, the switches of the
 * sounds and the theme, and the gear of the settings (D-56).
 */
export function Header({ text, verdict, onNewGame, flipped, onFlip, sound, onSound, onTheme, onSettings }: {
    text: Text;
    verdict?: string;
    onNewGame?: () => void;
    flipped: boolean;
    onFlip: () => void;
    sound: boolean;
    onSound: () => void;
    onTheme: () => void;
    onSettings: () => void;
})
{
    return (
        <header class="top">
            <Torretta size={34} />
            <b class="title">Chesspal</b>
            <p class="verdict" role="status">{verdict}</p>
            {onNewGame === undefined ? null : (
                <button class={`command${verdict === undefined ? "" : " primary"}`} type="button" title={text.newGame} onClick={onNewGame}>
                    <Icon class="new">
                        <path d="M12 5V19M5 12H19" />
                    </Icon>
                    <span>{text.newGame}</span>
                </button>
            )}
            <button class="command" type="button" title={text.flip} aria-pressed={flipped} onClick={onFlip}>
                <Icon class="flip">
                    <path d="M7 4V17M7 17L4 14M7 17L10 14M17 20V7M17 7L14 10M17 7L20 10" />
                </Icon>
                <span>{text.flip}</span>
            </button>
            <button class="theme" type="button" title={text.sounds} aria-label={text.sounds} aria-pressed={sound} onClick={onSound}>
                <Icon class="speaker">
                    <path d="M5 9.5H8.5L13 5.5V18.5L8.5 14.5H5Z" />
                    {sound ? <path d="M16.5 9A4 4 0 0 1 16.5 15M19 6.5A7.5 7.5 0 0 1 19 17.5" /> : <path d="M15.5 9L21.5 15M21.5 9L15.5 15" />}
                </Icon>
            </button>
            <button class="theme" type="button" title={text.theme} aria-label={text.theme} onClick={onTheme}>
                <Icon class="sun">
                    <circle cx="12" cy="12" r="4" />
                    <path d="M12 2V4M12 20V22M2 12H4M20 12H22M4.9 4.9L6.3 6.3M17.7 17.7L19.1 19.1M4.9 19.1L6.3 17.7M17.7 6.3L19.1 4.9" />
                </Icon>
                <Icon class="moon">
                    <path d="M20 14.5A8 8 0 1 1 9.5 4A6.5 6.5 0 0 0 20 14.5Z" />
                </Icon>
            </button>
            <button class="theme" type="button" title={text.settings} aria-label={text.settings} onClick={onSettings}>
                <Icon class="gear">
                    <circle cx="12" cy="12" r="3" />
                    <path d="M9.72 5.38L10.19 2.67L13.81 2.67L14.28 5.38L15.07 5.71L17.31 4.12L19.88 6.69L18.29 8.93L18.62 9.72L21.33 10.19L21.33 13.81L18.62 14.28L18.29 15.07L19.88 17.31L17.31 19.88L15.07 18.29L14.28 18.62L13.81 21.33L10.19 21.33L9.72 18.62L8.93 18.29L6.69 19.88L4.12 17.31L5.71 15.07L5.38 14.28L2.67 13.81L2.67 10.19L5.38 9.72L5.71 8.93L4.12 6.69L6.69 4.12L8.93 5.71Z" />
                </Icon>
            </button>
        </header>
    );
}

function Icon({ class: name, children }: { class: string; children: ComponentChildren; })
{
    return <svg class={`icon ${name}`} viewBox="0 0 24 24" aria-hidden="true">{children}</svg>;
}
