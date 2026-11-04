// A dialog over the page, for the profiles and the new game.
import type { ComponentChildren } from "preact";
import { useEffect, useRef } from "preact/hooks";
import type { Text } from "./text.ts";

/** A dialog over the page, as the settings' one: Esc and a click outside close it; a step inside it goes back with the arrow beside its title. */
export function Dialog({ open, title, onBack, onClose, text, children }: {
    open: boolean;
    title: string;
    onBack?: (() => void) | undefined;
    onClose: () => void;
    text: Text;
    children: ComponentChildren;
})
{
    const dialog = useRef<HTMLDialogElement>(null);

    useEffect(() => {
        const element = dialog.current!;

        if (open && !element.open) {
            element.showModal();
            // The field marked autofocus takes the focus, which the dialog itself would keep.
            element.querySelector<HTMLElement>("[autofocus]")?.focus();
        } else if (!open && element.open) {
            element.close();
        }
    }, [open]);

    // A click on the backdrop reaches the dialog itself, as one on its padding does: only the first is outside its box.
    const closeOutside = (event: MouseEvent): void => {
        const box = dialog.current!.getBoundingClientRect();
        const inside = event.clientX >= box.left && event.clientX <= box.right && event.clientY >= box.top && event.clientY <= box.bottom;

        if (event.target === dialog.current && !inside) {
            onClose();
        }
    };

    return (
        <dialog ref={dialog} class="settings profiles" aria-label={title} onClose={onClose} onClick={closeOutside}>
            <header>
                {onBack === undefined ? null : (
                    <button class="theme" type="button" title={text.profile.back} aria-label={text.profile.back} onClick={onBack}>
                        <svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
                            <path d="M15 6L9 12L15 18" />
                        </svg>
                    </button>
                )}
                <h2>{title}</h2>
                <button class="theme" type="button" title={text.close} aria-label={text.close} onClick={onClose}>
                    <svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M6 6L18 18M18 6L6 18" />
                    </svg>
                </button>
            </header>
            {open ? children : null}
        </dialog>
    );
}
