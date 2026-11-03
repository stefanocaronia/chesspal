// The AI's plan rides in the comment of its move as [%plan …], the form of [%clk], which GUIs do not show (D-29, D-41).
import type { GameRecord } from "../core/index.ts";

/** The comment of the AI's move, when it has one, with its plan. */
export function commentWithPlan(comment: string | undefined, plan: string): string
{
    return comment === undefined ? `[%plan ${plan}]` : `${comment} [%plan ${plan}]`;
}

/** The plan the AI wrote last, if it wrote one. */
export function currentPlan(record: GameRecord): string | undefined
{
    for (let index = record.moves.length - 1; index >= 0; index--) {
        const plan = planPattern.exec(record.moves[index]?.comment ?? "")?.[1];

        if (plan !== undefined) {
            return plan;
        }
    }

    return undefined;
}

/** The record without the AI's plans: what the player may see while the game goes on. */
export function withoutPlans(record: GameRecord): GameRecord
{
    return { ...record, moves: record.moves.map((move) => ({ ...move, comment: move.comment?.replace(planPattern, "") })) };
}

const planPattern = /\s*\[%plan ([^\]]*)\]/;
