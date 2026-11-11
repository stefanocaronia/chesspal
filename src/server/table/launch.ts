// `chesspal` alone (D-104): the table's page opened in the browser, the table started first, apart from the terminal, when none of this version answers.
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { styleText } from "node:util";
import { type Context, speaksItalian } from "../../commands/index.ts";
import { tableFolder } from "../../home/index.ts";
import { version } from "../../version.ts";
import { openInBrowser } from "./browser.ts";
import { askToQuit, tableAt } from "./table.ts";

/** What opening the table does outside this process: start the table apart, open the browser, wait. The tests give their own. */
export interface TableLauncher
{
    /** Starts `chesspal table` apart from this process, which it outlives, in the data folder. */
    start(home: string): void;
    /** Opens the page in the browser: whether it could. */
    open(url: string): Promise<boolean>;
    wait(milliseconds: number): Promise<void>;
}

/**
 * Opens the table's page in the browser, the table started first when none answers, or when the one that does is of another version, which is asked to
 * quit; a table of this version another `chesspal` started meanwhile is as good. What to tell the player, in their language; a table that does not start
 * within ten seconds throws.
 */
export async function openTable(context: Context, launcher: TableLauncher = processLauncher(context.platform)): Promise<string>
{
    const home = context.home();
    const folder = tableFolder(home);
    const words = speaksItalian(context.language) ? italian : english;
    const deadline = context.now().getTime() + startWait;
    const asked = new Set<number>();
    let started = false;

    for (;;) {
        const table = await tableAt(folder);

        if (table?.version === version) {
            return styleText(["bold", "green"], `♜ ${(await launcher.open(table.url)) ? words.opened(table.url) : words.notOpened(table.url)}`);
        }

        if (table !== undefined && !asked.has(table.port)) {
            asked.add(table.port);
            await askToQuit(table.port);
        } else if (table === undefined && !started) {
            started = true;
            launcher.start(home);
        }

        if (context.now().getTime() >= deadline) {
            throw new Error(table === undefined ? words.notStarted : words.notQuit(table.url));
        }

        await launcher.wait(every);
    }
}

/**
 * Notes what went wrong where nobody reads a console, in a log of the table's folder, the last time alone: open.log, why the icon could not open the table;
 * update.log, why npm did not update Chesspal (D-108).
 */
export function noteFailure(context: Context, log: "open.log" | "update.log", message: string): void
{
    try {
        const folder = tableFolder(context.home());
        mkdirSync(folder, { recursive: true });
        writeFileSync(join(folder, log), `${context.now().toISOString()} ${message}\n`);
    } catch {
        // A data folder that cannot be written has no other place for it.
    }
}

/** The launcher of a real `chesspal`: the table started with the same Node and script, the page opened in the default browser. */
export function processLauncher(platform: string, command: string[] = [...process.execArgv, process.argv[1] ?? ""]): TableLauncher
{
    return {
        start: (home) => {
            // Its own process group, with no console and nothing of this one's: the terminal can close, the table stays.
            spawn(process.execPath, [...command, "table"], { cwd: home, detached: true, stdio: "ignore", windowsHide: true }).unref();
        },
        open: (url) => openInBrowser(url, platform),
        wait: (milliseconds) => new Promise((done) => setTimeout(done, milliseconds)),
    };
}

// A table answers within ten seconds of its start, an older one quitting first, looked for every tenth of a second.
const startWait = 10_000;
const every = 100;

/** What `chesspal` says to the player, in their language (D-32): Italian or English. */
interface LaunchWords
{
    opened: (url: string) => string;
    notOpened: (url: string) => string;
    notStarted: string;
    notQuit: (url: string) => string;
}

const english: LaunchWords = {
    opened: (url) => `Chesspal's table is open: ${url}`,
    notOpened: (url) => `Chesspal's table is at ${url}: open it in your browser.`,
    notStarted: "Chesspal's table did not start within ten seconds: run `chesspal table` to see why.",
    notQuit: (url) => `The table of another Chesspal version, at ${url}, did not close: close its pages in the browser and wait five minutes, then run chesspal again.`,
};

const italian: LaunchWords = {
    opened: (url) => `Il tavolo di Chesspal è aperto: ${url}`,
    notOpened: (url) => `Il tavolo di Chesspal è su ${url}: aprilo nel browser.`,
    notStarted: "Il tavolo di Chesspal non è partito in dieci secondi: lancia `chesspal table` per vedere perché.",
    notQuit: (url) => `Il tavolo di un'altra versione di Chesspal, su ${url}, non si è chiuso: chiudi le sue pagine nel browser, aspetta cinque minuti e lancia di nuovo chesspal.`,
};
