import {
    Action,
    composeContext,
    elizaLogger,
    generateText,
    getEmbeddingZeroVector,
    HandlerCallback,
    IAgentRuntime,
    Memory,
    parseJSONObjectFromText,
    State,
    stringToUuid,
    UUID,
} from "@elizaos/core";
import { TwitterPostClient, twitterPostTemplate } from "../post";
import { ClientBase } from "../base";

// this is a system action that should only be used by the system or the agent itself
// the chat room should be the agent's room
export const tweetAction: Action = {
    name: "GENERATE_TWEET",
    similes: ["TWEET", "TWEET_ABOUT_EVENT", "POST_ON_TWITTER"],
    description: "Generate a tweet about an event.",
    validate: async (runtime: IAgentRuntime, _message: Memory) => {
        elizaLogger.log("Validating tweet actions request");
        elizaLogger.log("Message:", _message);
        return true;
    },
    handler: async (
        runtime: IAgentRuntime,
        message: Memory,
        state: State | undefined,
        _options: any,
        callback: HandlerCallback | undefined
    ) => {
        if (!state) {
            elizaLogger.error("State is missing for tweet action");
            return false;
        }
        const client = new ClientBase(runtime);
        const post = new TwitterPostClient(client, runtime);

        const entities = await client.queryTwitterAccessToken(runtime.agentId);
        if (entities.length === 0) {
            elizaLogger.error("No Twitter access token found for the agent");
            return false;
        }
        console.log(`Entities: ${JSON.stringify(entities)}`);

        // initialize Twitter API
        await post.initTwitterApi(entities[0].accessToken);
        // generate a new tweet and post it
        const tweetUrl = await post.generateNewTweet();

        if (callback) {
            callback({
                text: `Tweet url: ${tweetUrl}`,
            });
        }

        return true;
    },
    examples: [],
};
