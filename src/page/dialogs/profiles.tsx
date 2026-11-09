// The profiles on the page (D-23, D-45): the wizard that completes the first (D-71), the player's picture to change, and the menu that puts another in use or makes one.
import { useEffect, useMemo, useState } from "preact/hooks";
import { DrawnAvatar, PlayerPicture } from "../avatars/avatars.tsx";
import { Torretta } from "../avatars/torretta.tsx";
import {
    type AvatarId,
    avatarIds,
    chooseAvatar,
    imageAddress,
    type Level,
    levels,
    makeProfile,
    nameLimit,
    openDataFolder,
    type ProfileShown,
    ratingLimits,
    type RatingSite,
    ratingSites,
    type Refused,
    saveAccounts,
    sendPhoto,
    useProfile,
} from "../profile/profile.ts";
import type { Text } from "../text.ts";
import { Dialog } from "./dialog.tsx";

/**
 * The page at the first start, while the profile Chesspal made is new: who plays, and the game comes after (D-23, D-71); a game played before stays in it.
 * The system's account is only a suggestion for the name, and the page says where the games go.
 */
export function Wizard({ text, hasGame, account, dataFolder, onMade }: {
    text: Text;
    hasGame: boolean;
    account: string;
    dataFolder: readonly string[];
    onMade: () => void;
})
{
    return (
        <main class="wizard">
            <Torretta size={56} />
            <h1>{text.profile.welcome}</h1>
            <p class="lead">
                {text.profile.lead}
                {hasGame ? <span>{text.profile.gameMoves}</span> : null}
            </p>
            <ProfileForm text={text} submit={text.profile.start} suggestion={account} onMade={onMade} />
            <DataFolder folders={dataFolder} text={text} />
        </main>
    );
}

/** The player's picture on their card: a click opens the change of picture; a mark on it says so where nothing hovers. */
export function PictureButton({ profile, onOpen, text }: { profile: ProfileShown; onOpen: () => void; text: Text; })
{
    return (
        <button class="me" type="button" title={text.profile.changePicture} aria-label={text.profile.yourPicture} aria-haspopup="dialog" onClick={onOpen}>
            <PlayerPicture profile={profile} />
            <span class="me-cover">{cameraIcon}</span>
            <span class="me-badge">{cameraIcon}</span>
        </button>
    );
}

/** The player's name on their card: a click opens the menu of the players. */
export function NameButton({ profile, onOpen, text }: { profile: ProfileShown; onOpen: () => void; text: Text; })
{
    return (
        <button
            class="profile-name"
            type="button"
            title={text.profile.changePlayer}
            aria-label={`${profile.name}: ${text.profile.changePlayer}`}
            aria-haspopup="dialog"
            onClick={onOpen}
        >
            <span>{profile.name}</span>
            <svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M7 10L12 15L17 10" />
            </svg>
        </button>
    );
}

/** The change of picture, open while `open`: one of the drawn avatars, or a photo of the player's, the one they have shown among them. */
export function PictureDialog({ open, profile, onClose, text }: { open: boolean; profile: ProfileShown; onClose: () => void; text: Text; })
{
    const [problem, setProblem] = useState<string | undefined>(undefined);

    const done = (refused: Refused | undefined): void => {
        setProblem(refused === undefined ? undefined : refusalText(refused, text));

        if (refused === undefined) {
            onClose();
        }
    };

    return (
        <Dialog open={open} title={text.profile.changePicture} onClose={onClose} text={text}>
            <div class="avatars">
                {avatarIds.map((id) => (
                    <button
                        key={id}
                        class="avatar-choice"
                        type="button"
                        title={text.profile.avatars[id]}
                        aria-pressed={profile.image === undefined && profile.avatar === id}
                        onClick={() => void chooseAvatar(profile.id, id).then(done)}
                    >
                        <DrawnAvatar id={id} size={52} label={text.profile.avatars[id]} />
                    </button>
                ))}
            </div>
            <PhotoChoice on={profile.image !== undefined} current={imageAddress(profile)} onPhoto={(photo) => void sendPhoto(profile.id, photo).then(done)} text={text} />
            {problem === undefined ? null : <p class="problem" role="alert">{problem}</p>}
        </Dialog>
    );
}

