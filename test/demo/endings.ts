// The ends of a game on the board, to watch their effects: npm run endings. Each button sets a game one move from its end with Chesspal's commands,
// then plays that move or ends the game, so the page shows the end as it happens. The game lives in tmp/endings, its data folder, emptied at each start. The board page,
// which refuses to be framed by another site, comes through this server, as if it were its own.
import { mkdirSync, rmSync } from "node:fs";
import { createServer, request as forward, type Server } from "node:http";
import { fileURLToPath } from "node:url";
import { aiMove } from "../../src/commands/game/ai-move.ts";
import { endGame } from "../../src/commands/game/end.ts";
import { newGame } from "../../src/commands/game/new.ts";
import { playerMove } from "../../src/commands/game/player-move.ts";
import { newProfile } from "../../src/commands/profiles/profiles.ts";
import { defaultContext, withProfile } from "../../src/commands/registry/context.ts";
import { startPage } from "../../src/server/page/page.ts";

/** A game one move from its end, and its end; the player has White. */
interface Scene
{
    readonly label: string;
    readonly before: string;
    readonly end: () => unknown;
}

const folder = fileURLToPath(new URL("../../tmp/endings/", import.meta.url));
rmSync(folder, { recursive: true, force: true });
mkdirSync(folder, { recursive: true });
const context = { ...defaultContext(), folder, home: () => withProfile(folder, "Demo") };
newProfile.run(newProfile.input.parse({ name: "Demo", level: "regular" }), context); // the profile Chesspal made, completed: the page skips its wizard (D-71)
const player = (move: string, offerDraw = false): unknown => playerMove.run(playerMove.input.parse({ move, offer_draw: offerDraw }), context);
const ai = (move: string): unknown => aiMove.run(aiMove.input.parse({ move, plan: "End the game." }), context);
const end = (result: string): unknown => endGame.run(endGame.input.parse({ result }), context);
const italian = "1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5";

const scenes: Readonly<Record<string, Scene>> = {
    check: { label: "Check", before: "1. e4 e5 2. Bc4 Nc6", end: () => player("Bxf7+") },
    won: { label: "Mate, won", before: "1. e4 e5 2. Bc4 Nc6 3. Qh5 Nf6", end: () => player("Qxf7#") },
    lost: { label: "Mate, lost", before: "1. f3 e5 2. g4", end: () => ai("Qh4#") },
    resigned: { label: "You resign", before: italian, end: () => end("player_resigns") },
    aiResigned: { label: "The AI resigns", before: italian, end: () => end("ai_resigns") },
    stalemate: {
        label: "Stalemate",
        before: "1. e3 a5 2. Qh5 Ra6 3. Qxa5 h5 4. h4 Rah6 5. Qxc7 f6 6. Qxd7+ Kf7 7. Qxb7 Qd3 8. Qxb8 Qh7 9. Qxc8 Kg6",
        end: () => player("Qe6"),
    },
    repetition: { label: "Repetition", before: "1. Nf3 Nf6 2. Ng1 Ng8 3. Nf3 Nf6 4. Ng1", end: () => ai("Ng8") },
    agreed: { label: "Draw agreed", before: italian, end: () => agreeDraw() },
};

const page = new URL((await startPage(context)).url);
const control = createServer((request, response) => {
    const path = request.url ?? "/";

    if (path === "/") {
        response.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(controlPage());
        return;
    }

    const scene = request.method === "POST" && path.startsWith("/endings/") ? scenes[path.slice("/endings/".length)] : undefined;

    if (scene !== undefined) {
        play(scene).then(() => response.writeHead(204).end(), (error: unknown) => response.writeHead(500).end(String(error)));
        return;
    }

    // The rest is the board page's, at /board, asked at its own address, which it checks, and its framing allowed to this page alone.
    const headers = { ...request.headers, host: page.host, ...(request.headers.origin === undefined ? {} : { origin: page.origin }) };
    const asked = forward({ host: page.hostname, port: page.port, path: path === "/board" ? "/" : path, method: request.method, headers }, (answer) => {
        const policy = answer.headers["content-security-policy"];
        const answered = policy === undefined ? answer.headers : { ...answer.headers, "content-security-policy": String(policy).replace("frame-ancestors 'none'", "frame-ancestors 'self'") };
        response.writeHead(answer.statusCode ?? 502, answered);
        answer.pipe(response);
    });
    asked.on("error", (error) => response.writeHead(502).end(String(error)));
    request.pipe(asked);
});
console.log(`The ends of a game: ${await listen(control, 5890)}`);

/** Sets the game one move from its end, then, once the page has shown it, ends it. */
async function play(scene: Scene): Promise<void>
{
    newGame.run(newGame.input.parse({ ai_colour: "black", from: scene.before, replace: true }), context);
    await new Promise((done) => setTimeout(done, 1200));
    scene.end();
}

/** The player offers a draw with their move and the AI accepts it, as a draw is agreed since D-65. */
function agreeDraw(): unknown
{
    player("O-O", true);
    return end("draw_agreed");
}

/** The server listening on the port, or on any free one when it is taken; its address. */
async function listen(server: Server, port: number): Promise<string>
{
    const at = await new Promise<number>((done) => {
        server.once("error", () => server.listen(0, "127.0.0.1", () => done(portOf(server))));
        server.listen(port, "127.0.0.1", () => done(portOf(server)));
    });
    return `http://127.0.0.1:${at}/`;
}

function portOf(server: Server): number
{
    const address = server.address();
    return typeof address === "object" && address !== null ? address.port : 0;
}

/** The buttons above the board page, which each play one end. */
function controlPage(): string
{
    const buttons = Object.entries(scenes).map(([name, scene]) => `<button data-scene="${name}">${scene.label}</button>`).join("");
    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Chesspal · the ends of a game</title>
<style>
    body { margin: 0; height: 100vh; display: flex; flex-direction: column; font: 14px system-ui, sans-serif; background: #1d2026; color: #e8e8e8; }
    nav { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 10px 14px; }
    button { padding: 6px 12px; border: 1px solid #4a505a; border-radius: 6px; background: #2b3038; color: inherit; font: inherit; cursor: pointer; }
    button:hover { background: #363c46; }
    button:disabled { opacity: 0.5; cursor: wait; }
    span { margin-left: auto; color: #9aa0a8; }
    iframe { flex: 1; border: 0; border-top: 1px solid #333; }
</style>
</head>
<body>
<nav>${buttons}<span>Each button sets the game one move from its end, then ends it.</span></nav>
<iframe src="/board" title="Chesspal's page"></iframe>
<script>
    for (const button of document.querySelectorAll("button")) {
        button.addEventListener("click", async () => {
            const all = document.querySelectorAll("button");
            all.forEach((each) => each.disabled = true);
            const answer = await fetch("/endings/" + button.dataset.scene, { method: "POST" });
            all.forEach((each) => each.disabled = false);
            if (!answer.ok) alert(await answer.text());
        });
    }
</script>
</body>
</html>`;
}
