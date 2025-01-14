import {
    Action,
    elizaLogger,
    embed,
    HandlerCallback,
    IAgentRuntime,
    Memory,
    State,
} from "@elizaos/core";
export const summarizeCrawledWebsite: Action = {
    name: "SUMMARIZE_CRAWLED_WEBSITE",
    similes: ["summarize crawled website"],
    description: "Summarize the content of a crawled website",
    validate: async (runtime: IAgentRuntime, _message: Memory) => {
        return true;
    },
    handler: async (
        runtime: IAgentRuntime,
        message: Memory,
        _state: State,
        _options: any,
        callback: HandlerCallback
    ) => {
        const embedding = await embed(runtime, message.content.text);
        const memory = await runtime.knowledgeManager.searchMemoriesByEmbedding(
            embedding,
            {
                count: 1,
                roomId: message.roomId,
                match_threshold: 0.01,
            }
        );
        if (memory.length === 0) {
            elizaLogger.error("No memory found for the crawled website");
            await callback({
                text: "No memory found for the crawled website, did you crawled that website?",
            });
            return;
        }
        await callback({
            text: JSON.parse(memory[0].content.text).summary,
        });
        return;
    },
    examples: [],
};
