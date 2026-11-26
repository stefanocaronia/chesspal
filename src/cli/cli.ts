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
} else if (args[0] === "play" && playArgs(args.slice(1)) !== undefined) {
    const play = playArgs(args.slice(1))!;

    // The data folder of a table started with CHESSPAL_HOME, which a terminal the table opens may not pass on (Terminal.app): the chat and its server read it.
    if (play.home !== undefined) {
        process.env.CHESSPAL_HOME = play.home;
    }

    await playHere(play.host, play.review);
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

/**
 * What `chesspal play` is given: its host, then, from the table's buttons, `--review` or `--game`, what its chat is for, and `--home` with the data folder;
 * undefined for anything else, which the help refuses.
 */
function playArgs(args: readonly string[]): { host: string; review?: boolean; home?: string; } | undefined
{
    const [host, ...rest] = args;
    const purpose = rest[0] === "--review" || rest[0] === "--game" ? rest.shift() : undefined;
    const home = rest[0] === "--home" && rest.length === 2 ? rest[1] : undefined;

    if (host === undefined || host.startsWith("-") || (rest.length > 0 && home === undefined)) {
        return undefined;
    }

    return { host, ...(purpose === undefined ? {} : { review: purpose === "--review" }), ...(home === undefined ? {} : { home }) };
}

/** A chat at the table in this terminal, in the host named, until it ends: what the table's buttons run. */
async function playHere(host: string, review?: boolean): Promise<void>
{
    const [{ isHostName, playHost }, { defaultContext }] = await Promise.all([import("../server/table/index.ts"), import("../commands/index.ts")]);

    if (!isHostName(host)) {
        console.error(`chesspal play takes claude, codex, antigravity or opencode, not ${host}.`);
        process.exitCode = 1;
        return;
    }

    try {
        process.exitCode = await playHost(defaultContext(), host, review);
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

/**
 * The table, until it closes, and the chats it drives: `chesspal` alone starts it apart from the terminal. However it ends, idle, asked to quit, started
 * again for an update, at a signal or an error nobody caught, it waits for the programs it started to end by themselves, `programsWait` at most, before
 * its exit: on Windows the exit stops them at once, and a host stopped while it renews the player's sign-in signs them out.
 */
async function serveTable(): Promise<void>
{
    const [{ npmUpdater, programsWait, startTable, tableTimes, terminalChats }, { drivenChats }, { defaultContext }, { childrenEnded, guardProcess }] = await Promise.all([
        import("../server/table/index.ts"),
        import("../server/driven/index.ts"),
        import("../commands/index.ts"),
        import("../hosts/index.ts"),
    ]);
    const log = (line: string): void =>
        void process.stderr.write(`${line}
`);
    const programsEnded = (): Promise<boolean> => childrenEnded("the table", programsWait, log);
    let close = (): void => undefined;
    const exit = (code: number): void => void process.stdout.write("", () => process.exit(code));

    // An error nobody caught closes the table as a quit does, and ends it with 1 once its programs ended.
    const failed = (): void => {
        process.exitCode = 1;
        close();
    };

    const unguard = guardProcess("chesspal table", "the table", log, failed, exit, programsWait);
    const stop = (): void => close();
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);

    try {
        const context = defaultContext();
        // The chat the table drives itself, over the terminal's: its places, with the MCP server, load at its first opening.
        const chesspal = [process.execPath, ...process.execArgv, process.argv[1] ?? ""];
        const places = async () => (await import("../server/places/index.ts")).tablePlaces(context);
        const chats = drivenChats(context, { terminal: terminalChats(context, chesspal), places, chesspal });
        close = () => void chats.close?.();
        const table = await startTable(context, tableTimes, chats, npmUpdater(context), programsEnded);
        console.log(table === undefined ? "Another Chesspal table, started at the same time, is open: this one closes." : `Chesspal's table: ${table.url}`);

        if (table !== undefined) {
            close = () => void table.close();
        }

        await table?.closed;
    } catch (error) {
        console.error((error as Error).message);
        process.exitCode = 1;
        close();
        await programsEnded();
    }

    process.off("SIGINT", stop);
    process.off("SIGTERM", stop);
    unguard();
    // Closed, and its programs ended or waited for: the table waits for nothing else, as a list of models still being read.
    exit(typeof process.exitCode === "number" ? process.exitCode : 0);
}