/**
 * The menu of the players, open while `open`: another put in use, never while a game goes on, or a new one made, which waits for it to end; and the names of the one in
 * use on Lichess and chess.com (D-93).
 */
export function ProfilesDialog({ open, profiles, active, locked, dataFolder, onClose, text }: {
    open: boolean;
    profiles: readonly ProfileShown[];
    active: ProfileShown;
    /** Why the profile stays the one in use for now: a game goes on. */
    locked?: string;
    /** Where the profiles are, folder by folder. */
    dataFolder: readonly string[];
    onClose: () => void;
    text: Text;
})
{
    const [making, setMaking] = useState(false);
    const [problem, setProblem] = useState<string | undefined>(undefined);
    useEffect(() => {
        setMaking(false);
        setProblem(undefined);
    }, [open]);

    const use = (id: string): void => {
        if (id === active.id) {
            onClose();
            return;
        }

        void useProfile(id).then((refused) => (refused === undefined ? onClose() : setProblem(refusalText(refused, text))));
    };

    return (
        <Dialog
            open={open}
            title={making ? text.profile.newProfile : text.profile.profiles}
            onBack={making ? () => setMaking(false) : undefined}
            onClose={onClose}
            text={text}
        >
            {making ? <ProfileForm text={text} submit={text.profile.create} use={locked === undefined} onMade={onClose} /> : (
                <>
                    <p class="note">{text.profile.eachOwn}</p>
                    <div class="profile-list" role="radiogroup" aria-label={text.profile.profiles}>
                        {profiles.map((profile) => (
                            <button
                                key={profile.id}
                                class="choice"
                                type="button"
                                role="radio"
                                title={profile.name}
                                aria-checked={profile.id === active.id}
                                disabled={locked !== undefined && profile.id !== active.id}
                                onClick={() => use(profile.id)}
                            >
                                <PlayerPicture profile={profile} size={32} />
                                <span>{profile.name}</span>
                                {profile.id === active.id ? checkIcon : null}
                            </button>
                        ))}
                    </div>
                    <AccountsForm key={`${active.id} ${String(open)}`} profile={active} text={text} />
                    {locked === undefined ? null : <p class="note">{locked}</p>}
                    <button class="command new-profile" type="button" onClick={() => setMaking(true)}>{text.profile.newProfile}</button>
                    {problem === undefined ? null : <p class="problem" role="alert">{problem}</p>}
                    <DataFolder folders={dataFolder} text={text} />
                </>
            )}
        </Dialog>
    );
}

/** The player's names on Lichess and chess.com, each saved once changed, with a tick beside it: a game loaded from there with that name is theirs (D-93). */
function AccountsForm({ profile, text }: { profile: ProfileShown; text: Text; })
{
    const words = text.profile;
    const [names, setNames] = useState({ lichess: profile.accounts?.lichess ?? "", chesscom: profile.accounts?.chesscom ?? "" });
    const [saved, setSaved] = useState<AccountSite | undefined>(undefined);
    const [problem, setProblem] = useState<string | undefined>(undefined);

    const save = (site: AccountSite, field: HTMLInputElement): void => {
        // A name the sites would not give stays in its field, marked, until it reads.
        if (!field.validity.valid) {
            setSaved(undefined);
            return;
        }

        const changed = { ...names, [site]: field.value.trim() };
        setNames(changed);
        setSaved(undefined);
        void saveAccounts(profile.id, changed).then((refused) => {
            setProblem(refused === undefined ? undefined : refusalText(refused, text));
            setSaved(refused === undefined ? site : undefined);
        });
    };

    return (
        <div class="accounts">
            {accountSites.map((site) => (
                <label key={site} title={words.accountTitle}>
                    <span>{siteNames[site]}</span>
                    <input
                        type="text"
                        // Not bound to the names saved: a name the sites would not give stays as typed, marked.
                        defaultValue={names[site]}
                        aria-label={siteNames[site]}
                        placeholder={words.username}
                        maxLength={nameLimit}
                        pattern="\s*[\w\-]*\s*"
                        autocomplete="off"
                        spellcheck={false}
                        onChange={(event) => save(site, event.currentTarget)}
                    />
                    {saved === site ? checkIcon : <span class="tick" />}
                </label>
            ))}
            {problem === undefined ? null : <p class="problem" role="alert">{problem}</p>}
        </div>
    );
}

