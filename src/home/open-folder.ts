// The data folder shown to the player in the system's own file manager (T-119): Explorer, Finder, or the Linux desktop's.
import { spawn } from "node:child_process";

/** Opens a folder in the system's file manager, without waiting for it to close: whether the manager started, for the page to say so when it did not. */
export function openFolder(folder: string, platform: string): Promise<boolean>
{
    const manager = platform === "win32" ? "explorer.exe" : platform === "darwin" ? "open" : "xdg-open";
    return new Promise((done) => {
        const opened = spawn(manager, [folder], { detached: true, stdio: "ignore" });
        opened.once("spawn", () => {
            opened.unref();
            done(true);
        });
        opened.once("error", () => done(false));
    });
}
