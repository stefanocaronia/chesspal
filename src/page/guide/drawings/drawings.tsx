// The guide's drawings (Zoe): sketches of the page without words, flat and in the theme's colours, the part a page speaks of in the accent
import type { JSX } from "preact";
import { Analysis } from "./analysis.tsx";
import { Game } from "./game.tsx";
import { Helps } from "./helps.tsx";
import { HowItWorks } from "./how-it-works.tsx";
import { Players } from "./players.tsx";
import { Talk } from "./talk.tsx";

/** The guide's drawings, by the name its markdown gives them: ![what it shows](name). */
export const drawings: Readonly<Record<string, () => JSX.Element>> = {
    "how-it-works": HowItWorks,
    game: Game,
    talk: Talk,
    helps: Helps,
    analysis: Analysis,
    players: Players,
};