const accountSites = ["lichess", "chesscom"] as const;
type AccountSite = (typeof accountSites)[number];
const siteNames: Readonly<Record<AccountSite, string>> = { lichess: "Lichess", chesscom: "Chess.com" };

/** Where the games are, as the file manager walks there, and a button that opens it there. */
function DataFolder({ folders, text }: { folders: readonly string[]; text: Text; })
{
    const words = text.profile;
    const [problem, setProblem] = useState<string | undefined>(undefined);
    // Opened a moment ago: Explorer may open behind the browser, and another click would open another window.
    const [opened, setOpened] = useState(false);
    useEffect(() => {
        if (!opened) {
            return undefined;
        }

        const timer = setTimeout(() => setOpened(false), 2000);
        return () => clearTimeout(timer);
    }, [opened]);

    // A folder's name breaks only after its ›, never in its own spaces.
    const shown = folders.map((name) => (name === "Documents" ? words.documents : name).replaceAll(" ", " ")).join(" › ");

    const open = (): void => {
        void openDataFolder().then((refused) => {
            setProblem(refused === undefined ? undefined : words.noFolder);
            setOpened(refused === undefined);
        });
    };

    return (
        <div class="data-folder">
            <p class="note">
                {words.gamesIn} <b>{shown}</b>
            </p>
            <button class="command" type="button" disabled={opened} onClick={open}>{opened ? words.opened : words.openFolder}</button>
            {problem === undefined ? null : <p class="problem" role="alert">{problem}</p>}
        </div>
    );
}

