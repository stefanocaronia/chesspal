// The icon on macOS: a small application in the user's Applications, which Launchpad and Spotlight list, that runs `chesspal`; on the desktop, a link to it.
import { chmodSync, copyFileSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { IconCommand, IconPlaces } from "./index.ts";

/** Makes Chesspal.app in ~/Applications, or in `places`' menu, with its image, and its link on the desktop: their paths. */
export function macIcons(command: IconCommand, image: string, places: IconPlaces = { desktop: join(homedir(), "Desktop"), menu: join(homedir(), "Applications") }): string[]
{
    const app = join(places.menu, "Chesspal.app");
    const contents = join(app, "Contents");
    const launcher = join(contents, "MacOS", "chesspal");
    mkdirSync(dirname(launcher), { recursive: true });
    mkdirSync(join(contents, "Resources"), { recursive: true });
    copyFileSync(image, join(contents, "Resources", "chesspal.icns"));
    writeFileSync(join(contents, "Info.plist"), infoList);
    writeFileSync(launcher, `#!/bin/sh\ncd ${quoted(command.folder)} && exec ${[command.node, ...command.args].map(quoted).join(" ")}\n`);
    chmodSync(launcher, 0o755);
    const link = join(places.desktop, "Chesspal.app");
    rmSync(link, { force: true });
    symlinkSync(app, link);
    return [link, app];
}

// LSUIElement: the launcher shows no icon in the Dock for the moment it runs.
const infoList = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleName</key><string>Chesspal</string>
    <key>CFBundleIdentifier</key><string>io.github.stefanocaronia.chesspal</string>
    <key>CFBundleExecutable</key><string>chesspal</string>
    <key>CFBundleIconFile</key><string>chesspal</string>
    <key>CFBundlePackageType</key><string>APPL</string>
    <key>LSUIElement</key><true/>
</dict>
</plist>
`;

// An argument for the shell, in single quotes, a quote in it closed and escaped.
function quoted(argument: string): string
{
    return `'${argument.replaceAll("'", "'\\''")}'`;
}
