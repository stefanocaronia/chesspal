// The players: the player's face in the header, ringed, and under it the window of the players, the one in use ticked, with the pencil to their profile
import { Bar, Card, Face, Torretta } from "./parts.tsx";

/** The players in the window, from the top: the player's own is the second. */
const players = [{ tone: "tone-2", name: 58 }, { tone: "tone-player", name: 46 }, { tone: "tone-6", name: 66 }];
const own = 1;
const row = { x: 136, y: 102, width: 298, height: 28, step: 34 };

/** A strip of the header with the player's face at its end, and the window «Chi gioca?» it opens. */
export function Players()
{
    return (
        <svg class="guide-art" viewBox="0 0 480 220" aria-hidden="true">
            <Card x={16} y={10} width={448} height={36} />
            <Torretta x={22} y={11} size={34} />
            <rect class="quote" x="64" y="19" width="60" height="18" rx="9" />
            {[350, 376, 402].map((x) => <rect key={x} class="field" x={x} y="18" width="20" height="20" rx="5" />)}
            <Face x={442} y={28} r={11} tone="tone-player" ring />

            <rect class="lift-shadow" x="121" y="63" width="330" height="150" rx="6" />
            <Card x={120} y={60} width={330} height={150} />
            <Bar x={136} y={73} width={62} strong />
            <path class="soft-line" d="M426 70L434 78M434 70L426 78" />
            <Bar x={136} y={88} width={120} />
            {players.map((player, index) => <PlayerRow key={player.tone} index={index} tone={player.tone} name={player.name} />)}
        </svg>
    );
}

/** A line of the window: a face and a name; the player's own is ticked and has the pencil beside it. */
function PlayerRow({ index, tone, name }: { index: number; tone: string; name: number; })
{
    const y = row.y + index * row.step;
    const middle = y + row.height / 2;
    const mine = index === own;
    const width = mine ? row.width - row.height - 6 : row.width;

    return (
        <g>
            <Card x={row.x} y={y} width={width} height={row.height} />
            <Face x={row.x + 16} y={middle} r={9} tone={tone} />
            <Bar x={row.x + 32} y={middle - 2.5} width={name} strong />
            {mine && (
                <>
                    <path class="tick" d={`M${row.x + width - 26} ${middle}l4 4l7 -8`} />
                    <Card x={row.x + row.width - row.height} y={y} width={row.height} height={row.height} />
                    <g class="pencil" transform={`translate(${row.x + row.width - row.height + 6} ${y + 6}) scale(0.667)`}>
                        <path d="M4 20L5 15L15.5 4.5L19.5 8.5L9 19Z" />
                        <path d="M13.5 6.5L17.5 10.5" />
                    </g>
                </>
            )}
        </g>
    );
}