/** The form that makes a profile and puts it in use: the wizard's, with the system's account as a suggestion, and the menu's for another player. */
function ProfileForm({ text, submit, suggestion, use = true, onMade }: { text: Text; submit: string; suggestion?: string; use?: boolean; onMade: () => void; })
{
    const words = text.profile;
    const [name, setName] = useState("");
    const [avatar, setAvatar] = useState<AvatarId | undefined>(avatarIds[0]);
    const [photo, setPhoto] = useState<File | undefined>(undefined);
    const [level, setLevel] = useState<Level>("casual");
    const [rating, setRating] = useState("");
    const [site, setSite] = useState<RatingSite>("lichess");
    const [problem, setProblem] = useState<string | undefined>(undefined);
    const [busy, setBusy] = useState(false);

    const send = (event: Event): void => {
        event.preventDefault();
        setBusy(true);
        const value = rating.trim() === "" ? undefined : Number(rating);
        void makeProfile({ name, level, site, ...(value === undefined ? {} : { rating: value }), ...(photo === undefined ? { avatar } : { photo }), use }).then((refused) => {
            setBusy(false);
            setProblem(refused === undefined ? undefined : refusalText(refused, text));

            if (refused === undefined) {
                onMade();
            }
        });
    };

    return (
        <form class="profile-form" onSubmit={send}>
            <label class="field">
                <span>{words.name}</span>
                <input
                    type="text"
                    required
                    maxLength={nameLimit}
                    placeholder={words.namePlaceholder}
                    autocomplete="given-name"
                    list={suggestion === undefined ? undefined : "name-suggestion"}
                    value={name}
                    onInput={(event) => setName(event.currentTarget.value)}
                />
                {suggestion === undefined ? null : (
                    <datalist id="name-suggestion">
                        <option value={suggestion} />
                    </datalist>
                )}
            </label>
            <fieldset>
                <legend>{words.avatar}</legend>
                <div class="avatars">
                    {avatarIds.map((id) => (
                        <label key={id} class="avatar-choice" title={words.avatars[id]}>
                            <input
                                type="radio"
                                name="avatar"
                                checked={photo === undefined && avatar === id}
                                onChange={() => {
                                    setAvatar(id);
                                    setPhoto(undefined);
                                }}
                            />
                            <span class="visually-hidden">{words.avatars[id]}</span>
                            <DrawnAvatar id={id} size={52} />
                        </label>
                    ))}
                </div>
                <PhotoChoice on={photo !== undefined} photo={photo} onPhoto={setPhoto} text={text} />
            </fieldset>
            <fieldset>
                <legend>{words.level}</legend>
                <div class="levels">
                    {levels.map((id) => (
                        <label key={id} class="level">
                            <input type="radio" name="level" checked={level === id} onChange={() => setLevel(id)} />
                            <span>
                                <b>{words.levels[id][0]}</b>
                                <small>{words.levels[id][1]}</small>
                            </span>
                        </label>
                    ))}
                </div>
            </fieldset>
            <fieldset>
                <legend>
                    {words.rating} <small>{words.optional}</small>
                </legend>
                <div class="rating">
                    <input
                        type="number"
                        inputmode="numeric"
                        min={ratingLimits.lowest}
                        max={ratingLimits.highest}
                        step={1}
                        placeholder={words.ratingPlaceholder}
                        aria-label={words.ratingLabel}
                        value={rating}
                        onInput={(event) => setRating(event.currentTarget.value)}
                    />
                    <select aria-label={words.siteLabel} value={site} onChange={(event) => setSite(event.currentTarget.value as RatingSite)}>
                        {ratingSites.map((id) => <option key={id} value={id}>{words.sites[id]}</option>)}
                    </select>
                </div>
            </fieldset>
            {problem === undefined ? null : <p class="problem" role="alert">{problem}</p>}
            <button class="start" type="submit" disabled={busy}>{submit}</button>
        </form>
    );
}

/** The choice of a photo of the player's, on a line of its own under the drawn avatars: the one chosen, or the one they have, shows in the ring. */
function PhotoChoice({ on, photo, current, onPhoto, text }: { on: boolean; photo?: File | undefined; current?: string | undefined; onPhoto: (photo: File) => void; text: Text; })
{
    const preview = useMemo(() => (photo === undefined ? undefined : URL.createObjectURL(photo)), [photo]);
    useEffect(() => () => preview === undefined ? undefined : URL.revokeObjectURL(preview), [preview]);
    const shown = preview ?? current;

    return (
        <label class={`avatar-choice upload${on ? " on" : ""}`}>
            <input
                type="file"
                accept="image/*"
                onChange={(event) => {
                    const chosen = event.currentTarget.files?.[0];

                    if (chosen !== undefined) {
                        onPhoto(chosen);
                    }
                }}
            />
            {shown === undefined ? <span class="ring">{cameraIcon}</span> : <img class="avatar photo" src={shown} width={36} height={36} alt="" />}
            <span>{text.profile.ownImage}</span>
        </label>
    );
}

function refusalText(refused: Refused, text: Text): string
{
    if (refused.refusal === "profile-game") {
        return text.profile.whilePlaying;
    }

    return refused.refusal === "bad-image" ? text.profile.badImage : refused.error;
}

// Zoe's camera, on the picture to change.
const cameraIcon = (
    <svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 8H7L9 5H15L17 8H20V19H4Z" />
        <circle cx="12" cy="13" r="3.5" />
    </svg>
);

// The profile in use, in the menu.
const checkIcon = (
    <svg class="icon in-use" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5 12.5L10 17.5L19 7.5" />
    </svg>
);
