// The files through which an AI host finds Chesspal in the player's folder: the server, the opponent's instructions, the hosts' settings.
export { analystAgent, coachAgent, hasAgent, instructions, onQuickModel, ponderAgentFor, ponderAgents } from "./agents.ts";
export { codexHooksPath, opponentInstructions, setUpHosts } from "./host-files.ts";
