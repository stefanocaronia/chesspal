// The icon on Windows: a shortcut on the desktop and in the Start menu, made by PowerShell, the only tool every Windows has for it. It runs Node through
// `conhost --headless`, the one way found that opens no console window.
import { execFile } from "node:child_process";
import { win32 } from "node:path";
import type { IconCommand, IconPlaces } from "./index.ts";

/** Makes the shortcuts, on the desktop and in the Start menu as Windows names them for this user, or in `places`: their paths. */
export function windowsIcons(command: IconCommand, image: string, places?: IconPlaces): Promise<string[]>
{
    const env = {
        ...process.env,
        CHESSPAL_ICON_FOLDERS: places === undefined ? "" : `${places.desktop};${places.menu}`,
        CHESSPAL_ICON_TARGET: win32.join(process.env.SystemRoot ?? "C:\\Windows", "System32", "conhost.exe"),
        CHESSPAL_ICON_ARGUMENTS: ["--headless", command.node, ...command.args].map(quoted).join(" "),
        CHESSPAL_ICON_FOLDER: command.folder,
        CHESSPAL_ICON_IMAGE: image,
    };

    return new Promise((done, failed) => {
        execFile("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", shortcuts], { env, windowsHide: true }, (error, stdout, stderr) => {
            if (error === null) {
                done(stdout.split(/\r?\n/).filter((line) => line.trim() !== ""));
            } else {
                failed(new Error(`Windows did not make Chesspal's shortcuts: ${stderr.trim() || error.message}`));
            }
        });
    });
}

// The values come in the environment, never in the script: a path may hold any character PowerShell reads. Its output in UTF-8, and an error as its
// message alone, not in the system's language and code page around it.
const shortcuts = `
[Console]::OutputEncoding = [Text.Encoding]::UTF8
trap { [Console]::Error.WriteLine($_.Exception.Message); exit 1 }
$ErrorActionPreference = 'Stop'
$shell = New-Object -ComObject WScript.Shell
$folders = if ($env:CHESSPAL_ICON_FOLDERS) { $env:CHESSPAL_ICON_FOLDERS -split ';' } else { [Environment]::GetFolderPath('Desktop'), [Environment]::GetFolderPath('Programs') }
foreach ($folder in $folders) {
    $link = $shell.CreateShortcut((Join-Path $folder 'Chesspal.lnk'))
    $link.TargetPath = $env:CHESSPAL_ICON_TARGET
    $link.Arguments = $env:CHESSPAL_ICON_ARGUMENTS
    $link.WorkingDirectory = $env:CHESSPAL_ICON_FOLDER
    $link.IconLocation = $env:CHESSPAL_ICON_IMAGE
    $link.Description = 'Chesspal'
    $link.Save()
    $link.FullName
}
`;

// An argument as Windows reads it from a command line: in quotes when it has a space; a Windows path never holds a quote.
function quoted(argument: string): string
{
    return /\s/.test(argument) ? `"${argument}"` : argument;
}
