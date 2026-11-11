// A newer Chesspal (D-108): on the table's page the header's mark opens this window, which installs it between games; the table and its chat then start
// again from it, and the page loads again by itself.
import { useEffect, useState } from "preact/hooks";
import { Dialog } from "../dialogs/dialog.tsx";
import type { ServerRefusal, Text } from "../text.ts";

/**
 * The window that installs the newer Chesspal: its button waits while a game goes on and while npm installs; installed, the table waits for the game to
 * end; when npm fails, a cross and the commands to type.
 */
export function UpdateDialog({ open, version, current, installing, installed, going, chat, name, onClose, text }: {
    open: boolean;
    version: string;
    current: string | undefined;
    /** npm installs it, asked from this page or another; or has installed it, and the table waits to be at rest to start again. */
    installing: boolean;
    installed: boolean;
    going: boolean;
    /** The chat at the table: the one `chesspal play` holds, or one opened by hand. */
    chat: "held" | "byHand" | undefined;
    name: string;
    onClose: () => void;
    text: Text;
})
{
    const [sent, setSent] = useState(false);
    const [answer, setAnswer] = useState<Installed | undefined>(undefined);
    useEffect(() => setAnswer(undefined), [open]);
    const words = text.update;
    // Once npm has installed it the table closes to start again: the page waits for it, and loads again.
    const waiting = installing || (sent && answer === undefined) || (answer?.installed === true && !installed);
    const failed = answer?.installed === false;

    const install = async (): Promise<void> => {
        setSent(true);
        setAnswer(undefined);
        setAnswer(await askToInstall(text, name));
        setSent(false);
    };

    const stopped = waiting || installed || going;
    return (
        <Dialog open={open} title={words.title} onClose={onClose} text={text}>
            <p class="note update-offer">
                {words.offer(version, current)}
                {chat === "held" ? ` ${words.chatAgain(name)}` : chat === "byHand" ? ` ${words.byHand(name)}` : ""}
            </p>
            <button class={`command${failed ? "" : " primary"}`} type="button" aria-disabled={stopped} onClick={stopped ? undefined : () => void install()}>
                {words.install}
            </button>
            <p class="chat-state update-state" role="status">
                {waiting
                    ? (
                        <>
                            <span class="spinner" aria-hidden="true" />
                            {words.installing(version)}
                        </>
                    )
                    : installed
                    ? words.installed
                    : answer?.refused ?? (going ? words.whilePlaying : null)}
            </p>
            {failed
                ? (
                    <div class="update-failed" role="alert">
                        <p>
                            <span class="update-cross" aria-hidden="true">✕</span> {words.failed}
                        </p>
                        <code>npm install -g chesspal</code>
                        <code>chesspal</code>
                    </div>
                )
                : null}
        </Dialog>
    );
}

/** The header's mark of a newer Chesspal, on the table's page: it opens the window that installs it; while npm installs, or the table waits, it spins. */
export function UpdateMark({ version, installing, onOpen, text }: { version: string; installing: boolean; onOpen: () => void; text: Text; })
{
    const title = installing ? text.update.installing(version) : text.update.mark(version);
    return (
        <button class="icon-button update-button" type="button" title={title} aria-label={title} aria-haspopup="dialog" onClick={onOpen}>
            {installing ? <span class="spinner" aria-hidden="true" /> : (
                <svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
                    <circle cx="12" cy="12" r="10" />
                    <path d="M12 16.5V7.5M8 11.5L12 7.5L16 11.5" />
                </svg>
            )}
        </button>
    );
}

/** On a chat's own page, the strip with the command that installs the newer Chesspal; its × hides it until a newer one still is out. */
export function UpdateNotice({ version, name, text }: { version: string; name: string; text: Text; })
{
    const [hidden, setHidden] = useState(hiddenVersion);

    if (hidden === version) {
        return null;
    }

    const hide = (): void => {
        rememberHidden(version);
        setHidden(version);
    };

    return (
        <p class="outdated update-notice" role="status">
            <span>
                {text.update.notice(version, name)}
                <code>npm install -g chesspal</code>
            </span>
            <button class="icon-button" type="button" title={text.update.hide} aria-label={text.update.hide} onClick={hide}>
                <svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M6 6L18 18M18 6L6 18" />
                </svg>
            </button>
        </p>
    );
}

const hiddenKey = "chesspal-update-hidden";

function hiddenVersion(): string | undefined
{
    try {
        return localStorage.getItem(hiddenKey) ?? undefined;
    } catch {
        // A browser that keeps nothing for the page: the strip shows.
        return undefined;
    }
}

function rememberHidden(version: string): void
{
    try {
        localStorage.setItem(hiddenKey, version);
    } catch {
        // Hidden as long as the page.
    }
}

/** What the table answered: whether npm installed the version, or why it would not try, in the player's language. */
type Installed = { readonly installed: boolean; readonly refused?: undefined; } | { readonly installed?: undefined; readonly refused: string; };

async function askToInstall(text: Text, name: string): Promise<Installed>
{
    try {
        const response = await fetch("/api/table/update", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
        const body = (await response.json()) as { installed?: boolean; error?: string; refusal?: string; };

        if (response.ok) {
            return { installed: body.installed === true };
        }

        const known = body.refusal === undefined ? undefined : text.refused[body.refusal as ServerRefusal];
        return { refused: known?.(0, name) ?? body.error ?? response.statusText };
    } catch {
        // The table closed to start again before its answer came.
        return { installed: true };
    }
}
