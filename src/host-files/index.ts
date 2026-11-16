// The files through which an AI host finds Chesspal in the player's folder: the server, the opponent's instructions, the hosts' settings.
export { agentHosts, agentTools, analystAgent, coachAgent, hasAgent, instructionsFile, isCodex, onQuickModel, ponderAgentFor, ponderAgents, ponderHosts } from "./agents.ts";
export { codexHooksPath, hasDoorbell, hookedHosts, opponentInstructions, outdatedHostFiles, setUpHosts, startInstructions } from "./host-files.ts";
