import {
    Action,
    composeContext,
    elizaLogger,
    generateText,
    HandlerCallback,
    IAgentRuntime,
    Memory,
    ModelClass,
    State,
} from "@elizaos/core";
import { TwitterPostClient } from "../post";
import { ClientBase } from "../base";

// this is a system action that should only be used by the system or the agent itself
// the chat room should be the agent's room
export const postAction: Action = {
    name: "POST_ON_TWITTER",
    similes: ["POST_ON_TWITTER", "POST"],
    description: "Post on twitter with a generated tweet.",
    validate: async (runtime: IAgentRuntime, _message: Memory) => {
        elizaLogger.log("Validating post actions request");
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

        console.log(`Tweeting about: ${JSON.stringify(message.content)}`);
        const context = composeContext({
            state,
            template: `
                Generate a tweet according to user's request: ${message.content.text} \n

                If need to generate tweet, use the knowledge below:
                {{knowledge}}
                Tweet requirement: brief, concise statements only. The total character count MUST be less than 280.

                Only output the tweet content without any other text.
                `,
        });
        console.log(`context: ${context}`);

        const content = await generateText({
            runtime,
            context,
            modelClass: ModelClass.SMALL,
        });

        elizaLogger.log(`Generated tweet: ${content}`);

        // generate a new tweet and post it
        const tweetUrl = await post.tweet(message.userId, content);

        if (callback) {
            if (!tweetUrl) {
                callback({
                    text: "Failed to generate tweet, ensure connect to twitter",
                });
                return false;
            } else
                callback({
                    text: `Tweet url: ${tweetUrl}`,
                });
        }

        return true;
    },
    examples: [
        [
            {
                user: "{{user1}}",
                content: {
                    text: "Post a tweet about something",
                },
            },
            {
                user: "{{agentName}}",
                content: {
                    text: "Yes. I posted a tweet about something.",
                    action: "POST_ON_TWITTER",
                },
            },
        ],
    ],
};
