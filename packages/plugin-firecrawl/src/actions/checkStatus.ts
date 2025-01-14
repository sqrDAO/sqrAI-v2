import {
    Action,
    elizaLogger,
    embed,
    HandlerCallback,
    IAgentRuntime,
    Memory,
    State,
} from "@elizaos/core";
export const checkStatusFirecrawlAction: Action = {
    name: "CHECK_STATUS_FIRE_CRAWL",
    similes: ["check status crawl website"],
    description: "check status crawl website",
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
            { count: 1, roomId: message.roomId, match_threshold: 0.01 }
        );
        if (memory.length === 0) {
            elizaLogger.error("No memory found for the crawled website");
            await callback({
                text: "No memory found for the crawled website, did you crawled that website?",
            });
            return;
        }
        await callback({
            text: "This website crawled successfully, you can summarize that website now",
        });
        return;
        // const firecrawlApp = Firecrawl.getInstance();
        // const id = extractUUID(message.content.text);
        // elizaLogger.log("check status with crawl ID: ", id);
        // const currentStatus = await firecrawlApp.checkCrawlStatus(id);
        // elizaLogger.log("Crawl status: ", currentStatus);

        // // loop 1s until the crawl is complete
        // if (currentStatus.success) {
        //     if (currentStatus.status === "scraping") {
        //         return await callback({ text: "Crawl is still in progress" });
        //     }
        // }
        // elizaLogger.log("Crawl completed successfully");
        // await callback({ text: "Crawl completed successfully" });
        // return;
    },
    examples: [],
};

function extractUUID(message) {
    const uuidRegex =
        /\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b/;
    const match = message.match(uuidRegex);
    return match ? match[0] : null; // Returns the UUID if found, otherwise null
}
