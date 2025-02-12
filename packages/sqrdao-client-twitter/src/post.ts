import {
    composeContext,
    generateText,
    getEmbeddingZeroVector,
    IAgentRuntime,
    ModelClass,
    stringToUuid,
} from "@elizaos/core";
import { elizaLogger } from "@elizaos/core";
import { TwitterApi } from "twitter-api-v2";
import { ClientBase } from "./base";

export const twitterPostTemplate = `
# Areas of Expertise
{{knowledge}}

# About {{agentName}} (@{{twitterUserName}}):
{{bio}}
{{lore}}
{{topics}}

{{providers}}

{{characterPostExamples}}

{{postDirections}}

# Task: Generate a post in the voice and style and perspective of {{agentName}} @{{twitterUserName}}.
Write a 1-3 sentence post that is {{adjective}} about {{topic}} (without mentioning {{topic}} directly), from the perspective of {{agentName}}. Do not add commentary or acknowledge this request, just write the post.
Your response should not contain any questions. Brief, concise statements only. The total character count MUST be less than 280. No emojis. Use \\n\\n (double spaces) between statements.`;

const MAX_TWEET_LENGTH = 280;

/**
 * Truncate text to fit within the Twitter character limit, ensuring it ends at a complete sentence.
 */
function truncateToCompleteSentence(text: string): string {
    if (text.length <= MAX_TWEET_LENGTH) {
        return text;
    }

    // Attempt to truncate at the last period within the limit
    const truncatedAtPeriod = text.slice(
        0,
        text.lastIndexOf(".", MAX_TWEET_LENGTH) + 1
    );
    if (truncatedAtPeriod.trim().length > 0) {
        return truncatedAtPeriod.trim();
    }

    // If no period is found, truncate to the nearest whitespace
    const truncatedAtSpace = text.slice(
        0,
        text.lastIndexOf(" ", MAX_TWEET_LENGTH)
    );
    if (truncatedAtSpace.trim().length > 0) {
        return truncatedAtSpace.trim() + "...";
    }

    // Fallback: Hard truncate and add ellipsis
    return text.slice(0, MAX_TWEET_LENGTH - 3).trim() + "...";
}

export class TwitterPostClient {
    client: ClientBase;
    runtime: IAgentRuntime;

    constructor(client: ClientBase, runtime: IAgentRuntime) {
        this.runtime = runtime;
        this.client = client;
    }

    async start(postImmediately: boolean = false) {
        const generateNewTweetLoop = async () => {
            const minMinutes =
                parseInt(this.runtime.getSetting("POST_INTERVAL_MIN")) || 90;
            const maxMinutes =
                parseInt(this.runtime.getSetting("POST_INTERVAL_MAX")) || 180;
            const randomMinutes =
                Math.floor(Math.random() * (maxMinutes - minMinutes + 1)) +
                minMinutes;
            const delay = randomMinutes * 60 * 1000;

            const agentId = this.runtime.agentId;
            console.log("agentId: ", agentId);

            const entities = await this.client.queryTwitterAccessToken(agentId);

            for (const entity of entities) {
                // stop post
                if (entity.twitterId !== "1869665627407106048") {
                    continue;
                }

                const username = entity.twitterUsername ?? "";
                const lastPost = await this.runtime.cacheManager.get<{
                    timestamp: number;
                }>("twitter/" + username + "/lastPost");

                const lastPostTimestamp = lastPost?.timestamp ?? 0;

                // initialize Twitter API
                const { access_token, refresh_token, expires_in } =
                    await this.client.refreshTwitterToken(entity.refreshToken);

                // Save new access token
                await this.client.saveAccessToken(
                    entity.id,
                    access_token,
                    refresh_token,
                    expires_in
                );

                console.log(`lastPostTimestamp: ${lastPostTimestamp}`);
                console.log(`Time to check: ${Date.now()}`);
                const timeCheck = lastPostTimestamp + delay - 60_000;
                console.log(`timeCheck: ${timeCheck}`);

                if (Date.now() > timeCheck) {
                    elizaLogger.log(`Tweet with ${entity.twitterName}`);
                    await this.generateNewTweet(access_token);
                }
            }

            setTimeout(() => {
                generateNewTweetLoop(); // Set up next iteration
            }, delay);

            elizaLogger.log(`Next tweet scheduled in ${randomMinutes} minutes`);
        };
        generateNewTweetLoop();
    }

    initTwitterApi(bearerToken: string): TwitterApi {
        try {
            return new TwitterApi(bearerToken);
        } catch (error) {
            elizaLogger.log(`Error initializing Twitter API: ${error}`);
            return;
        }
    }

