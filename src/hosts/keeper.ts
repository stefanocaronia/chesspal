// The models each host offers, kept for a while: asked of the host in the background the first time it is shown, and again once they are old, or once the
// host's account changed.
import type { HostModel } from "./chat.ts";
import type { HostId } from "./names.ts";

/** The models known of each host. */
export interface ModelKeeper
{
    /** The models known of a host, asking it in the background when none were asked yet or they are old. */
    models(host: HostId): HostModel[];
    /** The models known of a host, asking nothing. */
    known(host: HostId): HostModel[];
    /** The host's account changed, as the player signed in or installed it: the next `models` asks it again, the list known kept meanwhile; tells nothing. */
    forget(host: HostId): void;
}

export interface KeeperOptions
{
    /** Asks a host its models. */
    ask(host: HostId): Promise<HostModel[]>;
    /** A host's list arrived or changed: the page reads again. */
    changed(): void;
    now?: () => number;
}

// How long a host's list is kept before it is asked again; and how long an answer that failed or listed nothing waits, as a host whose player was not
// signed in yet.
const keepFor = 10 * 60_000;
const failedFor = 60_000;

/** A keeper that asks each host at most once at a time; an answer that fails or lists nothing keeps the last list known, and is asked again sooner. */
export function modelKeeper(options: KeeperOptions): ModelKeeper
{
    const now = options.now ?? Date.now;
    const kept = new Map<HostId, Kept>();

    const entry = (host: HostId): Kept => {
        const found = kept.get(host) ?? { models: [], asking: false };
        kept.set(host, found);
        return found;
    };

    const ask = (host: HostId): void => {
        const one = entry(host);

        if (one.asking || (one.until !== undefined && now() < one.until)) {
            return;
        }

        one.asking = true;

        const heard = (models: HostModel[]): void => {
            one.asking = false;
            // Forgotten while it was asked: the answer may be from before the change, and the next look asks again.
            one.until = one.forgotten === true ? undefined : now() + (models.length > 0 ? keepFor : failedFor);
            delete one.forgotten;

            if (models.length > 0 && JSON.stringify(models) !== JSON.stringify(one.models)) {
                one.models = models;
                options.changed();
            }
        };

        // An ask that throws at once fails as one that rejects.
        new Promise<HostModel[]>((resolve) => resolve(options.ask(host))).then(heard, () => heard([]));
    };

    return {
        models: (host) => {
            ask(host);
            return entry(host).models;
        },
        known: (host) => kept.get(host)?.models ?? [],
        forget: (host) => {
            const one = entry(host);
            delete one.until;

            if (one.asking) {
                one.forgotten = true;
            }
        },
    };
}

/** What the keeper holds of a host: its list, until when it stands, whether it is being asked, and whether it was forgotten meanwhile. */
interface Kept
{
    models: HostModel[];
    until?: number;
    asking: boolean;
    forgotten?: true;
}
