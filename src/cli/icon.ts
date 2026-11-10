// The icon from the command line (D-104): `chesspal` alone asks, in a terminal and once a machine, whether to put it on the desktop and in the menu;
// `chesspal icon` puts it there whenever the player wants it.
import { createInterface } from "node:readline/promises";
import { styleText } from "node:util";
import { type Context, speaksItalian } from "../commands/index.ts";
import { iconAsked, iconCommand, type IconPlaces, iconToRemake, makeIcons, noteIconAsked, noteIconMade } from "../server/table/index.ts";

/** Where `chesspal` alone runs: its input and output, which ask only when both are a terminal, and its environment. The tests give their own. */
export interface Terminal
{
    readonly input: NodeJS.ReadableStream & { readonly isTTY?: boolean; };
    readonly output: NodeJS.WritableStream & { readonly isTTY?: boolean; };
    readonly env: NodeJS.ProcessEnv;
}

/**
 * Asks once a machine, in a terminal on a screen, whether to put the icon on the desktop and in the menu, and puts it there on a yes: what to tell the
 * player, if anything. Once asked, an icon made by another Node or script is made again, without a word; a playtest's data folder is never asked about.
 */
export async function offerIcon(context: Context, terminal: Terminal = processTerminal(), places?: IconPlaces): Promise<string | undefined>
{
    const home = context.home();

    // The icon would open the table of the player's Documents, not the playtest's.
    if (terminal.env.CHESSPAL_HOME?.trim()) {
        return undefined;
    }

    if (iconAsked(home)) {
        if (iconToRemake(home, iconCommand(home))) {
            await iconsMade(context, places);
        }

        return undefined;
    }

    if (!onScreen(context.platform, terminal)) {
        return undefined;
    }

    const words = wordsFor(context);
    const reader = createInterface({ input: terminal.input, output: terminal.output });
    const answer = await reader.question(words.question).finally(() => reader.close());
    noteIconAsked(home);
    return yes(answer) ? (await iconsMade(context, places)).said : words.later;
}

/**
 * Puts the icon on the desktop and in the menu, and asks no more on this machine: what to tell the player, the files made or why there are none, and
 * whether it failed.
 */
export async function iconsMade(context: Context, places?: IconPlaces): Promise<{ said: string; failed: boolean; }>
{
    const words = wordsFor(context);

    try {
        const home = context.home();
        const command = iconCommand(home);
        const made = await makeIcons(context.platform, command, places);
        noteIconMade(home, command, made);
        return { said: `${styleText(["bold", "green"], `♜ ${words.made}`)}\n${styleText("dim", made.map((file) => `  ${file}`).join("\n"))}`, failed: false };
    } catch (error) {
        return { said: words.failed((error as Error).message), failed: true };
    }
}

function processTerminal(): Terminal
{
    return { input: process.stdin, output: process.stdout, env: process.env };
}

// A terminal the player sees: on Linux, one of a desktop, not one reached through SSH or WSL, where there is no desktop to put the icon on.
function onScreen(platform: string, terminal: Terminal): boolean
{
    const desktop = platform !== "linux" || Boolean(terminal.env.DISPLAY || terminal.env.WAYLAND_DISPLAY);
    return terminal.input.isTTY === true && terminal.output.isTTY === true && desktop;
}

// Yes unless it says no, in either language: Enter, "ok" and "sure" are yes, since the question is not asked again (Zoe).
function yes(answer: string): boolean
{
    return !answer.trim().toLowerCase().startsWith("n");
}

interface IconWords
{
    question: string;
    made: string;
    later: string;
    failed: (reason: string) => string;
}

// The words for the player (Zoe), with the menu as their system names it.
function wordsFor(context: Context): IconWords
{
    const system = context.platform === "win32" ? "windows" : context.platform === "darwin" ? "mac" : "linux";

    if (speaksItalian(context.language)) {
        const where = { windows: "nel menu Start", mac: "in Applicazioni", linux: "nel menu delle applicazioni" }[system];
        return {
            question: `Vuoi l'icona di Chesspal sul desktop e ${where}? Con un doppio clic apre la scacchiera. (Invio = sì, n = no) `,
            made: `Fatto: Chesspal è sul desktop e ${where}.`,
            later: "Va bene, niente icona. Se la vuoi più avanti, scrivi chesspal icon.",
            failed: (reason) => `Chesspal non è riuscito a mettere l'icona (${reason}). Riprova con chesspal icon.`,
        };
    }

    const where = { windows: "your Start menu", mac: "Applications", linux: "your applications menu" }[system];
    return {
        question: `Add a Chesspal icon to your desktop and ${where}? Double-click it to open the board. [Y/n] `,
        made: `Done: Chesspal is on your desktop and in ${where}.`,
        later: "All right, no icon. To add it later, type chesspal icon.",
        failed: (reason) => `Chesspal could not add its icon (${reason}). Try again with chesspal icon.`,
    };
}
