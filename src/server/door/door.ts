// The table's door, where the `chesspal mcp` of each chat the table opened knocks: it sits with the key the table made for it, or is told why not.
import { randomBytes } from "node:crypto";
import { createServer, type Socket } from "node:net";
import { tmpdir } from "node:os";
import { answerLine, firstLine, type Hello, mostHello, readHello, type Refusal } from "./hello.ts";
import { doorPath, doorVariable, keyVariable, removeSocketFile } from "./socket.ts";

export interface DoorOptions
{
    /** The table's version: a chat of another is refused. */
    version: string;
    /** Called for each chat that sits, with its socket, paused, and the bytes after its hello, which start its MCP conversation. */
    seated: (key: string, socket: Socket, rest: Buffer) => void;
    /** The operating system, as process.platform names it: a named pipe on Windows, a socket file elsewhere. */
    platform?: string;
    /** The folder of the socket file, off Windows: the system's temporary folder unless given. */
    folder?: string;
    /** Random bytes, for the keys and the door's name. */
    bytes?: (size: number) => Buffer;
    /** How long a knock may take to say hello, in ms. */
    helloWait?: number;
}

/** The door open, listening at `path`. */
export interface Door
{
    readonly path: string;
    /** A new key, for one chat, with the two variables of that chat's server, which tell it to knock here with it. */
    offer(): { key: string; environment: Record<string, string>; };
    /** Forgets a key: the chat sitting with it is sent away, and it sits no more. */
    withdraw(key: string): void;
    /** Refuses every knock from now on, sends away who sits or knocks, and takes the socket file away. */
    close(): Promise<void>;
}

/** Opens a door on a fresh socket: settled once it listens, so that a chat started after it finds it. */
export async function openDoor(options: DoorOptions): Promise<Door>
{
    const platform = options.platform ?? process.platform;
    const bytes = options.bytes ?? randomBytes;
    const path = doorPath(bytes(8).toString("hex"), platform, options.folder ?? tmpdir());
    const keys = new Set<string>();
    const sitting = new Map<string, Socket>();
    const knocking = new Set<Socket>();
    let ending = false;

    const refusal = (hello: Hello): Refusal | undefined => {
        if (ending) {
            return "ending";
        }

        if (!keys.has(hello.key)) {
            return "key";
        }

        if (hello.version !== options.version) {
            return "version";
        }

        return sitting.has(hello.key) ? "busy" : undefined;
    };

    const welcome = async (socket: Socket): Promise<void> => {
        socket.on("error", () => undefined);

        if (ending) {
            refuse(socket, "ending");
            return;
        }

        knocking.add(socket);
        const first = await firstLine(socket, options.helloWait ?? 5_000, mostHello);

        // Refused by the door's closing while it said nothing yet.
        if (!knocking.delete(socket)) {
            return;
        }

        const hello = first === undefined ? undefined : readHello(first.line);

        if (first === undefined || hello === undefined) {
            socket.destroy();
            return;
        }

        const refused = refusal(hello);

        if (refused !== undefined) {
            refuse(socket, refused);
            return;
        }

        sitting.set(hello.key, socket);
        socket.once("close", () => {
            if (sitting.get(hello.key) === socket) {
                sitting.delete(hello.key);
            }
        });
        socket.write(answerLine({ ok: true }));
        options.seated(hello.key, socket, first.rest);
    };

    const server = createServer((socket) => void welcome(socket));
    await listen(server, path);

    return {
        path,
        offer: () => {
            const key = bytes(32).toString("hex");
            keys.add(key);
            return { key, environment: { [doorVariable]: path, [keyVariable]: key } };
        },
        withdraw: (key) => {
            keys.delete(key);
            sitting.get(key)?.destroy();
        },
        close: async () => {
            ending = true;
            const closed = new Promise<void>((done) => server.close(() => done()));
            knocking.forEach((socket) => refuse(socket, "ending"));
            knocking.clear();
            sitting.forEach((socket) => socket.destroy());
            await closed;
            removeSocketFile(path, platform);
        },
    };
}

/** Tells a knock why it may not sit, then closes it. */
function refuse(socket: Socket, refused: Refusal): void
{
    socket.end(answerLine({ refused }), () => socket.destroy());
}

function listen(server: ReturnType<typeof createServer>, path: string): Promise<void>
{
    return new Promise((done, failed) => {
        server.once("error", failed);
        server.listen(path, () => {
            server.off("error", failed);
            done();
        });
    });
}
