// The settings' panel (D-56): a dialog over the page, opened from the header's gear, which shows each choice at once and closes with Esc. Its sections are cards
// in two columns, one under 600px, and its choices short: segments, tiles, dots and switches (Stefano).
import type { ComponentChildren, JSX } from "preact";
import { useEffect, useRef } from "preact/hooks";
import { Piece } from "../pieces/pieces.tsx";
import { type Look, looks, pieceSets, type Settings } from "../profile/settings.ts";
import type { Text } from "../text.ts";

/** The panel of the settings, open while `open` is true: every change goes to `onChange` at once. */
export function SettingsPanel({ open, settings, onChange, onClose, text }: {
    open: boolean;
    settings: Settings;
    onChange: (settings: Settings) => void;
    onClose: () => void;
    text: Text;
})
{
    const dialog = useRef<HTMLDialogElement>(null);

    useEffect(() => {
        const element = dialog.current!;

        if (open && !element.open) {
            element.showModal();
        } else if (!open && element.open) {
            element.close();
        }
    }, [open]);

    const set = <Key extends keyof Settings>(key: Key, value: Settings[Key]): void => onChange({ ...settings, [key]: value });

    return (
        <dialog ref={dialog} class="dialog" aria-label={text.settings} onClose={onClose} onClick={(event) => event.target === dialog.current && onClose()}>
            <header>
                <h2>{text.settings}</h2>
                <button class="icon-button" type="button" title={text.close} aria-label={text.close} onClick={onClose}>
                    <svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M6 6L18 18M18 6L6 18" />
                    </svg>
                </button>
            </header>
            <div class="setting-columns">
                <Section title={text.look} icon={lookIcon}>
                    <div class="setting-group">
                        <p class="setting-label">{text.themeChoice}</p>
                        <Segments label={text.themeChoice}>
                            {(["system", "light", "dark"] as const).map((theme) => <Choice key={theme} on={settings.theme === theme} onPick={() => set("theme", theme)}>{text.themes[theme]}</Choice>)}
                        </Segments>
                    </div>
                    <div class="setting-group">
                        <p class="setting-label">
                            {text.boardSkin} <b>{nameOf(settings.board, text)}</b>
                        </p>
                        <Swatches look="board" label={text.boardSkin} settings={settings} onPick={(id) => set("board", id)} text={text} />
                    </div>
                    <div class="setting-group">
                        <p class="setting-label">{text.pieceSet}</p>
                        <div class="piece-sets" role="radiogroup" aria-label={text.pieceSet}>
                            {pieceSets.map((pieceSet) => (
                                <Choice key={pieceSet} on={settings.set === pieceSet} onPick={() => set("set", pieceSet)}>
                                    <span class="sample">
                                        <Piece letter="N" set={pieceSet} />
                                        <Piece letter="n" set={pieceSet} />
                                    </span>
                                    {nameOf(pieceSet, text)}
                                </Choice>
                            ))}
                        </div>
                    </div>
                    <div class="setting-group setting-pair">
                        <div>
                            <p class="setting-label">{text.pieceColours}</p>
                            <Swatches look="pieces" label={text.pieceColours} settings={settings} onPick={(id) => set("pieces", id)} text={text} />
                        </div>
                        <div>
                            <p class="setting-label">{text.marksColour}</p>
                            <Swatches look="marks" label={text.marksColour} settings={settings} onPick={(id) => set("marks", id)} text={text} />
                        </div>
                    </div>
                </Section>
                <div class="setting-column">
                    <Section title={text.play} icon={playIcon}>
                        <Switch on={settings.dots} onSwitch={(on) => set("dots", on)}>{text.dots}</Switch>
                        <Switch on={settings.squareNames} onSwitch={(on) => set("squareNames", on)}>{text.squareNames}</Switch>
                        <Switch on={settings.explain} onSwitch={(on) => set("explain", on)}>{text.explain}</Switch>
                        <Switch on={settings.book} onSwitch={(on) => set("book", on)}>{text.bookBadges}</Switch>
                        <Switch on={settings.helps} onSwitch={(on) => set("helps", on)}>{text.helps}</Switch>
                        <Switch on={settings.sound} onSwitch={(on) => set("sound", on)}>{text.sounds}</Switch>
                        <Switch on={settings.voice} onSwitch={(on) => set("voice", on)}>{text.voice}</Switch>
                    </Section>
                    <Section title={text.languageChoice} icon={languageIcon}>
                        <Segments label={text.languageChoice}>
                            {(["auto", "it", "en"] as const).map((language) => <Choice key={language} on={settings.language === language} onPick={() => set("language", language)}>{text.languages[language]}</Choice>)}
                        </Segments>
                    </Section>
                </div>
            </div>
        </dialog>
    );
}

