// The models each host offers, kept for a while: asked of the host in the background the first time it is shown, and again once they are old.
import type { HostModel } from "./chat.ts";
import type { HostId } from "./names.ts";

/** The models known of each host. */
export interface ModelKeeper
{
    /** The models known of a host, asking it in the background when none were asked yet or they are old. */
    models(host: HostId): HostModel[];
    /** The models known of a host, asking nothing. */
    known(host: HostId): HostModel[];
}

export interface KeeperOptions
{
    /** Asks a host its models. */
    ask(host: HostId): Promise<HostModel[]>;
    /** A host's list arrived or changed: the page reads again. */
    changed(): void;
    now?: () => number;
}

// How long a host's answer is kept before it is asked again.
const keepFor = 10 * 60_000;

/** A keeper that asks each host at most once at a time; an answer that fails or lists nothing keeps the last list known. */
export function modelKeeper(options: KeeperOptions): ModelKeeper
{
    const now = options.now ?? Date.now;
    const kept = new Map<HostId, { models: HostModel[]; at?: number; asking: boolean; }>();

    const ask = (host: HostId): void => {
        const entry = kept.get(host) ?? { models: [], asking: false };
        kept.set(host, entry);

        if (entry.asking || (entry.at !== undefined && now() - entry.at < keepFor)) {
            return;
        }

        entry.asking = true;

        const heard = (models: HostModel[]): void => {
            entry.asking = false;
            entry.at = now();

            if (models.length > 0 && JSON.stringify(models) !== JSON.stringify(entry.models)) {
                entry.models = models;
                options.changed();
            }
        };

        // An ask that throws at once fails as one that rejects.
        new Promise<HostModel[]>((resolve) => resolve(options.ask(host))).then(heard, () => heard([]));
    };

    return {
        models: (host) => {
            ask(host);
            return kept.get(host)?.models ?? [];
        },
        known: (host) => kept.get(host)?.models ?? [],
    };
}
