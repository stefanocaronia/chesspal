// The player's games on disk: the current one in game.json, the finished ones in games/ (D-27, D-41), the games kept to study in study/ (D-68). Below the commands, above the core.
export { aiHostOf, aiModelOf, noteAiHost, noteAiModel } from "./ai-model.ts";
export { type Analysis, endAnalysis, gameInAnalysis, startAnalysis } from "./analysis.ts";
export {
    archiveCoached,
    archivedGame,
    archivedGames,
    archivedName,
    archivedWhen,
    archiveEnded,
    archiveGame,
    archiveName,
    deleteGame,
    gameStemOf,
    isGameName,
    isOverOnTable,
    keepToStudy,
    keptGame,
    keptGames,
    listedName,
    movesPgn,
    playerPgn,
    rewriteGame,
    startOfNewGame,
} from "./archive.ts";
export { type ChatStart, cleanSince, lastChatStart, saveChatStart } from "./chat-start.ts";
export { type CoachHint, type CoachJudgment, type CoachLead, coachShown, coachStarted, coachWaitingSince, type CoachWords, coachWords, forgetCoach, keepHint, keepJudgment, keepLead, startCoach, withCoach } from "./coach.ts";
export { bothSidesMoved, type CurrentGame, drawOfferOf, endOf, type GameEnd, gameStamp, loadGame, removeGame, saveGame, type Speaker, type TalkLine } from "./current-game.ts";
export { makeFolder, renameOver, writeAtomically } from "./files.ts";
export { commentWithPlan, currentPlan, planOf, withoutPlans } from "./plans.ts";
export { endTableTalk, loadTableTalk, saveTableTalk, type TableTalk } from "./table-talk.ts";
export { type Heard, heardLines, type Sayer, type Talk, talkLimits, talkLine, unheardWords, wakesTheChat, type Words, WordsRefused } from "./talk.ts";
export { keepThought, notePondering, ponderingOn, type Thought, thoughtForLastMove, thoughtKey, waitingSince } from "./thoughts.ts";
