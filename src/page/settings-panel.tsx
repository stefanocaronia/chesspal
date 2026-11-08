// The settings' panel (D-56): a dialog over the page, opened from the header's gear, which shows each choice at once and closes with Esc.
import type { ComponentChildren } from "preact";
import { useEffect, useRef } from "preact/hooks";
import { Piece } from "./pieces.tsx";
import { type Look, looks, pieceSets, type Settings } from "./settings.ts";
import type { Text } from "./text.ts";

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
        <dialog ref={dialog} class="settings" aria-label={text.settings} onClose={onClose} onClick={(event) => event.target === dialog.current && onClose()}>
            <header>
                <h2>{text.settings}</h2>
                <button class="theme" type="button" title={text.close} aria-label={text.close} onClick={onClose}>
                    <svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M6 6L18 18M18 6L6 18" />
                    </svg>
                </button>
            </header>
            <h3>{text.look}</h3>
            <Choices label={text.themeChoice}>
                {(["system", "light", "dark"] as const).map((theme) => <Choice key={theme} on={settings.theme === theme} onPick={() => set("theme", theme)}>{text.themes[theme]}</Choice>)}
            </Choices>
            <Swatches look="board" label={text.boardSkin} settings={settings} onPick={(id) => set("board", id)} text={text} />
            <Choices label={text.pieceSet}>
                {pieceSets.map((pieceSet) => (
                    <Choice key={pieceSet} on={settings.set === pieceSet} onPick={() => set("set", pieceSet)}>
                        <span class="sample">
                            <Piece letter="N" set={pieceSet} />
                            <Piece letter="n" set={pieceSet} />
                        </span>
                        {text.names[pieceSet] ?? pieceSet}
                    </Choice>
                ))}
            </Choices>
            {settings.set === "cburnett" ? null : <Swatches look="pieces" label={text.pieceColours} settings={settings} onPick={(id) => set("pieces", id)} text={text} />}
            <Swatches look="marks" label={text.marksColour} settings={settings} onPick={(id) => set("marks", id)} text={text} />
            <h3>{text.play}</h3>
            <Toggle on={settings.dots} onSwitch={(on) => set("dots", on)}>{text.dots}</Toggle>
            <Toggle on={settings.explain} onSwitch={(on) => set("explain", on)}>{text.explain}</Toggle>
            <Toggle on={settings.book} onSwitch={(on) => set("book", on)}>{text.bookBadges}</Toggle>
            <Toggle on={settings.helps} onSwitch={(on) => set("helps", on)}>{text.helps}</Toggle>
            <Toggle on={settings.sound} onSwitch={(on) => set("sound", on)}>{text.sounds}</Toggle>
            <Toggle on={settings.voice} onSwitch={(on) => set("voice", on)}>{text.voice}</Toggle>
            <h3>{text.languageChoice}</h3>
            <Choices label={text.languageChoice}>
                {(["auto", "it", "en"] as const).map((language) => <Choice key={language} on={settings.language === language} onPick={() => set("language", language)}>{text.languages[language]}</Choice>)}
            </Choices>
        </dialog>
    );
}

/** The choices of a look, each a swatch drawn by the style sheet with the look's own colours. */
function Swatches({ look, label, settings, onPick, text }: { look: Look; label: string; settings: Settings; onPick: (id: string) => void; text: Text; })
{
    return (
        <Choices label={label}>
            {looks[look].map((id) => (
                <Choice key={id} on={settings[look] === id} onPick={() => onPick(id)}>
                    <span class="swatch" {...{ [`data-${look}`]: id }}>
                        <i />
                        {look === "marks" ? null : <i />}
                        {look === "board" ? <i /> : null}
                    </span>
                    {text.names[id] ?? id}
                </Choice>
            ))}
        </Choices>
    );
}

function Choices({ label, children }: { label: string; children: ComponentChildren; })
{
    return (
        <div class="choices" role="radiogroup" aria-label={label}>
            <span class="label">{label}</span>
            <div class="options">{children}</div>
        </div>
    );
}

function Choice({ on, onPick, children }: { on: boolean; onPick: () => void; children: ComponentChildren; })
{
    return (
        <button class="choice" type="button" role="radio" aria-checked={on} onClick={onPick}>
            {children}
        </button>
    );
}

function Toggle({ on, onSwitch, children }: { on: boolean; onSwitch: (on: boolean) => void; children: ComponentChildren; })
{
    return (
        <label class="toggle">
            <span>{children}</span>
            <input type="checkbox" role="switch" checked={on} onChange={(event) => onSwitch(event.currentTarget.checked)} />
        </label>
    );
}
