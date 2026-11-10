// The package as a player gets it: packed, installed in a temporary folder, run through npm's shim (the .cmd one on Windows) for its version and
// chesspal init, and the MCP server started as .mcp.json starts it, with initialize timed against its budget, tools/list and a call to status.
// Run it with: npm run smoke, after npm run build. It exits with 1 at the first check that fails.
import { type ChildProcessWithoutNullStreams, spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { createInterface } from "node:readline";

const repository = join(import.meta.dirname, "..", "..");
const { version } = JSON.parse(readFileSync(join(repository, "package.json"), "utf8")) as { version: string; };
// From the server's start to its answer to initialize, through the shim: about 250 ms on a developer's PC, more on a CI runner. The budget stops a server
// that starts several times slower, such as one that loads at once what it should load late, not a runner's noise.
const initializeBudget = 1_000;
const toolsNeeded = ["status", "new_game", "player_move", "ai_move", "look", "analyse_game"];
const shipped = /^(?:dist\/|instructions\/|package\.json$|README\.md$|LICENSE$)/;

const temporary = mkdtempSync(join(tmpdir(), "chesspal-smoke-"));
const installed = join(temporary, "install");
const bin = join(installed, "node_modules", ".bin");
const player = join(temporary, "player");
const environment = playerEnvironment();
mkdirSync(player);

try {
    const tarball = packed();
    install(tarball);
    check(`chesspal --version is ${version}`, chesspal("--version") === version);
    const server = initialised();
    await mcpSession(server.command, server.args);
} catch (error) {
    console.error(`✗ ${(error as Error).message}`);
    process.exitCode = 1;
} finally {
    removeTemporary();
}

/** The package packed as npm publishes it, with the files a player needs and none of the repository's own. */
function packed(): string
{
    const [pack] = JSON.parse(npm(["pack", "--json", "--pack-destination", temporary], repository)) as [{ filename: string; files: { path: string; }[]; }];
    const files = pack.files.map(({ path }) => path.replaceAll("\\", "/"));
    check(`npm pack: ${pack.filename}, ${files.length} files`, files.length > 0);
    check("the package holds the command line and the opponent's instructions", files.includes("dist/cli/cli.js") && files.includes("instructions/opponent.md") && files.includes("instructions/start.md"));
    const strays = files.filter((path) => !shipped.test(path));
    check(`the package holds nothing but dist/, instructions/ and its own files${strays.length === 0 ? "" : `: not ${strays.join(", ")}`}`, strays.length === 0);
    return join(temporary, pack.filename);
}

/** The package installed from its tarball in a folder of its own, as npm installs it for a player, with its dependencies and its bin. */
function install(tarball: string): void
{
    mkdirSync(installed);
    writeFileSync(join(installed, "package.json"), '{ "private": true }\n');
    npm(["install", tarball, "--omit=dev", "--no-audit", "--no-fund"], installed);
    // Without it, a chesspal of npm link on the PATH would answer in its place.
    check("npm install puts chesspal's shim in its bin folder", existsSync(join(bin, process.platform === "win32" ? "chesspal.cmd" : "chesspal")));
}

/** chesspal init in a new player's folder, and the server .mcp.json starts there. */
function initialised(): { command: string; args: string[]; }
{
    chesspal("init");
    const config = JSON.parse(readFileSync(join(player, ".mcp.json"), "utf8")) as { mcpServers?: { chesspal?: { command: string; args: string[]; }; }; };
    const server = config.mcpServers?.chesspal;
    check("chesspal init writes the chesspal server in .mcp.json", server !== undefined);
    const start = readFileSync(join(installed, "node_modules", "chesspal", "instructions", "start.md"), "utf8").trim();
    check("chesspal init writes the lines that start a chat in AGENTS.md", readFileSync(join(player, "AGENTS.md"), "utf8").includes(start));
    return server!;
}

/** The MCP server as the host starts it, from the player's folder: initialize within its budget, the tools listed, status called. */
async function mcpSession(command: string, args: string[]): Promise<void>
{
    const started = performance.now();
    const server = spawn(command, args, { cwd: player, env: environment });
    const session = sessionWith(server);

    try {
        const answer = await session.ask("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "chesspal-smoke", version } });
        const took = Math.round(performance.now() - started);
        check(`initialize answers in ${took} ms, within ${initializeBudget} ms`, took <= initializeBudget);
        check("the server is chesspal", (answer as { serverInfo?: { name?: string; }; }).serverInfo?.name === "chesspal");
        session.notify("notifications/initialized");

        const { tools } = await session.ask("tools/list", {}) as { tools: { name: string; }[]; };
        const missing = toolsNeeded.filter((name) => !tools.some((tool) => tool.name === name));
        check(`tools/list gives ${tools.length} tools${missing.length === 0 ? "" : `, without ${missing.join(", ")}`}`, missing.length === 0);

        const status = await session.ask("tools/call", { name: "status", arguments: {} }) as { content: { text?: string; }[]; isError?: boolean; };
        const text = status.content.map((part) => part.text ?? "").join("\n");
        check(`status answers: ${text.split("\n")[0]}`, status.isError !== true && text.startsWith(`Chesspal ${version}.`));
    } finally {
        server.stdin.end();
        // A server that does not leave is stopped; the check below says so, after the failure that came first, if any.
        await session.ended();
    }

    check("the server leaves when the host closes its input", server.exitCode === 0);
}

/** A JSON-RPC session over the server's input and output, a message a line, as MCP's stdio transport speaks it. */
function sessionWith(server: ChildProcessWithoutNullStreams): { ask: (method: string, params: object) => Promise<unknown>; notify: (method: string) => void; ended: () => Promise<void>; }
{
    const waiting = new Map<number, { resolve: (result: unknown) => void; reject: (error: Error) => void; }>();
    let errors = "";
    let broken: string | undefined;
    let next = 1;
    const failed = (reason: string): Error => new Error(`${reason}${errors === "" ? "" : `\n${errors.trim()}`}`);
    const exit = new Promise<void>((done) => {
        server.once("exit", () => done());
        // A server that cannot start, such as a command not found, sends no exit.
        server.once("error", (error) => (errors += `${error.message}\n`, done()));
    });
    server.stderr.on("data", (chunk: Buffer) => errors += chunk.toString());
    // Writing to a server that has left: its leaving is the failure to tell.
    server.stdin.on("error", () => undefined);
    createInterface({ input: server.stdout }).on("line", (line) => answered(line));

    function answered(line: string): void
    {
        let message: { id?: number; result?: unknown; error?: { message: string; }; };

        try {
            message = JSON.parse(line) as typeof message;
        } catch {
            // Anything else on the output breaks every host: no answer counts after it.
            broken = `the server wrote on its output a line that is not JSON-RPC: ${line.slice(0, 200)}`;
            waiting.forEach((asked) => asked.reject(failed(broken!)));
            waiting.clear();
            return;
        }

        const asked = message.id === undefined ? undefined : waiting.get(message.id);
        waiting.delete(message.id ?? 0);

        if (message.error === undefined) {
            asked?.resolve(message.result);
        } else {
            asked?.reject(new Error(`the server refused: ${message.error.message}`));
        }
    }

    return {
        ask: (method, params) =>
            new Promise((resolve, reject) => {
                if (broken !== undefined) {
                    reject(failed(broken));
                    return;
                }

                const id = next++;
                const timer = setTimeout(() => reject(failed(`${method} had no answer in 15 s`)), 15_000);
                waiting.set(id, { resolve: (result) => (clearTimeout(timer), resolve(result)), reject: (error) => (clearTimeout(timer), reject(error)) });
                void exit.then(() => reject(failed(`the server left before answering ${method}`)));
                server.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
            }),
        notify: (method) => server.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method })}\n`),
        ended: () =>
            new Promise((done) => {
                const timer = setTimeout(() => (stop(server), done()), 10_000);
                void exit.then(() => (clearTimeout(timer), done()));
            }),
    };
}

/** Stops a server and what it started: on Windows the node behind cmd /c, which outlives cmd. */
function stop(server: ChildProcessWithoutNullStreams): void
{
    if (process.platform === "win32" && server.pid !== undefined) {
        spawnSync("taskkill", ["/pid", String(server.pid), "/t", "/f"]);
    } else {
        server.kill("SIGKILL");
    }
}

/** chesspal as a player's terminal runs it: through npm's shim in the installed bin folder, found on the PATH. */
function chesspal(args: string): string
{
    const run = spawnSync(`chesspal ${args}`, { cwd: player, env: environment, shell: true, encoding: "utf8" });

    if (run.status !== 0) {
        throw new Error(`chesspal ${args} failed (${run.status ?? run.signal ?? run.error?.message}): ${run.stderr || run.stdout}`);
    }

    return run.stdout.trim();
}

/** npm, as npm run gives it to its scripts without a shell; alone, npm is a .cmd on Windows, which needs one. */
function npm(args: string[], cwd: string): string
{
    const script = process.env.npm_execpath;
    const run = script === undefined
        ? spawnSync(["npm", ...args.map((arg) => JSON.stringify(arg))].join(" "), { cwd, shell: true, encoding: "utf8" })
        : spawnSync(process.execPath, [script, ...args], { cwd, encoding: "utf8" });

    if (run.status !== 0) {
        throw new Error(`npm ${args[0]} failed (${run.status ?? run.signal ?? run.error?.message}): ${run.stderr || run.stdout}`);
    }

    return run.stdout;
}

/** The environment of a player: the installed bin first on the PATH, and a data folder of the smoke's own, never the real Documents (D-71). */
function playerEnvironment(): NodeJS.ProcessEnv
{
    // Windows names it Path, and a copy of the environment is no longer blind to case.
    const pathName = Object.keys(process.env).find((name) => name.toUpperCase() === "PATH") ?? "PATH";
    return { ...process.env, [pathName]: `${bin}${delimiter}${process.env[pathName] ?? ""}`, CHESSPAL_HOME: join(temporary, "data") };
}

// A folder that cannot go, still held by a process, is named, and the failure before it stays the one told.
function removeTemporary(): void
{
    try {
        rmSync(temporary, { recursive: true, force: true, maxRetries: 5 });
    } catch (error) {
        console.error(`${temporary} is left behind: ${(error as Error).message}`);
    }
}

function check(what: string, passed: boolean): void
{
    if (!passed) {
        throw new Error(what);
    }

    console.log(`✓ ${what}`);
}
