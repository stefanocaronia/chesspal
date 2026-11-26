import { randomBytes } from "node:crypto";
import { existsSync, mkdtempSync, rmSync, statSync } from "node:fs";
import { connect, createServer, type Socket } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { PassThrough } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type Door, doorPath, doorVariable, helloLine, keyVariable, openDoor, pipeToTable, readAnswer, readHello, tableEnded } from "../src/server/door/index.ts";

const version = "1.2.3";
const doors: Door[] = [];
const folders: string[] = [];

afterEach(async () => {
    await Promise.all(doors.splice(0).map((door) => door.close()));
    folders.splice(0).forEach((folder) => rmSync(folder, { recursive: true, force: true }));
});

function socketFolder(): string
{
    const folder = mkdtempSync(join(tmpdir(), "chesspal-door-"));
    folders.push(folder);
    return folder;
}

/** A door whose chats that sit are kept, with what came after their hello. */
async function door(options: { bytes?: (size: number) => Buffer; busyWait?: number; } = {}): Promise<{ door: Door; seated: { key: string; socket: Socket; rest: string; }[]; }>
{
    const seated: { key: string; socket: Socket; rest: string; }[] = [];
    const opened = await openDoor({ version, folder: socketFolder(), seated: (key, socket, rest) => void seated.push({ key, socket, rest: rest.toString("utf8") }), ...options });
    doors.push(opened);
    return { door: opened, seated };
}

/** A raw knock at a door: what it is told, line by line, and whether it closed. */
async function knockAt(path: string): Promise<{ socket: Socket; lines: string[]; closed: () => boolean; }>
{
    const socket = connect(path);
    const lines: string[] = [];
    let buffer = "";
    let closed = false;
    socket.setEncoding("utf8");
    socket.on("data", (chunk: string) => {
        buffer += chunk;
        const parts = buffer.split("\n");
        buffer = parts.pop() ?? "";
        lines.push(...parts);
    });
    socket.on("error", () => undefined);
    socket.on("close", () => (closed = true));
    await new Promise((done) => socket.once("connect", done));
    return { socket, lines, closed: () => closed };
}

describe("the hello", () => {
    it("reads a chat's hello and the table's answer, and nothing else, never throwing", () => {
        expect(readHello(helloLine({ key: "k", version }).trim())).toEqual({ key: "k", version });
        expect(readHello('{"key":"k","version":"1","more":true}')).toEqual({ key: "k", version: "1" });
        expect(readHello('{"key":1,"version":"1"}')).toBeUndefined();
        expect(readHello("GET / HTTP/1.1")).toBeUndefined();
        expect(readHello("null")).toBeUndefined();
        expect(readAnswer('{"ok":true}')).toEqual({ ok: true });
        expect(readAnswer('{"refused":"version"}')).toEqual({ refused: "version" });
        expect(readAnswer('{"refused":"other"}')).toBeUndefined();
        expect(readAnswer("{")).toBeUndefined();
    });

    it("names the door's socket: a named pipe on Windows, a socket file elsewhere", () => {
        expect(doorPath("ab12", "win32", "/tmp")).toBe("\\\\.\\pipe\\chesspal-table-ab12");
        expect(doorPath("ab12", "linux", "/tmp")).toBe(join("/tmp", "chesspal-table-ab12.sock"));
    });
});

