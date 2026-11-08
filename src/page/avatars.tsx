// The player's picture (D-45): their own image when the profile has one, else one of the drawn avatars, else the plain face of a page without profiles.
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

/** One of the drawn avatars, its colour behind it in the picture (T-102); named for a screen reader when `label` is given. */
export function DrawnAvatar({ id, size, label }: { id: AvatarId; size: number; label?: string; })
{
    return <img class="avatar drawn" src={`/page/avatars/${id}.webp`} width={size} height={size} alt={label ?? ""} decoding="async" />;
}
