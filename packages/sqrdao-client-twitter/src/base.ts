import { TwitterApi } from "twitter-api-v2";
import { IAgentRuntime } from "@elizaos/core";
import { EventEmitter } from "events";
import pg from "pg";
export class ClientBase extends EventEmitter {
    runtime: IAgentRuntime;
    twApiV2: TwitterApi;
    pool: pg.Pool;
    constructor(runtime: IAgentRuntime) {
        super();
        this.runtime = runtime;
        this.pool = new pg.Pool({
            connectionString: process.env.POSTGRES_URL,
        });

        this.pool.on("error", (err) => {
            console.error("Unexpected error on idle PostgreSQL client:", err);
            process.exit(-1);
        });
    }

    async cacheTweet(tweet: any): Promise<void> {
        if (!tweet) {
            console.warn("Tweet is undefined, skipping cache");
            return;
        }

        this.runtime.cacheManager.set(`twitter/tweets/${tweet.id}`, tweet);
    }

    async getCachedTweet(tweetId: string): Promise<any | undefined> {
        const cached = await this.runtime.cacheManager.get<any>(
            `twitter/tweets/${tweetId}`
        );

        return cached;
    }

    async connectDB() {
        await this.pool.connect();
    }

    // Method to get a database client
    public async getClient(): Promise<pg.PoolClient> {
        return await this.pool.connect();
    }

    // Method to query the database directly using the pool
    public async query(text: string, params?: any[]): Promise<any> {
        try {
            return await this.pool.query(text, params);
        } catch (error) {
            console.error("Error executing query:", error);
            throw error;
        }
    }

    public async queryTwitterAccessToken(agentId: string): Promise<any> {
        const result = await this.query(
            'SELECT * FROM twitter_client WHERE "agentId" = $1',
            [agentId]
        );
        return result.rows;
    }

    // Close the pool
    public async close(): Promise<void> {
        await this.pool.end();
    }

    public async refreshTwitterToken(refreshToken: string) {
        const url = "https://api.twitter.com/2/oauth2/token";

        // Basic Authorization header: Base64(client_id:client_secret)
        const authHeader = `Basic ${btoa(`${process.env.TWITTER_CLIENT_ID}:${process.env.TWITTER_CLIENT_SECRET}`)}`;

        const headers = {
            "Content-Type": "application/x-www-form-urlencoded",
            Authorization: authHeader,
        };

        const body = new URLSearchParams({
            grant_type: "refresh_token",
            refresh_token: refreshToken,
        });

        try {
            const response = await fetch(url, {
                method: "POST",
                headers,
                body,
            });

            if (!response.ok) {
                throw new Error(`HTTP Error! Status: ${response.status}`);
            }

            const data = await response.json();
            console.log("Token refreshed successfully:", data);

            // Extract the new tokens and expiration time
            const { access_token, refresh_token, expires_in } = data;
            console.log("New Access Token:", access_token);
            console.log("New Refresh Token:", refresh_token);
            console.log("Expires In (seconds):", expires_in);

            return data;
        } catch (error) {
            console.error("Error refreshing token:", error.message);
        }
    }

    public async saveAccessToken(
        id: string,
        access_token: string,
        refresh_token: string,
        expires_in: number // in seconds
    ) {
        try {
            const expiration = new Date(Date.now() + expires_in * 1000);
            await this.query(
                'UPDATE twitter_client SET "accessToken" = $1, "refreshToken" = $2, "expiredAt" = $3 WHERE id = $4;',
                [access_token, refresh_token, expiration, id]
            );
        } catch (error) {
            console.error("Error saving access token:", error);
        }
    }
}
