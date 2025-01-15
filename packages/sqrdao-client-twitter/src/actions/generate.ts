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

// this is a system action that should only be used by the system or the agent itself
// the chat room should be the agent's room
export const generateTweetAction: Action = {
    name: "GENERATE_TWEET",
    similes: ["GENERATE_TWEET_ABOUT_EVENT"],
    description: "Only generate tweet content",
    validate: async (_runtime: IAgentRuntime, _message: Memory) => {
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

        console.log(`Tweeting about: ${message.content.text}`);

        const context = composeContext({
            state,
            template: `
            Generate only ONE tweet base on this data: ${message.content.text} \n

            Knowledge:
            {{knowledge}}

            Brief, concise statements only. The total character count MUST be less than 280.`,
        });

        console.log(`context: ${context}`);

        // generate context tweet
        const content = await generateText({
            runtime,
            context,
            modelClass: ModelClass.SMALL,
        });
        elizaLogger.log(`Generated tweet: ${content}`);

        if (callback) {
            callback({
                text: `Tweet content: ${content}`,
            });
        }

        return true;
    },
    examples: [
        [
            {
                user: "{{user1}}",
                content: {
                    text: "Generate a tweet about something",
                },
            },
            {
                user: "{{agentName}}",
                content: {
                    text: "Yes. I generated a tweet about something.",
                    action: "GENERATE_TWEET",
                },
            },
        ],
    ],
};
