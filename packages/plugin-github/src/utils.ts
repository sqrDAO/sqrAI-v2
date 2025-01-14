import {
    generateText,
    IAgentRuntime,
    ModelClass,
    parseJSONObjectFromText,
} from "@elizaos/core"; // Assuming generateText is a function from the eliza package
import PostgresSingleton from "./services/pg";

const messageCompletionFooter =
    '\nResponse format should be formatted in a JSON block like this:\n```json\n{ "name": string, "owner": string}\n```';

export async function extractRepoNameAndOwner(
    runtime: IAgentRuntime,
    text: string
): Promise<{ name: string | null; owner: string | null }> {
    const context =
        `
        Extract the repository name and owner from the following text:
        ${text}
    ` + messageCompletionFooter;
    const response = await generateText({
        runtime,
        context,
        modelClass: ModelClass.SMALL,
    });
    console.log("Extracted repository name and owner:", response);
    const parsedResponse = parseJSONObjectFromText(response);
    return {
        name: parsedResponse?.name || null,
        owner: parsedResponse?.owner || null,
    };
}

export async function getRepoByNameAndOwner(
    name: string,
    owner: string
): Promise<any> {
    const pgClient = await PostgresSingleton.getInstance().getClient();
    try {
        const result = await pgClient.query(
            "SELECT * FROM repositories WHERE name = $1 AND owner = $2",
            [name.toLowerCase(), owner.toLowerCase()]
        );
        return result.rows[0];
    } catch (error) {
        console.error("Error querying repository by name and owner:", error);
        throw error;
    } finally {
        pgClient.release();
    }
}

export async function queryRelatedCodeFiles(
    runtime: IAgentRuntime,
    repoId: string,
    questionEmbedding: number[]
): Promise<any[]> {
    const pgClient = await PostgresSingleton.getInstance().getClient();
    try {
        const result = await pgClient.query(
            `SELECT * FROM code_files
       WHERE "repositoryId" = $1
       ORDER BY embedding <-> $2
       LIMIT 10`,
            [repoId, `[${questionEmbedding.join(",")}]`]
        );
        console.log(`Found ${result.rows.length} related code files`);
        return result.rows;
    } catch (error) {
        console.error("Error querying related code files:", error);
        throw error;
    } finally {
        pgClient.release();
    }
}

export async function getAllRepositories(): Promise<any[]> {
    const pgClient = await PostgresSingleton.getInstance().getClient();
    try {
        const result = await pgClient.query("SELECT * FROM repositories");
        return result.rows;
    } catch (error) {
        console.error("Error querying all repositories:", error);
        throw error;
    } finally {
        pgClient.release();
    }
}
