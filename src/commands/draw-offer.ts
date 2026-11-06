// The draw offers of the board page (D-65): the player's, made on their turn as on Lichess, and their answer to the AI's, which ai_move makes with its move.
import { bothSidesMoved, drawOfferOf, saveGame } from "../games/index.ts";
import { gameFolder } from "../profiles/index.ts";
import type { Context } from "./context.ts";
import { endGame } from "./end-game.ts";
import { gameGoingOn } from "./game-summary.ts";

/** A draw offer or answer refused, and why, for the page to say it in the player's language: one stands already, none stands, or no side has moved yet. */
export class DrawRefused extends Error
{
    readonly reason: "offered" | "none" | "early";

    constructor(message: string, reason: DrawRefused["reason"])
    {
        super(message);
        this.reason = reason;
    }
}

/** The player offers a draw on their turn, once each side has moved: it stands until the AI accepts it or moves, and one stands at a time. */
export function offerDraw(context: Context): void
{
    const folder = gameFolder(context.home());
    const current = gameGoingOn(folder, context.now());
    const offer = drawOfferOf(current);

    if (current.game.position.turn === current.ai) {
        throw new Error("Offer a draw on your turn: wait for the AI's move. Nothing changed.");
    }

    if (!bothSidesMoved(current.game)) {
        throw new DrawRefused("A draw can be offered once each side has made a move. Nothing changed.", "early");
    }

    if (offer !== undefined) {
        throw new DrawRefused(offer === "player" ? "You have offered a draw already: it stands until the AI's move. Nothing changed." : "The AI offers a draw: accept it or decline it. Nothing changed.", "offered");
    }

    saveGame(folder, { ...current, drawOffer: "player" });
}

/** The player's answer to the AI's draw offer: accepted, the game ends drawn by agreement; declined, it goes on. */
export function answerDraw(context: Context, accept: boolean): void
{
    const folder = gameFolder(context.home());
    const current = gameGoingOn(folder, context.now());

    if (drawOfferOf(current) !== "ai") {
        throw new DrawRefused("The AI offers no draw to answer. Nothing changed.", "none");
    }

    if (accept) {
        endGame.run({ result: "draw_agreed" }, context);
    } else {
        saveGame(folder, { ...current, drawOffer: undefined });
    }
}
