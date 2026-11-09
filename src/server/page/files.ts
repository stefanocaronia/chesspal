// The page's files: its HTML with the import map, its scripts, styles, pictures and sounds, the chess core and the packages they import, each only from its
// folder and of the types the page uses.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import type { ServerResponse } from "node:http";
import { createRequire } from "node:module";
import { extname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { send } from "./http.ts";

/** The page's HTML, which runs only its own files and its import map. */
export function sendHtml(response: ServerResponse): void
{
    send(response, 200, "text/html; charset=utf-8", html, { "Content-Security-Policy": policy });
}

/** A script, style, picture or sound of the page, a module of the core, or a package's module: only from their folders, and only of the types the page uses. */
export function sendFile(response: ServerResponse, path: string): void
{
    const file = path.startsWith("/vendor/") ? vendorModule(path.slice("/vendor/".length)) : builtFile(path);
    const type = file === undefined ? undefined : types[extname(file)];
    let bytes: Buffer | undefined;

    try {
        bytes = file === undefined || type === undefined ? undefined : readFileSync(file);
    } catch {
        bytes = undefined;
    }

    if (bytes === undefined || type === undefined) {
        send(response, 404, "text/plain; charset=utf-8", `Nothing at ${path}.`);
        return;
    }

    // A pieces' set loaded again for each piece that moves blanks the pieces drawn from it, at times until the next move (T-88): the browser keeps it an hour,
    // and the drawn avatars too, all at once in the profile's dialog.
    const kept = type === types[".svg"] || type === types[".webp"];
    send(response, 200, type, bytes, kept ? { "Cache-Control": "max-age=3600" } : {});
}

// The built page and core: dist/, from src/server/page and from dist/server/page alike.
const built = fileURLToPath(new URL("../../../dist/", import.meta.url));

// The modules the page imports from packages, by the names the import map gives them: a package, and its file.
const vendorModules: Readonly<Record<string, readonly [string, string]>> = {
    "preact.js": ["preact", "dist/preact.module.js"],
    "hooks.js": ["preact", "hooks/dist/hooks.module.js"],
    "jsx-runtime.js": ["preact", "jsx-runtime/dist/jsxRuntime.module.js"],
    "chess.js": ["chess.js", "dist/esm/chess.js"],
};

const importMap = JSON.stringify({
    imports: { "preact": "/vendor/preact.js", "preact/hooks": "/vendor/hooks.js", "preact/jsx-runtime": "/vendor/jsx-runtime.js", "chess.js": "/vendor/chess.js" },
});

// The page runs only its own files and the import map written in it, known by its hash.
const policy = `default-src 'self'; script-src 'self' 'sha256-${createHash("sha256").update(importMap).digest("base64")}'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; `
    + "base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

const html = [
    "<!doctype html>",
    '<html lang="en">',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<meta name="color-scheme" content="light dark">',
    "<title>Chesspal</title>",
    '<link rel="stylesheet" href="/page/style.css">',
    `<script type="importmap">${importMap}</script>`,
    '<script type="module" src="/page/main.js"></script>',
    '<div id="app"></div>',
    "",
].join("\n");

const types: Readonly<Record<string, string>> = { ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".webp": "image/webp", ".json": "application/json; charset=utf-8", ".ogg": "audio/ogg" };

function builtFile(path: string): string | undefined
{
    const area = /^\/(page|core)\//.exec(path)?.[1];

    if (area === undefined) {
        return undefined;
    }

    try {
        const root = join(built, area);
        const file = resolve(built, `.${decodeURIComponent(path)}`);
        const inside = relative(root, file);
        return inside === "" || inside.startsWith("..") || isAbsolute(inside) ? undefined : file;
    } catch {
        // An address that does not decode.
        return undefined;
    }
}

function vendorModule(name: string): string | undefined
{
    const module = vendorModules[name];

    if (module === undefined) {
        return undefined;
    }

    try {
        // The package's folder, from where its main file is: node_modules/<package>.
        const main = createRequire(import.meta.url).resolve(module[0]);
        const marker = join("node_modules", module[0]);
        return join(main.slice(0, main.lastIndexOf(marker) + marker.length), module[1]);
    } catch {
        return undefined;
    }
}
