// The player's profiles (D-23): who plays, their games, their picture and their page settings, each in profiles/<id>/. Below the commands, beside the games.
export { type ImageType, imageTypeOf, imageTypes, ownImage, ownImageStamp, removeOwnImage, saveOwnImage, sentImageLimit } from "./avatar.ts";
export {
    activateProfile,
    activeProfile,
    createProfile,
    type DrawnAvatar,
    drawnAvatars,
    gameFolder,
    gameFolders,
    type Level,
    levels,
    listProfiles,
    nameLimit,
    type PlayerProfile,
    type ProfileFields,
    profileFolder,
    type Rating,
    ratingLimits,
    type RatingSite,
    ratingSites,
    updateProfile,
} from "./profiles.ts";
export { type PageSettings, profileSettings, saveProfileSettings, settingsOf } from "./settings.ts";
