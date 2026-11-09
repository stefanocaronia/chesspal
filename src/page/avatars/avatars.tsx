// The player's picture (D-45): their own image when the profile has one, else one of the drawn avatars, else the plain face of a page without profiles.
import { type AvatarId, imageAddress, type ProfileShown } from "../profile/profile.ts";

/** The player's picture, `size` pixels wide: their image, their drawn avatar, or the plain face. */
export function PlayerPicture({ profile, size = 48 }: { profile: ProfileShown | undefined; size?: number; })
{
    const image = profile === undefined ? undefined : imageAddress(profile);

    if (image !== undefined) {
        return <img class="avatar photo" src={image} width={size} height={size} alt="" />;
    }

    return profile?.avatar === undefined ? <PlainFace /> : <DrawnAvatar id={profile.avatar} size={size} />;
}

/** One of the drawn avatars, its colour behind it in the picture (T-102); named for a screen reader when `label` is given. */
export function DrawnAvatar({ id, size, label }: { id: AvatarId; size: number; label?: string; })
{
    return <img class="avatar drawn" src={`/page/avatars/${id}.webp`} width={size} height={size} alt={label ?? ""} decoding="async" />;
}

/** The player's picture on a page without profiles: a simple face, in a circle. */
function PlainFace()
{
    return (
        <svg class="avatar" viewBox="0 0 64 64" width="48" height="48" aria-hidden="true">
            <circle class="back" cx="32" cy="32" r="32" />
            <path class="shirt" d="M10 66C11 52 20 45 32 45C44 45 53 52 54 66Z" />
            <path class="skin" d="M27 37H37V47C37 50 27 50 27 47Z" />
            <circle class="skin" cx="32" cy="28" r="12" />
            <path class="hair" d="M19.5 29C18 18 24 12.5 32.5 12.5C41 12.5 46.5 18 44.5 29C43 23.5 39 20.5 33 21.5C28 22.5 23 24 19.5 29Z" />
            <circle class="eye" cx="27.5" cy="29.5" r="1.7" />
            <circle class="eye" cx="36.5" cy="29.5" r="1.7" />
            <path class="smile" d="M28.5 34.5Q32 37.5 35.5 34.5" />
        </svg>
    );
}