// The sections' line icons: a palette, a pawn, a globe.
const lookIcon = (
    <>
        <path d="M12 3a9 9 0 1 0 0 18c1.2 0 1.8-.8 1.8-1.7 0-1.2-1-1.6-1-2.6 0-1 .8-1.7 1.8-1.7H17a4 4 0 0 0 4-4C21 6.5 17 3 12 3Z" />
        <circle cx="7.5" cy="11" r="1.2" />
        <circle cx="10" cy="7" r="1.2" />
        <circle cx="14.5" cy="7" r="1.2" />
    </>
);

const playIcon = (
    <>
        <circle cx="12" cy="6.5" r="2.8" />
        <path d="M9.6 10.5h4.8M10.3 10.5c0 3-1.3 5.5-2.8 7.5h9c-1.5-2-2.8-4.5-2.8-7.5M6.5 20.5h11" />
    </>
);

const languageIcon = (
    <>
        <circle cx="12" cy="12" r="9" />
        <path d="M3 12h18M12 3c2.5 2.5 3.6 5.5 3.6 9s-1.1 6.5-3.6 9c-2.5-2.5-3.6-5.5-3.6-9S9.5 5.5 12 3Z" />
    </>
);

function Section({ title, icon, children }: { title: string; icon: JSX.Element; children: ComponentChildren; })
{
    return (
        <section class="setting-card">
            <h3>
                <svg class="icon" viewBox="0 0 24 24" aria-hidden="true">{icon}</svg>
                {title}
            </h3>
            {children}
        </section>
    );
}

/** The choices of a look, each a tile or a dot drawn by the style sheet with the look's own colours, its name in its title and for a screen reader. */
function Swatches({ look, label, settings, onPick, text }: { look: Look; label: string; settings: Settings; onPick: (id: string) => void; text: Text; })
{
    return (
        <div class={look === "board" ? "swatches skins" : "swatches"} role="radiogroup" aria-label={label}>
            {looks[look].map((id) => (
                <button
                    key={id}
                    class="swatch"
                    type="button"
                    role="radio"
                    aria-checked={settings[look] === id}
                    title={nameOf(id, text)}
                    aria-label={nameOf(id, text)}
                    onClick={() => onPick(id)}
                    {...{ [`data-${look}`]: id }}
                >
                    {look === "board" ? [0, 1, 2, 3].map((square) => <i key={square} />) : null}
                </button>
            ))}
        </div>
    );
}

function Segments({ label, children }: { label: string; children: ComponentChildren; })
{
    return <div class="segments" role="radiogroup" aria-label={label}>{children}</div>;
}

function Choice({ on, onPick, children }: { on: boolean; onPick: () => void; children: ComponentChildren; })
{
    return (
        <button type="button" role="radio" aria-checked={on} onClick={onPick}>
            {children}
        </button>
    );
}

function Switch({ on, onSwitch, children }: { on: boolean; onSwitch: (on: boolean) => void; children: ComponentChildren; })
{
    return (
        <label class="switch">
            <span>{children}</span>
            <input type="checkbox" role="switch" checked={on} onChange={(event) => onSwitch(event.currentTarget.checked)} />
        </label>
    );
}

function nameOf(id: string, text: Text): string
{
    return text.names[id] ?? id;
}
