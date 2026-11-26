// Where the table's door is: a named pipe on Windows, a socket file elsewhere, with a random name made at each opening; and the knock at it.
import { connect, type Socket } from "node:net";
import { join } from "node:path";

/** The variable of a chat's environment that names the door it knocks at, when the table opened the chat. */
export const doorVariable = "CHESSPAL_TABLE_DOOR";

/** The variable that holds the key the table made for that chat. */
export const keyVariable = "CHESSPAL_TABLE_KEY";

/** The door's socket: a named pipe on Windows, else a socket file in `folder`, by a random name. */
export function doorPath(name: string, platform: string, folder: string): string
{
    return platform === "win32" ? `\\\\.\\pipe\\chesspal-table-${name}` : join(folder, `${name}.sock`);
}

/** Knocks at the door: the connection, "nobody" where nothing listens there, "slow" where it did not answer within `wait` ms. */
export function knock(path: string, wait: number): Promise<Socket | "nobody" | "slow">
{
    return new Promise((done) => {
        const knocked = connect(path);
        const timer = setTimeout(() => {
            knocked.destroy();
            done("slow");
        }, wait);

        knocked.once("connect", () => {
            clearTimeout(timer);
            done(knocked);
        });
        knocked.once("error", () => {
            clearTimeout(timer);
            knocked.destroy();
            done("nobody");
        });
    });
}
