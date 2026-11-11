// The profiles on the page (D-23, D-45): the wizard that completes the first (D-71), the profile of the player in use to change, and the menu that puts another in use or makes one.
import type { ComponentChildren } from "preact";
import { useEffect, useMemo, useState } from "preact/hooks";
import { DrawnAvatar, PlayerPicture } from "../avatars/avatars.tsx";
import { Torretta } from "../avatars/torretta.tsx";
import {
    type AvatarId,
    avatarIds,
    chooseAvatar,
    editProfile,
    fideHighest,
    fideLowest,
    imageAddress,
    type Level,
    levels,
    makeProfile,
    nameLimit,
    openDataFolder,
    type ProfileEdit,
    type ProfileShown,
    type Refused,
    sendPhoto,
    type SiteReading,
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

/** The player's picture on their card: a click opens their profile; a mark on it says so where nothing hovers. */
export function PictureButton({ profile, onOpen, text }: { profile: ProfileShown; onOpen: () => void; text: Text; })
{
    return (
        <button class="me" type="button" title={text.profile.editProfile} aria-label={text.profile.yourPicture} aria-haspopup="dialog" onClick={onOpen}>
            <PlayerPicture profile={profile} />
            <span class="me-cover">{pencilIcon}</span>
            <span class="me-badge">{pencilIcon}</span>
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

/**
 * The profile of the player in use, open while `open`: their picture, a drawn avatar or a photo of theirs, their name, how they play and their names on
 * Lichess and chess.com, each saved once changed (D-93, D-106).
 */
export function ProfileDialog({ open, profile, onClose, text }: { open: boolean; profile: ProfileShown; onClose: () => void; text: Text; })
{
    return (
        <Dialog open={open} title={text.profile.yourProfile} onClose={onClose} text={text}>
            <ProfileEdit key={profile.id} profile={profile} text={text} />
        </Dialog>
    );
}

/**
 * The menu of the players, open while `open`: another put in use, never while a game goes on, or a new one made, which waits for it to end; a pencil beside the
 * one in use opens their profile.
 */
export function ProfilesDialog({ open, profiles, active, locked, dataFolder, onEdit, onClose, text }: {
    open: boolean;
    profiles: readonly ProfileShown[];
    active: ProfileShown;
    /** Why the profile stays the one in use for now: a game goes on. */
    locked?: string;
    /** Where the profiles are, folder by folder. */
    dataFolder: readonly string[];
    onEdit: () => void;
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
                            <div key={profile.id} class="profile-row">
                                <button
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
                                {profile.id === active.id
                                    ? (
                                        <button class="icon-button edit-profile" type="button" title={text.profile.editProfile} aria-label={text.profile.editProfile} onClick={onEdit}>
                                            {pencilIcon}
                                        </button>
                                    )
                                    : null}
                            </div>
                        ))}
                    </div>
                    {locked === undefined ? null : <p class="note">{locked}</p>}
                    <button class="command new-profile" type="button" onClick={() => setMaking(true)}>{text.profile.newProfile}</button>
                    {problem === undefined ? null : <p class="problem" role="alert">{problem}</p>}
                    <DataFolder folders={dataFolder} text={text} />
                </>
            )}
        </Dialog>
    );
}

/**
 * What the player changes in their profile, each part saved once changed: the picture, the name, how they play, and their names on Lichess and Chess.com,
 * by which a game loaded from there is theirs (D-93). A field saved gets a tick; one the server would not take stays as typed, marked.
 */