    public async generateNewTweet(access_token: string): Promise<any> {
        elizaLogger.log("Generating new tweet");

        try {
            const twApiV2 = this.initTwitterApi(access_token);
            const twUser = (await twApiV2.v2.me()).data;
            const username = twUser.username;
            const twId = twUser.id;
            const roomId = stringToUuid("twitter_generate_room-" + username);
            await this.runtime.ensureUserExists(
                this.runtime.agentId,
                username,
                this.runtime.character.name,
                "twitter"
            );

            const topics = this.runtime.character.topics.join(", ");
            const state = await this.runtime.composeState(
                {
                    userId: this.runtime.agentId,
                    roomId: roomId,
                    agentId: this.runtime.agentId,
                    content: {
                        text: topics || "",
                        action: "TWEET",
                    },
                },
                {
                    twitterUserName: username,
                }
            );

            const context = composeContext({
                state,
                template:
                    this.runtime.character.templates?.twitterPostTemplate ||
                    twitterPostTemplate,
            });

            elizaLogger.debug("generate post prompt:\n" + context);

            const newTweetContent = await generateText({
                runtime: this.runtime,
                context,
                modelClass: ModelClass.SMALL,
            });

            // Replace \n with proper line breaks and trim excess spaces
            const formattedTweet = newTweetContent
                .replaceAll(/\\n/g, "\n")
                .trim();

            // Use the helper function to truncate to complete sentence
            const content = truncateToCompleteSentence(formattedTweet);

            if (this.runtime.getSetting("TWITTER_DRY_RUN") === "true") {
                elizaLogger.info(
                    `Dry run: would have posted tweet: ${content}`
                );
                return;
            }

            try {
                const projects = await this.client.query(
                    'SELECT * FROM projects WHERE "id" = 2'
                );
                let index = projects.rows[0].index;
                const data = projects.rows[0].data;
                if (index >= data.projects.length) {
                    elizaLogger.log(`No data available`);
                    return;
                }
                const longTextTweet = data.projects[index].Text;
                const replyTo = data.projects[index].ReplyTo;

                // Use longTextTweet instead of content
                elizaLogger.log(`Posting new tweet:\n ${longTextTweet}`);
                let result: any;
                if (replyTo) {
                    elizaLogger.log(`Replying to:\n ${replyTo}`);
                    result = await twApiV2.v2.tweet(longTextTweet, {
                        reply: { in_reply_to_tweet_id: replyTo },
                    });
                } else result = await twApiV2.v2.tweet(longTextTweet);

                if (result?.errors) {
                    console.error(
                        "Error sending tweet; Bad response:",
                        result?.errors
                    );
                    return;
                }

                // query the tweet to get the full tweet object
                const tweet = result.data;

                const tweetUrl = `https://twitter.com/${username}/status/${tweet.id}`;
                elizaLogger.log(`Tweet posted:\n ${tweetUrl}`);

                await this.runtime.ensureRoomExists(roomId);
                await this.runtime.ensureParticipantInRoom(
                    this.runtime.agentId,
                    roomId
                );

                await this.runtime.messageManager.createMemory({
                    id: stringToUuid(tweet.id + "-" + this.runtime.agentId),
                    userId: this.runtime.agentId,
                    agentId: this.runtime.agentId,
                    content: {
                        twitterId: twId,
                        text: longTextTweet.trim(),
                        url: tweetUrl,
                        source: "twitter",
                    },
                    roomId,
                    embedding: getEmbeddingZeroVector(),
                    createdAt: Date.now(),
                });

                index++;
                await this.client.query(
                    'UPDATE projects SET index = $1 WHERE "id" = 1',
                    [index]
                );

                // Cache tweet & last post
                await this.runtime.cacheManager.set(
                    `twitter/${twUser.username}/lastPost`,
                    {
                        id: tweet.id,
                        timestamp: Date.now(),
                    }
                );
                console.log(`Time to cache last post: ${Date.now()}`);

                await this.client.cacheTweet(tweet);
            } catch (error) {
                elizaLogger.error("Error sending tweet:", error);
            }
        } catch (error) {
            elizaLogger.error("Error generating new tweet:", error);
        }
    }

    async tweet(userId: string, content: string) {
        try {
            const entities = await this.client.queryTwitterAccessToken(
                this.runtime.agentId
            );
            if (entities.length === 0) {
                elizaLogger.error(
                    "No Twitter access token found for the agent"
                );
                return false;
            }
            for (const entity of entities) {
                const userIdFromWallet = stringToUuid(entity.walletAddress);
                // only dev can post
                if (entity.twitterId == "1869310432823169024") {
                    continue;
                }
                if (userId != userIdFromWallet) {
                    continue;
                }

                const { access_token, refresh_token, expires_in } =
                    await this.client.refreshTwitterToken(entity.refreshToken);
                // initialize Twitter API
                const twApiV2 = this.initTwitterApi(access_token);
                // Save new access token
                await this.client.saveAccessToken(
                    entity.id,
                    access_token,
                    refresh_token,
                    expires_in
                );

                const twUser = (await twApiV2.v2.me()).data;
                const username = twUser.username;
                const twId = twUser.id;
                const roomId = stringToUuid(
                    "twitter_generate_room-" + username
                );
                await this.runtime.ensureUserExists(
                    this.runtime.agentId,
                    username,
                    this.runtime.character.name,
                    "twitter"
                );
                // Replace \n with proper line breaks and trim excess spaces
                const formattedTweet = content.replaceAll(/\\n/g, "\n").trim();

                // Use the helper function to truncate to complete sentence
                const contentPost = truncateToCompleteSentence(formattedTweet);

                const result = await twApiV2.v2.tweet(contentPost);

                if (result?.errors) {
                    console.error(
                        "Error sending tweet; Bad response:",
                        result?.errors
                    );
                    return;
                }

                // query the tweet to get the full tweet object
                const tweet = result.data;

                const tweetUrl = `https://twitter.com/${username}/status/${tweet.id}`;
                elizaLogger.log(`Tweet posted:\n ${tweetUrl}`);

                await this.runtime.ensureRoomExists(roomId);
                await this.runtime.ensureParticipantInRoom(
                    this.runtime.agentId,
                    roomId
                );

                await this.runtime.messageManager.createMemory({
                    id: stringToUuid(tweet.id + "-" + this.runtime.agentId),
                    userId: this.runtime.agentId,
                    agentId: this.runtime.agentId,
                    content: {
                        twitterId: twId,
                        text: content,
                        url: tweetUrl,
                        source: "twitter",
                    },
                    roomId,
                    embedding: getEmbeddingZeroVector(),
                    createdAt: Date.now(),
                });

                // Cache tweet
                await this.client.cacheTweet(tweet);

                return tweetUrl;
            }

            return "";
        } catch (error) {
            elizaLogger.error("Error sending tweet:", error);
            return "";
        }
    }
}
