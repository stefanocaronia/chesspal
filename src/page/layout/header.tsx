// The page's header: the Torretta and the name, the word on a game over or on the AI's draw offer, the player's draw and resignation, then the commands for
// the board, the sounds, the theme and the settings, and the player's picture.
import type { ComponentChildren } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import type { VerdictKind } from "../app/phase.ts";
import { PlayerPicture } from "../avatars/avatars.tsx";
import { Torretta } from "../avatars/torretta.tsx";
import type { ProfileShown } from "../profile/profile.ts";
import { UpdateMark } from "../table/update.tsx";
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
    /** Resigns at once: the header has asked the player already. */
    onResign(): void;
}

/**
 * The header, with how a game over ended, or that none goes on (D-77), or the AI's draw offer with the player's answer, the player's draw
 * and resignation in a game going on (D-65), which the header asks to confirm in the place of the word and the commands, a new game once the page has the folder's, the command that turns the board round and says whether it is
 * turned, on the table the mark of a newer Chesspal (D-108), the switches of the sounds and the theme, the gear of the settings (D-56) and the book of
 * the guide.
 */
export function Header({ text, verdict, kind, who, actions, onNewGame, standOut = false, onStudy, flipped, onFlip, sound, onSound, onTheme, onSettings, onGuide, profile, onProfile, update, onUpdate }: {
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
    /** Opens the guide. */
    onGuide: () => void;
    /** Who plays: their picture opens the menu of the players, in every phase. */
    profile?: ProfileShown;
    onProfile?: () => void;
    /** On the table, a newer Chesspal: its mark opens the window that installs it, and spins while npm installs it (D-108). */
    update?: { readonly version: string; readonly installing: boolean; };
    onUpdate?: () => void;
})
{
    // The flag pressed asks the player in the header, as the AI's draw offer does; a game that ends meanwhile drops the question.
    const [resigning, setResigning] = useState(false);
    const asking = resigning && actions !== undefined;
    // After "play on" the flag takes the focus back.
    const backToFlag = useRef(false);

    useEffect(() => {
        if (actions === undefined) {
            setResigning(false);
        }
    }, [actions === undefined]);

    const answer = (resign: boolean): void => {
        setResigning(false);
        backToFlag.current = !resign;

        if (resign) {
            actions?.onResign();
        }
    };

    const shownKind = asking ? "over" : kind;
    const shownVerdict = asking ? text.resignGame : verdict;
    const shownWho = asking ? undefined : who;

    return (
        <header class="top">
            <Torretta size={34} />
            <b class="title">Chesspal</b>
            <p class={`verdict${shownKind === undefined ? "" : ` ${shownKind}`}`} role="status">
                {shownVerdict === undefined || shownKind === undefined ? null : <Icon class="kind">{kindIcons[shownKind]}</Icon>}
                {shownWho === undefined || shownVerdict === undefined ? shownVerdict : (
                    <>
                        <span class="ai-name">{shownWho}</span>
                        <span>{shownVerdict}</span>
                    </>
                )}
            </p>
            {actions === undefined ? null : asking ? <ResignQuestion onAnswer={answer} text={text} /> : <Actions actions={actions} onResign={() => setResigning(true)} backToFlag={backToFlag} text={text} />}
            {onNewGame === undefined ? null : (
                <button class={standOut ? "command primary" : "command"} type="button" title={text.newGame} onClick={onNewGame}>
                    <Icon class="new">
                        <path d="M12 5V19M5 12H19" />
                    </Icon>
                    <span>{text.newGame}</span>
                </button>
            )}
            {onStudy === undefined ? null : (
                <button class="icon-button" type="button" title={text.study.title} aria-label={text.study.title} aria-haspopup="dialog" onClick={onStudy}>
                    <Icon class="study">
                        <circle cx="10.5" cy="10.5" r="5.5" />
                        <path d="M14.5 14.5L20 20" />
                    </Icon>
                </button>
            )}
            <button class="icon-button flip-button" type="button" title={text.flip} aria-label={text.flip} aria-pressed={flipped} onClick={onFlip}>
                <Icon class="flip">
                    <path d="M7 4V17M7 17L4 14M7 17L10 14M17 20V7M17 7L14 10M17 7L20 10" />
                </Icon>
            </button>
            {update === undefined || onUpdate === undefined ? null : <UpdateMark version={update.version} installing={update.installing} onOpen={onUpdate} text={text} />}
            <button class="icon-button sound-button" type="button" title={text.sounds} aria-label={text.sounds} aria-pressed={sound} onClick={onSound}>
                <Icon class="speaker">
                    <path d="M5 9.5H8.5L13 5.5V18.5L8.5 14.5H5Z" />
                    {sound ? <path d="M16.5 9A4 4 0 0 1 16.5 15M19 6.5A7.5 7.5 0 0 1 19 17.5" /> : <path d="M15.5 9L21.5 15M21.5 9L15.5 15" />}
                </Icon>
            </button>
            <button class="icon-button theme-button" type="button" title={text.theme} aria-label={text.theme} onClick={onTheme}>
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
            <button class="icon-button guide-button" type="button" title={text.guide.title} aria-label={text.guide.title} aria-haspopup="dialog" onClick={onGuide}>
                <Icon class="book">
                    <path d="M12 6.5C10 5 7 4.5 3.5 5V18.5C7 18 10 18.5 12 20C14 18.5 17 18 20.5 18.5V5C17 4.5 14 5 12 6.5ZM12 6.5V20" />
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

/** The answer to the AI's draw offer while it stands, else the player's own offer; then the flag, which asks before the player resigns. */
function Actions({ actions, onResign, backToFlag, text }: { actions: GameActions; onResign: () => void; backToFlag: { current: boolean; }; text: Text; })
{
    const { offer, canOffer, onOffer, onAnswer } = actions;
    const flag = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        if (backToFlag.current) {
            backToFlag.current = false;
            flag.current?.focus();
        }
    }, []);

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
            <button ref={flag} class="command" type="button" title={text.resign} onClick={onResign}>
                <Icon class="resign">
                    <path d="M6 21V4M6 4H18L15.5 8.5L18 13H6" />
                </Icon>
                <span>{text.resign}</span>
            </button>
        </>
    );
}

/** The question the flag asks, as the answer to a draw offer: resign, or play on, which has the focus and Esc too. */
function ResignQuestion({ onAnswer, text }: { onAnswer: (resign: boolean) => void; text: Text; })
{
    const playOn = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        playOn.current?.focus();

        const escape = (event: KeyboardEvent): void => {
            if (event.key === "Escape") {
                onAnswer(false);
            }
        };

        window.addEventListener("keydown", escape);
        return () => window.removeEventListener("keydown", escape);
    }, []);

    return (
        <>
            <button class="command answer" type="button" title={text.resign} onClick={() => onAnswer(true)}>
                <Icon class="accept">
                    <path d="M5 12.5L10 17L19 7" />
                </Icon>
                <span>{text.resign}</span>
            </button>
            <button ref={playOn} class="command answer" type="button" title={text.keepPlaying} onClick={() => onAnswer(false)}>
                <Icon class="decline">
                    <path d="M7 7L17 17M17 7L7 17" />
                </Icon>
                <span>{text.keepPlaying}</span>
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
