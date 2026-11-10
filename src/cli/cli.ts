#!/usr/bin/env node
import { runCommandLine } from "./command-line.ts";

const args = process.argv.slice(2);

// The table's own words (D-104): alone or open, its page; table, icon, play <host>. The host's: mcp, its server; listen, its doorbell; chat, how the chat
// started. Everything else is a command.
if (args.length === 0) {
    await openTableHere(true);
} else if (args.length === 1 && args[0] === "open") {
    // The icon's: its console has no window, where a question would hang unseen.
    await openTableHere(false);
} else if (args.length === 1 && args[0] === "table") {
    await serveTable();
} else if (args.length === 1 && args[0] === "icon") {
    await putIconHere();
} else if (args.length === 2 && args[0] === "play" && !args[1]!.startsWith("-")) {
    await playHere(args[1]!);
} else if (args.length === 1 && args[0] === "mcp") {
    // The server and its SDK load only here: every other command starts faster without them.
    const { startMcpServer } = await import("../server/mcp.ts");
    await startMcpServer();
} else if (args[0] === "listen" && (args.length === 1 || (args.length === 2 && args[1] === "--codex"))) {
    const { listen } = await import("../server/bell.ts");
    await listen(args[1] === "--codex");
} else if (args.length === 1 && args[0] === "chat") {
    const { recordChatStart } = await import("./chat-hook.ts");
    await recordChatStart();
} else {
    const { output, exitCode } = await runCommandLine(args);

    if (exitCode === 0) {
        console.log(output);
    } else {
        console.error(output);
    }

    process.exitCode = exitCode;
}

/**
 * Opens the table's page, the table started apart when none answers, and returns: the terminal stays free. From a terminal, the first time on a machine
 * it asks first whether to put the icon on the desktop, before the page takes the screen; from the icon, which nobody reads, what went wrong is noted.
 */
async function openTableHere(fromTerminal: boolean): Promise<void>
{
    const [{ noteOpenFailed, openTable }, { defaultContext }, { offerIcon }] = await Promise.all([import("../server/table/index.ts"), import("../commands/index.ts"), import("./icon.ts")]);
    const context = defaultContext();

    try {
        const icon = fromTerminal ? await offerIcon(context) : undefined;

        if (icon !== undefined) {
            console.log(icon);
        }

        console.log(await openTable(context));
    } catch (error) {
        console.error((error as Error).message);
        process.exitCode = 1;

        if (!fromTerminal) {
            noteOpenFailed(context, (error as Error).message);
        }
    }
}

/** Puts the icon on the desktop and in the menu. */
async function putIconHere(): Promise<void>
{
    const [{ defaultContext }, { iconsMade }] = await Promise.all([import("../commands/index.ts"), import("./icon.ts")]);
    const { said, failed } = await iconsMade(defaultContext());

    if (failed) {
        console.error(said);
        process.exitCode = 1;
    } else {
        console.log(said);
    }
}

/** A chat at the table in this terminal, in the host named, until it ends: what the table's buttons run. */
async function playHere(host: string): Promise<void>
{
    const [{ isHostName, playHost }, { defaultContext }] = await Promise.all([import("../server/table/index.ts"), import("../commands/index.ts")]);

    if (!isHostName(host)) {
        console.error(`chesspal play takes claude or codex, not ${host}.`);
        process.exitCode = 1;
        return;
    }

    try {
        process.exitCode = await playHost(defaultContext(), host);
    } catch (error) {
        console.error((error as Error).message);
        process.exitCode = 1;
    }
}

/** The table, until it closes: `chesspal` alone starts it apart from the terminal. */
async function serveTable(): Promise<void>
{
    const [{ startTable, tableTimes, terminalChats }, { defaultContext }] = await Promise.all([import("../server/table/index.ts"), import("../commands/index.ts")]);

    try {
        const context = defaultContext();
        const table = await startTable(context, tableTimes, terminalChats(context));
        console.log(table === undefined ? "Another Chesspal table, started at the same time, is open: this one closes." : `Chesspal's table: ${table.url}`);
        await table?.closed;
    } catch (error) {
        console.error((error as Error).message);
        process.exitCode = 1;
    }
}
