// The files through which an AI host finds Chesspal in the player's folder: the server, the opponent's instructions, the hosts' settings.
export {
    agentHosts,
    agentTools,
    analystAgent,
    atTableInstructions,
    coachAgent,
    hasAgent,
    instructionsFile,
    isCodex,
    onQuickModel,
    ownModelPonderAgent,
    ponderAgentFor,
    ponderAgents,
    ponderHosts,
    quickModels,
    tableHelperInstructions,
} from "./agents.ts";
export { codexHooksPath, drivenStartInstructions, hasDoorbell, hookedHosts, opponentInstructions, outdatedHostFiles, setUpHosts, startInstructions } from "./host-files.ts";
