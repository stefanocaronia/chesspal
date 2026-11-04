// The player's picture (D-45): their own image when the profile has one, else one of Zoe's eight drawn avatars, else the plain face of a page without profiles.
import type { ComponentChildren } from "preact";
import { Avatar } from "./player-card.tsx";
import { type AvatarId, imageAddress, type Profile } from "./profile.ts";

/** The player's picture, `size` pixels wide: their image, their drawn avatar, or the plain face. */
export function PlayerPicture({ profile, size = 48 }: { profile: Profile | undefined; size?: number; })
{
    const image = profile === undefined ? undefined : imageAddress(profile);

    if (image !== undefined) {
        return <img class="avatar photo" src={image} width={size} height={size} alt="" />;
    }

    return profile?.avatar === undefined ? <Avatar /> : <DrawnAvatar id={profile.avatar} size={size} />;
}

/** One of Zoe's avatars, in its circle of colour; named for a screen reader when `label` is given. */
export function DrawnAvatar({ id, size, label }: { id: AvatarId; size: number; label?: string; })
{
    const { back, art } = drawn[id];
    return (
        <svg class="avatar drawn" viewBox="0 0 64 64" width={size} height={size} {...(label === undefined ? { "aria-hidden": "true" } : { role: "img", "aria-label": label })}>
            <circle cx="32" cy="32" r="32" fill={back} />
            {art}
        </svg>
    );
}

const ink = "#2a2522";

/** A face of skin, two eyes and a smile, which the avatars with a face share. */
function Face({ skin, smile = true, eyes = ink }: { skin: string; smile?: boolean; eyes?: string; })
{
    return (
        <>
            <circle cx="32" cy="35" r="15" fill={skin} />
            <circle cx="26.5" cy="35" r="1.9" fill={eyes} />
            <circle cx="37.5" cy="35" r="1.9" fill={eyes} />
            {smile ? <path d="M27.5 41Q32 44.5 36.5 41" fill="none" stroke={eyes} stroke-width="1.8" stroke-linecap="round" /> : null}
        </>
    );
}

// Zoe's drafts (project/design/pagina), a colour behind each.
const drawn: Readonly<Record<AvatarId, { back: string; art: ComponentChildren; }>> = {
    "short-hair": {
        back: "#f2c14e",
        art: (
            <>
                <Face skin="#f0c9a4" />
                <path d="M17 33C16 20 25 16 33 16C43 16 49 23 47 32C41 25 29 23 17 33Z" fill="#4a2f22" />
            </>
        ),
    },
    bun: {
        back: "#9fc5b8",
        art: (
            <>
                <Face skin="#e2b08c" />
                <circle cx="32" cy="15" r="6.5" fill="#2f2420" />
                <path d="M17 35C15 22 24 18 32 18C40 18 49 22 47 35C44 26 38 23 32 23C26 23 20 26 17 35Z" fill="#2f2420" />
            </>
        ),
    },
    glasses: {
        back: "#a9b9ea",
        art: (
            <>
                <Face skin="#f3d2b3" />
                <path d="M17 31C17 20 25 17 32 17C41 17 48 21 47 31C40 26 28 25 17 31Z" fill="#8a5a3c" />
                <g fill="none" stroke={ink} stroke-width="1.6">
                    <circle cx="26.5" cy="35" r="4.4" />
                    <circle cx="37.5" cy="35" r="4.4" />
                    <path d="M30.9 35H33.1" />
                </g>
            </>
        ),
    },
    beanie: {
        back: "#e98a6b",
        art: (
            <>
                <Face skin="#c98e68" />
                <path d="M16 32C16 17 48 17 48 32Z" fill="#2f4858" />
                <rect x="15" y="28" width="34" height="6" rx="3" fill="#24394a" />
                <circle cx="32" cy="15" r="3.5" fill="#24394a" />
            </>
        ),
    },
    beard: {
        back: "#c7b8e0",
        art: (
            <>
                <Face skin="#eebf98" smile={false} />
                <path d="M18 31C18 20 26 17 32 17C40 17 47 21 46 31C40 27 26 26 18 31Z" fill="#6b4a33" />
                <path d="M17 36C18 49 26 52 32 52C38 52 46 49 47 36C44 43 38 45 32 45C26 45 20 43 17 36Z" fill="#6b4a33" />
                <path d="M28.5 41.5H35.5" stroke={ink} stroke-width="1.8" stroke-linecap="round" />
            </>
        ),
    },
    curls: {
        back: "#f4a6b8",
        art: (
            <>
                <Face skin="#8d5b3e" eyes="#1b1512" />
                <g fill="#1b1512">
                    <circle cx="20" cy="27" r="6" />
                    <circle cx="26" cy="20" r="6.5" />
                    <circle cx="34" cy="18" r="6.5" />
                    <circle cx="42" cy="21" r="6" />
                    <circle cx="46" cy="28" r="5" />
                </g>
            </>
        ),
    },
    cat: {
        back: "#8fc1e3",
        art: (
            <>
                <path d="M18 26L20 12L29 21ZM46 26L44 12L35 21Z" fill="#e58a3a" />
                <circle cx="32" cy="34" r="16" fill="#e58a3a" />
                <circle cx="26" cy="32" r="2" fill={ink} />
                <circle cx="38" cy="32" r="2" fill={ink} />
                <path d="M30.5 37H33.5L32 39Z" fill={ink} />
                <path d="M14 37L23 38M14 42L23 40M50 37L41 38M50 42L41 40" stroke={ink} stroke-width="1.3" stroke-linecap="round" />
            </>
        ),
    },
    owl: {
        back: "#b7d38a",
        art: (
            <>
                <path d="M18 22L22 12L28 19ZM46 22L42 12L36 19Z" fill="#7a5a3f" />
                <ellipse cx="32" cy="36" rx="16" ry="17" fill="#7a5a3f" />
                <circle cx="25.5" cy="31" r="6" fill="#fbf3e4" />
                <circle cx="38.5" cy="31" r="6" fill="#fbf3e4" />
                <circle cx="25.5" cy="31" r="2.6" fill={ink} />
                <circle cx="38.5" cy="31" r="2.6" fill={ink} />
                <path d="M29.5 37H34.5L32 41Z" fill="#e8a93b" />
            </>
        ),
    },
};