describe("the table's door", () => {
    it("offers a key of 32 random bytes with the two variables of the chat's server, and seats a chat with it, the bytes after its hello kept", async () => {
        const bytes = vi.fn((size: number) => Buffer.alloc(size, size === 32 ? 0xab : 0x01));
        const { door: opened, seated } = await door({ bytes });
        const { key, environment } = opened.offer();

        expect(key).toBe("ab".repeat(32));
        expect(environment).toEqual({ [doorVariable]: opened.path, [keyVariable]: key });
        expect(opened.path).toContain("chesspal-table-0101010101010101");

        const chat = await knockAt(opened.path);
        chat.socket.write(`${helloLine({ key, version })}{"jsonrpc":"2.0","id":1}\n`);
        await vi.waitFor(() => expect(seated).toHaveLength(1));

        expect(chat.lines).toEqual(['{"ok":true}']);
        expect(seated[0]?.key).toBe(key);
        await vi.waitFor(() => expect(seated[0]?.rest).toBe('{"jsonrpc":"2.0","id":1}\n'));
    });

    it("refuses a wrong key, another version, a key already sitting and a closing door, each with its reason, and closes them", async () => {
        const { door: opened, seated } = await door({ busyWait: 100 });
        const { key } = opened.offer();

        const refusedWith = async (hello: string): Promise<string[]> => {
            const chat = await knockAt(opened.path);
            chat.socket.write(hello);
            await vi.waitFor(() => expect(chat.closed()).toBe(true));
            return chat.lines;
        };

        expect(await refusedWith(helloLine({ key: "f".repeat(64), version }))).toEqual(['{"refused":"key"}']);
        expect(await refusedWith(helloLine({ key, version: "9.9.9" }))).toEqual(['{"refused":"version"}']);

        const first = await knockAt(opened.path);
        first.socket.write(helloLine({ key, version }));
        await vi.waitFor(() => expect(seated).toHaveLength(1));
        expect(await refusedWith(helloLine({ key, version }))).toEqual(['{"refused":"busy"}']);

        // A knock the door has taken in, that has said nothing yet: a connection the door never took in is only closed.
        const late = await knockAt(opened.path);
        await new Promise((done) => setTimeout(done, 50));
        await opened.close();
        await vi.waitFor(() => expect(late.closed()).toBe(true));
        expect(late.lines).toEqual(['{"refused":"ending"}']);
        await vi.waitFor(() => expect(first.closed()).toBe(true));
        expect(seated).toHaveLength(1);
    });

    it("lets a key's new server sit once its earlier connection closes within a moment, and refuses it busy only after that moment", async () => {
        const { door: opened, seated } = await door({ busyWait: 300 });
        const { key } = opened.offer();
        const first = await knockAt(opened.path);
        first.socket.write(helloLine({ key, version }));
        await vi.waitFor(() => expect(seated).toHaveLength(1));

        // The host starts the server again while the earlier connection still closes.
        const again = await knockAt(opened.path);
        again.socket.write(helloLine({ key, version }));
        await new Promise((done) => setTimeout(done, 100));
        expect(again.lines).toEqual([]);
        first.socket.destroy();
        await vi.waitFor(() => expect(again.lines).toEqual(['{"ok":true}']));
        expect(seated).toHaveLength(2);

        const third = await knockAt(opened.path);
        const started = Date.now();
        third.socket.write(helloLine({ key, version }));
        await vi.waitFor(() => expect(third.closed()).toBe(true));
        expect(third.lines).toEqual(['{"refused":"busy"}']);
        expect(Date.now() - started).toBeGreaterThanOrEqual(250);
    });

    it.skipIf(process.platform === "win32")("keeps the socket file in a folder of its own, for the player alone, and takes it away as it closes", async () => {
        const { door: opened } = await door();
        const folder = dirname(opened.path);

        expect(statSync(folder).mode & 0o777).toBe(0o700);
        expect(existsSync(opened.path)).toBe(true);
        await opened.close();
        expect(existsSync(folder)).toBe(false);
    });

    it("says why it cannot open, and leaves no folder behind", async () => {
        const missing = join(socketFolder(), "missing");
        const failed = await openDoor({ version, platform: "linux", folder: missing, seated: () => undefined }).then(() => "opened", (error: Error) => error.message);

        expect(failed).toMatch(/^Chesspal's table could not open its door for the chats it opens at .*: start the table again\.$/);
        expect(existsSync(missing)).toBe(false);
    });

    it("closes without a word what says no hello, or a line too long", async () => {
        const { door: opened } = await door();

        for (const said of ["GET / HTTP/1.1\r\n\r\n", `${"x".repeat(5000)}\n`]) {
            const chat = await knockAt(opened.path);
            chat.socket.write(said);
            await vi.waitFor(() => expect(chat.closed()).toBe(true));
            expect(chat.lines).toEqual([]);
        }
    });

    it("seats a key again once its connection closed, as when a host starts its server again, and never once withdrawn", async () => {
        const { door: opened, seated } = await door();
        const { key } = opened.offer();
        const first = await knockAt(opened.path);
        first.socket.write(helloLine({ key, version }));
        await vi.waitFor(() => expect(seated).toHaveLength(1));
        first.socket.destroy();
        await vi.waitFor(() => expect(seated[0]?.socket.destroyed).toBe(true));

        const again = await knockAt(opened.path);
        again.socket.write(helloLine({ key, version }));
        await vi.waitFor(() => expect(seated).toHaveLength(2));
        expect(again.lines).toEqual(['{"ok":true}']);

        opened.withdraw(key);
        await vi.waitFor(() => expect(again.closed()).toBe(true));
        const after = await knockAt(opened.path);
        after.socket.write(helloLine({ key, version }));
        await vi.waitFor(() => expect(after.closed()).toBe(true));
        expect(after.lines).toEqual(['{"refused":"key"}']);
    });
});

describe("chesspal mcp in a chat the table opened", () => {
    const initialize = { jsonrpc: "2.0", id: 1, method: "initialize", params: {} };

    /** A table that answers each request with its method, and takes the chat's own lines down. */
    async function echoTable(): Promise<{ door: Door; key: string; sockets: Socket[]; }>
    {
        const sockets: Socket[] = [];
        let opened: Door | undefined;
        opened = await openDoor({
            version,
            folder: socketFolder(),
            seated: (_key, socket, rest) => {
                sockets.push(socket);
                let buffer = rest.toString("utf8");

                const answer = (): void => {
                    const parts = buffer.split("\n");
                    buffer = parts.pop() ?? "";

                    for (const line of parts) {
                        const message = JSON.parse(line) as { id?: number; method: string; };

                        if (message.id !== undefined) {
                            socket.write(`${JSON.stringify({ jsonrpc: "2.0", id: message.id, result: { method: message.method } })}\n`);
                        }
                    }
                };

                socket.on("data", (chunk: Buffer) => {
                    buffer += chunk.toString("utf8");
                    answer();
                });
                socket.on("end", () => socket.end());
                answer();
                socket.resume();
            },
        });
        doors.push(opened);
        return { door: opened, key: opened.offer().key, sockets };
    }

    function heardOn(output: PassThrough): string[]
    {
        const heard: string[] = [];
        output.setEncoding("utf8").on("data", (chunk: string) => heard.push(chunk));
        return heard;
    }

    it("pipes the host's lines to the table and its answers back, and exits with 0 once the host's input ends", async () => {
        const table = await echoTable();
        const input = new PassThrough();
        const output = new PassThrough();
        const heard = heardOn(output);
        input.write(`${JSON.stringify(initialize)}\n`);
        const piping = pipeToTable(input, output, { door: table.door.path, key: table.key, version });
        await vi.waitFor(() => expect(heard.join("")).toContain('"id":1'));
        input.write(`${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n${JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" })}\n`);
        await vi.waitFor(() => expect(heard.join("")).toContain('"id":2'));
        input.end();

        expect(await piping).toBe(0);
        expect(heard.join("").trim().split("\n").map((line) => JSON.parse(line) as unknown)).toEqual([
            { jsonrpc: "2.0", id: 1, result: { method: "initialize" } },
            { jsonrpc: "2.0", id: 2, result: { method: "tools/list" } },
        ]);
    });

    it("answers each request of the host still waiting with an error that says what to do, and exits with 1, when the table ends first", async () => {
        const table = await openDoor({ version, folder: socketFolder(), seated: (_key, socket) => socket.once("data", () => socket.destroy()).resume() });
        doors.push(table);
        const input = new PassThrough();
        const output = new PassThrough();
        const heard = heardOn(output);
        const said: string[] = [];
        const piping = pipeToTable(input, output, { door: table.path, key: table.offer().key, version, log: (line) => said.push(line) });
        input.write(`${JSON.stringify(initialize)}\n`);

        expect(await piping).toBe(1);
        expect(JSON.parse(heard.join("").trim())).toEqual({ jsonrpc: "2.0", id: 1, error: { code: -32603, message: tableEnded } });
        expect(said).toEqual([`chesspal mcp: ${tableEnded}`]);
        expect(tableEnded).toContain("open the chat again from the board page");
    });

    it("never serves the chat itself: where no table listens, it is slow or it refuses, it says why, exits with 1 and leaves the input untouched", async () => {
        const failed = async (door: string, key: string, wait?: number): Promise<{ code: number; said: string[]; untouched: boolean; }> => {
            const input = new PassThrough();
            input.write("waiting\n");
            const said: string[] = [];
            const code = await pipeToTable(input, new PassThrough(), { door, key, version, log: (line) => said.push(line), ...(wait === undefined ? {} : { wait }) });
            return { code, said, untouched: String(input.read()) === "waiting\n" };
        };

        const nobody = await failed(doorPath(randomBytes(8).toString("hex"), process.platform, socketFolder()), "k");
        expect(nobody).toEqual({ code: 1, said: [expect.stringMatching(/^chesspal mcp: Chesspal's table, which opened this chat, is not there any more: open the chat again from the board page\.$/)], untouched: true });

        const { door: opened } = await door();
        const refused = await failed(opened.path, "wrong");
        expect(refused).toEqual({ code: 1, said: ["chesspal mcp: Chesspal's table no longer knows this chat, which it closed: open the chat again from the board page."], untouched: true });

        const older = await openDoor({ version: "0.0.1", folder: socketFolder(), seated: () => undefined });
        doors.push(older);
        expect((await failed(older.path, older.offer().key)).said).toEqual([expect.stringContaining("runs another version than this chat's server")]);

        // What listens and never answers.
        const silent = createServer(() => undefined);
        const silentPath = doorPath(randomBytes(8).toString("hex"), process.platform, socketFolder());
        await new Promise<void>((done) => silent.listen(silentPath, done));

        try {
            const started = Date.now();
            const slow = await failed(silentPath, "k", 200);
            expect(slow).toEqual({ code: 1, said: ["chesspal mcp: Chesspal's table, which opened this chat, did not answer in time: open the chat again from the board page."], untouched: true });
            expect(Date.now() - started).toBeLessThan(2_000);
        } finally {
            silent.close();
        }
    });

    it("waits ten seconds for the table by default, for a slow disk or an antivirus", async () => {
        const silent = createServer(() => undefined);
        const silentPath = doorPath(randomBytes(8).toString("hex"), process.platform, socketFolder());
        await new Promise<void>((done) => silent.listen(silentPath, done));
        const knocks: Socket[] = [];
        silent.on("connection", (socket) => knocks.push(socket));
        let settled = false;
        void pipeToTable(new PassThrough(), new PassThrough(), { door: silentPath, key: "k", version }).then(() => (settled = true));

        try {
            // Past the second the chat once waited, it still waits.
            await new Promise((done) => setTimeout(done, 1_500));
            expect(settled).toBe(false);
        } finally {
            knocks.forEach((socket) => socket.destroy());
            silent.close();
        }
    });

    it("says the table is not there, not that it was slow, when the door closes a knock without a word", async () => {
        // A socket that closes every knock at once, as a door closing may.
        const closing = createServer((socket) => socket.destroy());
        const path = doorPath(randomBytes(8).toString("hex"), process.platform, socketFolder());
        await new Promise<void>((done) => closing.listen(path, done));
        const said: string[] = [];

        try {
            expect(await pipeToTable(new PassThrough(), new PassThrough(), { door: path, key: "k", version, log: (line) => said.push(line) })).toBe(1);
            expect(said).toEqual(["chesspal mcp: Chesspal's table, which opened this chat, is not there any more: open the chat again from the board page."]);
        } finally {
            closing.close();
        }
    });

    it("takes an error of the host's input as the host gone: exit 0, nothing thrown", async () => {
        const table = await echoTable();
        const input = new PassThrough();
        const piping = pipeToTable(input, new PassThrough(), { door: table.door.path, key: table.key, version });
        await vi.waitFor(() => expect(table.sockets).toHaveLength(1));
        input.destroy(new Error("read ECONNRESET"));

        expect(await piping).toBe(0);
    });
});