function ProfileEdit({ profile, text }: { profile: ProfileShown; text: Text; })
{
    const words = text.profile;
    const [saved, setSaved] = useState<TypedField | undefined>(undefined);
    const [problem, setProblem] = useState<string | undefined>(undefined);
    const [fideWrong, setFideWrong] = useState(false);

    const report = (refused: Refused | undefined): boolean => {
        setProblem(refused === undefined ? undefined : refusalText(refused, text));
        return refused === undefined;
    };

    const save = (field: TypedField, input: HTMLInputElement): void => {
        setSaved(undefined);

        if (field === "fide") {
            setFideWrong(!input.validity.valid);
        }

        if (input.validity.valid) {
            const value = input.value.trim();
            const change: ProfileEdit = field === "fide" ? { fide: value === "" ? "" : Number(value) } : { [field]: value };
            void editProfile(profile.id, change).then((refused) => setSaved(report(refused) ? field : undefined));
        }
    };

    const tick = (field: TypedField): ComponentChildren => (saved === field ? checkIcon : noTick);

    return (
        <div class="profile-form profile-edit">
            <fieldset>
                <legend>{words.avatar}</legend>
                <div class="avatars">
                    {avatarIds.map((id) => (
                        <button
                            key={id}
                            class="avatar-choice"
                            type="button"
                            title={words.avatars[id]}
                            aria-pressed={profile.image === undefined && profile.avatar === id}
                            onClick={() => void chooseAvatar(profile.id, id).then(report)}
                        >
                            <DrawnAvatar id={id} size={52} label={words.avatars[id]} />
                        </button>
                    ))}
                </div>
                <PhotoChoice on={profile.image !== undefined} current={imageAddress(profile)} onPhoto={(photo) => void sendPhoto(profile.id, photo).then(report)} text={text} />
            </fieldset>
            <label class="field">
                <span>{words.name}</span>
                <input
                    type="text"
                    required
                    maxLength={nameLimit}
                    // Not bound to the profile: a name the server would not take stays as typed, marked.
                    defaultValue={profile.name}
                    autocomplete="given-name"
                    onChange={(event) => save("name", event.currentTarget)}
                />
                {tick("name")}
            </label>
            <fieldset>
                <legend>{words.level}</legend>
                <div class="levels">
                    {levels.map((id) => (
                        <label key={id} class="level">
                            <input type="radio" name="profile-level" checked={profile.level === id} onChange={() => void editProfile(profile.id, { level: id }).then(report)} />
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
                    {words.accounts} <small>{words.optional}</small>
                </legend>
                <div class="accounts read">
                    {accountSites.map((site) => (
                        <label key={site} title={words.accountTitle}>
                            <span>{siteNames[site]}</span>
                            <SiteName initial={profile.accounts?.[site] ?? ""} site={site} onChange={(input) => save(site, input)} text={text} />
                            <SiteMark reading={readingOf(profile, site)} pending={profile.accounts?.[site] !== undefined} text={text} />
                            {tick(site)}
                        </label>
                    ))}
                    <label title={words.fideTitle}>
                        <span>FIDE</span>
                        <FideRating initial={profile.fide} onChange={(input) => save("fide", input)} text={text} />
                        <span class="site-mark" />
                        {tick("fide")}
                    </label>
                </div>
                {accountSites.map((site) => <SiteProblem key={site} reading={readingOf(profile, site)} site={site} text={text} />)}
                {fideWrong ? <p class="site-problem">{words.fideRange(fideLowest, fideHighest)}</p> : null}
                <p class="privacy">{words.privacy}</p>
            </fieldset>
            {problem === undefined ? null : <p class="problem" role="alert">{problem}</p>}
        </div>
    );
}

/**
 * A field of the player's name on Lichess or Chess.com: in the wizard bound to its value, in the profile window not bound, so that a name the sites would
 * not give stays as typed, marked, until it reads.
 */
function SiteName({ value, initial, site, onInput, onChange, text }: {
    value?: string;
    initial?: string;
    site: AccountSite;
    onInput?: (value: string) => void;
    onChange?: (input: HTMLInputElement) => void;
    text: Text;
})
{
    return (
        <input
            type="text"
            {...(value === undefined ? { defaultValue: initial } : { value })}
            aria-label={siteNames[site]}
            placeholder={text.profile.username}
            maxLength={nameLimit}
            pattern="\s*[\w\-]*\s*"
            autocomplete="off"
            spellcheck={false}
            onInput={onInput === undefined ? undefined : (event) => onInput(event.currentTarget.value)}
            onChange={onChange === undefined ? undefined : (event) => onChange(event.currentTarget)}
        />
    );
}

/** The player's FIDE rating, typed: FIDE has no API (D-106). In the wizard bound to its value, in the profile window not bound, as a site's name. */
function FideRating({ value, initial, onInput, onChange, text }: {
    value?: string;
    initial?: number | undefined;
    onInput?: (value: string) => void;
    onChange?: (input: HTMLInputElement) => void;
    text: Text;
})
{
    return (
        <input
            type="number"
            {...(value === undefined ? { defaultValue: initial === undefined ? "" : String(initial) } : { value })}
            aria-label="FIDE"
            placeholder={text.profile.fidePlaceholder}
            min={fideLowest}
            max={fideHighest}
            step={1}
            inputMode="numeric"
            autocomplete="off"
            onInput={onInput === undefined ? undefined : (event) => onInput(event.currentTarget.value)}
            onChange={onChange === undefined ? undefined : (event) => onChange(event.currentTarget)}
        />
    );
}

/**
 * Beside a name on a site, what the site said of it (D-105): the rating that counts, its speed and last game in its title; a cross when the site has no
 * such player; when it did not answer, the rating it gave before, soft, or a dash; dots while a name is being read. The line under the names says the
 * cross and the dash in words.
 */
function SiteMark({ reading, pending, text }: { reading: SiteReading | undefined; pending: boolean; text: Text; })
{
    const words = text.profile;
    const rating = reading?.rating;
    const number = rating === undefined ? null : <RatingNumber value={rating.value} said={words.ratingTitle(words.speeds[rating.speed], rating.played)} />;

    if (reading === undefined) {
        return pending
            ? (
                <span class="site-mark pending" title={words.pending}>
                    <span aria-hidden="true">…</span>
                    <span class="visually-hidden">{words.pending}</span>
                </span>
            )
            : <span class="site-mark" />;
    }

    if (reading.unreached === true) {
        return <span class="site-mark unreached">{number ?? <span aria-hidden="true">–</span>}</span>;
    }

    return reading.found === false ? <span class="site-mark missing" aria-hidden="true">✕</span> : <span class="site-mark">{number}</span>;
}

/** A rating, its speed and last game in its title, and read aloud after it. */
function RatingNumber({ value, said }: { value: number; said: string; })
{
    return (
        <span title={said}>
            {value}
            <span class="visually-hidden">{` ${said}`}</span>
        </span>
    );
}

/** Under the names, in words, a name a site does not know or a site that did not answer: a phone has no title to hover. */
function SiteProblem({ reading, site, text }: { reading: SiteReading | undefined; site: AccountSite; text: Text; })
{
    if (reading?.unreached === true) {
        return <p class="site-problem unreached">{text.profile.unreached(siteNames[site])}</p>;
    }

    return reading?.found === false ? <p class="site-problem">{text.profile.notFound(siteNames[site])}</p> : null;
}

/** What the site said of the name the profile has there now: none for a name changed since it was read. */
function readingOf(profile: ProfileShown, site: AccountSite): SiteReading | undefined
{
    const reading = profile.sites?.[site];
    const account = profile.accounts?.[site];
    return reading !== undefined && account !== undefined && reading.account.toLowerCase() === account.toLowerCase() ? reading : undefined;
}

const accountSites = ["lichess", "chesscom"] as const;
type AccountSite = (typeof accountSites)[number];
const siteNames: Readonly<Record<AccountSite, string>> = { lichess: "Lichess", chesscom: "Chess.com" };

// The fields typed in the profile window, each with its tick once saved.
type TypedField = "name" | AccountSite | "fide";

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
    const [names, setNames] = useState({ lichess: "", chesscom: "" });
    const [fide, setFide] = useState("");
    const [problem, setProblem] = useState<string | undefined>(undefined);
    const [busy, setBusy] = useState(false);

    const send = (event: Event): void => {
        event.preventDefault();
        setBusy(true);
        const rated = fide.trim() === "" ? {} : { fide: Number(fide) };
        void makeProfile({ name, level, ...names, ...rated, ...(photo === undefined ? { avatar } : { photo }), use }).then((refused) => {
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
                    {words.accounts} <small>{words.optional}</small>
                </legend>
                <div class="accounts">
                    {accountSites.map((site) => (
                        <label key={site} title={words.accountTitle}>
                            <span>{siteNames[site]}</span>
                            <SiteName value={names[site]} site={site} onInput={(value) => setNames({ ...names, [site]: value })} text={text} />
                        </label>
                    ))}
                    <label title={words.fideTitle}>
                        <span>FIDE</span>
                        <FideRating value={fide} onInput={setFide} text={text} />
                    </label>
                </div>
                <p class="privacy">{words.privacy}</p>
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

/** The tick on the choice in use: the profile, a name saved, the chat at the table. */
export const checkIcon = (
    <svg class="icon in-use" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5 12.5L10 17.5L19 7.5" />
    </svg>
);

// The room of the tick beside a field not saved yet.
const noTick = <svg class="icon in-use" viewBox="0 0 24 24" aria-hidden="true" />;

// The pencil on the player's picture and beside them in the menu: their profile opens.
const pencilIcon = (
    <svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 20L5 15L15.5 4.5L19.5 8.5L9 19Z" />
        <path d="M13.5 6.5L17.5 10.5" />
    </svg>
);
