// The icon on Linux: a desktop entry in the user's applications, which every desktop's menu lists, and a copy on the desktop, marked as trusted where GNOME
// asks for it.
import { spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { IconCommand, IconPlaces } from "./index.ts";

/** Makes chesspal.desktop in the user's applications and on the desktop, when there is one, or in `places`: their paths. */
export function linuxIcons(command: IconCommand, image: string, places: IconPlaces = systemPlaces()): string[]
{
    mkdirSync(places.menu, { recursive: true });
    const entry = join(places.menu, "chesspal.desktop");
    writeFileSync(entry, desktopEntry(command, image));
    chmodSync(entry, 0o755);

    if (!existsSync(places.desktop)) {
        return [entry];
    }

    const onDesktop = join(places.desktop, "chesspal.desktop");
    copyFileSync(entry, onDesktop);
    chmodSync(onDesktop, 0o755);
    // GNOME launches a desktop file on the desktop only once it is trusted; elsewhere gio may be missing, and nothing is lost.
    spawnSync("gio", ["set", onDesktop, "metadata::trusted", "true"], { stdio: "ignore" });
    return [onDesktop, entry];
}

/** The desktop entry: Chesspal's name and icon, and the command it runs with no terminal. */
export function desktopEntry(command: IconCommand, image: string): string
{
    return `[Desktop Entry]
Type=Application
Name=Chesspal
Comment=Play chess against an AI, and learn with one
Exec=${[command.node, ...command.args].map(quoted).join(" ")}
Path=${command.folder}
Icon=${image}
Terminal=false
Categories=Game;BoardGame;
`;
}

// The desktop as the user's dirs name it, and the applications of XDG_DATA_HOME.
function systemPlaces(): IconPlaces
{
    const named = spawnSync("xdg-user-dir", ["DESKTOP"], { encoding: "utf8" });
    const desktop = named.status === 0 && named.stdout.trim() !== "" ? named.stdout.trim() : join(homedir(), "Desktop");
    const data = process.env.XDG_DATA_HOME?.trim() || join(homedir(), ".local", "share");
    return { desktop, menu: join(data, "applications") };
}

// An argument of Exec, in double quotes, with the characters the desktop entry spec escapes there, and % doubled, which Exec reads as a field code; then
// every backslash doubled, as the spec reads a value's escapes before its quotes (Federico).
function quoted(argument: string): string
{
    return `"${argument.replace(/(["`$\\])/g, "\\$1").replaceAll("%", "%%")}"`.replaceAll("\\", "\\\\");
}
