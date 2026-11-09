// The page's header: the Torretta and the name, the word on a game over or on the AI's draw offer, the player's draw and resignation, then the commands for
// the board, the sounds, the theme and the settings, and the player's picture.
import type { ComponentChildren } from "preact";
import type { VerdictKind } from "../app/phase.ts";
import { PlayerPicture } from "../avatars/avatars.tsx";
import { Torretta } from "../avatars/torretta.tsx";
import type { ProfileShown } from "../profile/profile.ts";
import type { Text } from "../text.ts";

/** What the player may do in a game going on (D-65): offer a draw on their turn, answer the AI's offer, resign. */
export interface GameActions
{
    /** Who offered the draw that stands. */
    readonly offer?: "player" | "ai";
    /** Whether the player may offer a draw now: on their turn, once each side has moved, with no offer standing. */
    readonly canOffer: boolean;
    onOffer(): void;
    onAnswer(accept: boolean): void;
    onResign(): void;
}

/**
 * The header, with how a game over ended, or that none goes on (D-77), or the AI's draw offer with the player's answer, the player's draw
 * and resignation in a game going on (D-65), a new game once the page has the folder's, the command that turns the board round and says whether it is
 * turned, the switches of the sounds and the theme, and the gear of the settings (D-56).
 */
export function Header({ text, verdict, kind, who, actions, onNewGame, standOut = false, onStudy, flipped, onFlip, sound, onSound, onTheme, onSettings, profile, onProfile }: {
    text: Text;
    verdict?: string;
    /** What the verdict is about, which gives its chip a colour and an icon. */
    kind?: VerdictKind;
    /** The AI's name before the verdict, cut short when long while the verb stays whole. */
    who?: string;
    actions?: GameActions;
    onNewGame?: () => void;
    /** Whether the new game is the next thing to do here, in the accent: in analysis, and between games while the player's card is folded away (D-77). */
    standOut?: boolean;
    /** Brings a game played elsewhere to analyse, while none goes on. */
    onStudy?: () => void;
    flipped: boolean;
    onFlip: () => void;
    sound: boolean;
    onSound: () => void;
    onTheme: () => void;
    onSettings: () => void;
    /** Who plays: their picture opens the menu of the players, in every phase. */
    profile?: ProfileShown;
    onProfile?: () => void;
})
{
    return (
        <header class="top">
            <Torretta size={34} />
            <b class="title">Chesspal</b>
            <p class={`verdict${kind === undefined ? "" : ` ${kind}`}`} role="status">
                {verdict === undefined || kind === undefined ? null : <Icon class="kind">{kindIcons[kind]}</Icon>}
                {who === undefined || verdict === undefined ? verdict : (
                    <>
                        <span class="ai-name">{who}</span>
                        <span>{verdict}</span>
                    </>
                )}
            </p>
            {actions === undefined ? null : <Actions actions={actions} text={text} />}
            {onNewGame === undefined ? null : (
                <button class={standOut ? "command primary" : "command"} type="button" title={text.newGame} onClick={onNewGame}>
                    <Icon class="new">
                        <path d="M12 5V19M5 12H19" />
                    </Icon>
                    <span>{text.newGame}</span>
                </button>
            )}
            {onStudy === undefined ? null : (
                <button class="command" type="button" title={text.study.title} onClick={onStudy}>
                    <Icon class="study">
                        <circle cx="10.5" cy="10.5" r="5.5" />
                        <path d="M14.5 14.5L20 20" />
                    </Icon>
                    <span>{text.study.title}</span>
                </button>
            )}
            <button class="command" type="button" title={text.flip} aria-pressed={flipped} onClick={onFlip}>
                <Icon class="flip">
                    <path d="M7 4V17M7 17L4 14M7 17L10 14M17 20V7M17 7L14 10M17 7L20 10" />
                </Icon>
                <span>{text.flip}</span>
            </button>
            <button class="icon-button" type="button" title={text.sounds} aria-label={text.sounds} aria-pressed={sound} onClick={onSound}>
                <Icon class="speaker">
                    <path d="M5 9.5H8.5L13 5.5V18.5L8.5 14.5H5Z" />
                    {sound ? <path d="M16.5 9A4 4 0 0 1 16.5 15M19 6.5A7.5 7.5 0 0 1 19 17.5" /> : <path d="M15.5 9L21.5 15M21.5 9L15.5 15" />}
                </Icon>
            </button>
            <button class="icon-button" type="button" title={text.theme} aria-label={text.theme} onClick={onTheme}>
                <Icon class="sun">
                    <circle cx="12" cy="12" r="4" />
                    <path d="M12 2V4M12 20V22M2 12H4M20 12H22M4.9 4.9L6.3 6.3M17.7 17.7L19.1 19.1M4.9 19.1L6.3 17.7M17.7 6.3L19.1 4.9" />
                </Icon>
                <Icon class="moon">
                    <path d="M20 14.5A8 8 0 1 1 9.5 4A6.5 6.5 0 0 0 20 14.5Z" />
                </Icon>
            </button>
            <button class="icon-button" type="button" title={text.settings} aria-label={text.settings} onClick={onSettings}>
                <Icon class="gear">
                    <circle cx="12" cy="12" r="3" />
                    <path d="M9.72 5.38L10.19 2.67L13.81 2.67L14.28 5.38L15.07 5.71L17.31 4.12L19.88 6.69L18.29 8.93L18.62 9.72L21.33 10.19L21.33 13.81L18.62 14.28L18.29 15.07L19.88 17.31L17.31 19.88L15.07 18.29L14.28 18.62L13.81 21.33L10.19 21.33L9.72 18.62L8.93 18.29L6.69 19.88L4.12 17.31L5.71 15.07L5.38 14.28L2.67 13.81L2.67 10.19L5.38 9.72L5.71 8.93L4.12 6.69L6.69 4.12L8.93 5.71Z" />
                </Icon>
            </button>
            {profile === undefined || onProfile === undefined ? null : (
                <button
                    class="icon-button player"
                    type="button"
                    title={`${profile.name}: ${text.profile.profiles}`}
                    aria-label={`${profile.name}: ${text.profile.profiles}`}
                    aria-haspopup="dialog"
                    onClick={onProfile}
                >
                    <PlayerPicture profile={profile} size={28} />
                </button>
            )}
        </header>
    );
}

