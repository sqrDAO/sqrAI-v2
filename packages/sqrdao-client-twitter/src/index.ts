import { tweetAction } from "./actions/tweet.ts";
import { ClientBase } from "./base.ts";
import { TwitterPostClient } from "./post.ts";
import { IAgentRuntime, Client, elizaLogger, Plugin } from "@elizaos/core";

class TwitterManagerV2 {
    client: ClientBase;
    post: TwitterPostClient;
    constructor(runtime: IAgentRuntime) {
        this.client = new ClientBase(runtime);
        this.post = new TwitterPostClient(this.client, runtime);
    }
}

export const TwitterClientInterfaceV2: Client = {
    async start(runtime: IAgentRuntime) {
        elizaLogger.log("Twitter client started");
        const manager = new TwitterManagerV2(runtime);
        await manager.post.start();

        return manager;
    },
    async stop(_runtime: IAgentRuntime) {
        elizaLogger.warn("Twitter client does not support stopping yet");
    },
};

export const twitterPlugin: Plugin = {
    actions: [tweetAction],
    name: "twitter",
    description: "Twitter Client Plugin",
};

export default TwitterClientInterfaceV2;
