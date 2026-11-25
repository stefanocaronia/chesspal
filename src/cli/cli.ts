#!/usr/bin/env node
const args = process.argv.slice(2);
// The doorbell's flags, by the host whose hook passes each: Claude Code passes none.
const listenFlags = new Map<string, "codex" | "antigravity" | "opencode">([["--codex", "codex"], ["--antigravity", "antigravity"], ["--opencode", "opencode"]]);

// The table's own words (D-104): alone or open, its page; table, icon (--remove), play <host>. The host's: mcp, its server; listen, its doorbell; chat, how the chat
// started; prompt, the move the player wrote alone. Everything else is a command. Each loads only what it needs: prompt runs on every message of the chat.
if (args.length === 0) {
    await openTableHere(true);
} else if (args.length === 1 && args[0] === "open") {
    // The icon's: its console has no window, where a question would hang unseen.
    await openTableHere(false);
} else if (args.length === 1 && args[0] === "table") {
    await serveTable();
} else if (args.length === 1 && args[0] === "icon") {
    await putIconHere();
} else if (args.length === 2 && args[0] === "icon" && args[1] === "--remove") {
    const [{ defaultContext }, { iconsRemoved }] = await Promise.all([import("../commands/index.ts"), import("./icon.ts")]);
    console.log(iconsRemoved(defaultContext()));
} else if (args[0] === "play" && (args.length === 2 || (args.length === 4 && args[2] === "--home")) && !args[1]!.startsWith("-")) {
    // The data folder of a table started with CHESSPAL_HOME, which a terminal the table opens may not pass on (Terminal.app): the chat and its server read it.
    if (args[3] !== undefined) {
        process.env.CHESSPAL_HOME = args[3];
    }

    await playHere(args[1]!);
} else if (args.length === 1 && args[0] === "mcp") {
    await serveMcp();
} else if (args[0] === "listen" && (args.length === 1 || (args.length === 2 && listenFlags.has(args[1]!)))) {
    const { listen } = await import("../server/bell/index.ts");
    await listen(listenFlags.get(args[1] ?? "") ?? "claude");
} else if (args.length === 1 && args[0] === "chat") {
    const { recordChatStart } = await import("./chat-hook.ts");
    await recordChatStart();
} else if (args.length === 1 && args[0] === "prompt") {
    const { answerPrompt } = await import("./prompt-hook.ts");
    await answerPrompt();
} else {
    const { runCommandLine } = await import("./command-line.ts");
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
    const [{ noteFailure, openTable }, { defaultContext }, { offerIcon }] = await Promise.all([import("../server/table/index.ts"), import("../commands/index.ts"), import("./icon.ts")]);
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
            noteFailure(context, "open.log", (error as Error).message);
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
        console.error(`chesspal play takes claude, codex, antigravity or opencode, not ${host}.`);
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

/**
 * The MCP server of the chat: its SDK loads only here, so that every other command starts faster without it. A chat the table opened, as its environment
 * says, only passes its lines to the table, which runs its commands, and loads neither the server nor the commands.
 */
async function serveMcp(): Promise<void>
{
    const { pipeHere } = await import("../server/door/index.ts");
    const piped = await pipeHere(process.stdin, process.stdout, process.env);

    if (piped === undefined) {
        const { startMcpServer } = await import("../server/mcp/index.ts");
        await startMcpServer();
        return;
    }

    // What the table wrote last must reach the host before the process goes; the host's input may still be open.
    process.stdout.write("", () => process.exit(piped));
}

/** The table, until it closes: `chesspal` alone starts it apart from the terminal. */
async function serveTable(): Promise<void>
{
    const [{ npmUpdater, startTable, tableTimes, terminalChats }, { defaultContext }] = await Promise.all([import("../server/table/index.ts"), import("../commands/index.ts")]);

    try {
        const context = defaultContext();
        const table = await startTable(context, tableTimes, terminalChats(context), npmUpdater(context));
        console.log(table === undefined ? "Another Chesspal table, started at the same time, is open: this one closes." : `Chesspal's table: ${table.url}`);
        await table?.closed;
    } catch (error) {
        console.error((error as Error).message);
        process.exitCode = 1;
    }

    // Closed, the table waits for no host's models still being read: `opencode models` takes seconds when it must start OpenCode's background service, less once it runs.
    process.stdout.write("", () => process.exit());
}