/** The answer to the AI's draw offer while it stands, else the player's own offer; then the resignation. */
function Actions({ actions, text }: { actions: GameActions; text: Text; })
{
    const { offer, canOffer, onOffer, onAnswer, onResign } = actions;

    return (
        <>
            {offer === "ai"
                ? (
                    <>
                        <button class="command answer" type="button" title={text.acceptDraw} onClick={() => onAnswer(true)}>
                            <Icon class="accept">
                                <path d="M5 12.5L10 17L19 7" />
                            </Icon>
                            <span>{text.acceptDraw}</span>
                        </button>
                        <button class="command answer" type="button" title={text.declineDrawTitle} onClick={() => onAnswer(false)}>
                            <Icon class="decline">
                                <path d="M7 7L17 17M17 7L7 17" />
                            </Icon>
                            <span>{text.declineDraw}</span>
                        </button>
                    </>
                )
                : (
                    // Not disabled, which would hide its title: a click the player cannot make now has the server say why.
                    <button
                        class="command"
                        type="button"
                        title={offer === "player" ? text.drawOffered : canOffer ? text.offerDraw : text.offerDrawWhen}
                        aria-pressed={offer === "player"}
                        aria-disabled={!canOffer}
                        onClick={offer === "player" ? undefined : onOffer}
                    >
                        <Icon class="half">
                            <path d="M5 7L7.5 5V11M16 5L8 19M13.5 14.5C13.5 13 17.5 12.5 17.5 15C17.5 16.5 13.5 18 13.5 19H18" />
                        </Icon>
                        <span>{text.offerDraw}</span>
                    </button>
                )}
            <button class="command" type="button" title={text.resign} onClick={onResign}>
                <Icon class="resign">
                    <path d="M6 21V4M6 4H18L15.5 8.5L18 13H6" />
                </Icon>
                <span>{text.resign}</span>
            </button>
        </>
    );
}

// A pair of scales, a flag, two hands, a pause.
const kindIcons: Record<VerdictKind, ComponentChildren> = {
    analysis: <path d="M12 4V20M8 20H16M5 7H19M5 7L2.5 13A2.5 2 0 0 0 7.5 13ZM19 7L16.5 13A2.5 2 0 0 0 21.5 13Z" />,
    over: <path d="M6 21V4M6 4H17L14.5 8L17 12H6" />,
    offer: <path d="M3 12L7 8L11 10L14 7L21 12M7 14L10 17M10 13L13 16M13 12L16 15" />,
    idle: <path d="M9 6.5V17.5M15 6.5V17.5" />,
};

function Icon({ class: name, children }: { class: string; children: ComponentChildren; })
{
    return <svg class={`icon ${name}`} viewBox="0 0 24 24" aria-hidden="true">{children}</svg>;
}
