import {
    Action,
    elizaLogger,
    embed,
    generateText,
    HandlerCallback,
    IAgentRuntime,
    Memory,
    parseJSONObjectFromText,
    State,
} from "@elizaos/core";
import {
    convertFileStructureToText,
    getFileStructure,
    loadFiles,
} from "./utils";
import { Repo } from "./clone";

const summarizeRepo = async (
    repoPath: string,
    runtime: IAgentRuntime,
    message: Memory
) => {
    elizaLogger.log("Message:", message);
    try {
        const fileList = getFileStructure(repoPath, 4, repoPath);
        const fileStructureText = convertFileStructureToText(
            fileList,
            repoPath
        );

        const context = `
            Here is the file structure of a GitHub repository:
            ${fileStructureText}

            TASK: extract the following information:
            - Programming language(s)
            - Framework(s)
            - Documentation files
            - Other potential important files

            Answer in JSON format string. For example:
            \`\`\`json
            {
                "programmingLanguages": ["Python", "JavaScript"],
                "frameworks": ["React", "Flask"],
                "documentationFiles": ["README.md"],
                "importantFiles": ["config.json", "Dockerfile", "requirements.txt", "package.json"]
            }
            \`\`\`
            Keep the response short, do not list everything, only list the important ones.

            Additional context from user's message: ${message.content.text}
        `;

        const summary = await generateText({
            runtime,
            context,
            modelClass: "small",
        });

        elizaLogger.log("Summary:", summary);
        const parsedSummary = parseJSONObjectFromText(summary);

        return {
            success: true,
            data: parsedSummary,
        };
    } catch (error) {
        elizaLogger.error("Failed to summarize repo:", error);
        return {
            success: false,
            error: error.message || "Unknown error occurred",
        };
    }
};

const generateRepoSummary = async (
    repo: Repo,
    runtime: IAgentRuntime,
    message: Memory,
    files: string[]
) => {
    elizaLogger.log("Generating repository summary:", message);
    try {
        const importantFiles = loadFiles(repo.localPath, files);

        const context = `
            Here is the file structure of a GitHub repository:

            ${importantFiles.map((file) => `File: ${file.path}\nContent:\n${file.content}`).join("\n\n")}

            TASK: extract the following information:
            - What is this repository about
            - How this was supposed to be used
            - Who are the targeted users
            - Why this repo was made

            Here are some important files:
            ${importantFiles.map((file) => `File: ${file.path}\nContent:\n${file.content}`).join("\n\n")}

            Answer in JSON format string. For example:
            \`\`\`json
            {
                "about": "This repository is about...",
                "usage": "This repository is supposed to be used for...",
                "targetedUsers": ["Developers", "Researchers"],
                "purpose": "This repository was made to..."
            }
            \`\`\`
            Keep the response concise and to the point, from 100 to 200 words.

            Additional context from user's message: ${message.content.text}
        `;

        const summary = await generateText({
            runtime,
            context,
            modelClass: "small",
        });

        elizaLogger.log("Summary:", summary);
        const parsedSummary = parseJSONObjectFromText(summary);

        return {
            success: true,
            data: parsedSummary,
        };
    } catch (error) {
        elizaLogger.error("Failed to generate repository summary:", error);
        return {
            success: false,
            error: error.message || "Unknown error occurred",
        };
    }
};

export const summarizeRepoAction: Action = {
    name: "SUMMARIZE_REPO",
    similes: [
        "REPO_SUMMARY",
        "SUMMARIZE_REPOSITORY",
        "REPOSITORY_SUMMARY",
        "GIT_SUMMARY",
        "SUMMARIZE_GIT_REPO",
    ],
    description:
        "Summarize or improve a summarization of a cloned GitHub repository",
    validate: async (runtime: IAgentRuntime, _message: Memory) => {
        elizaLogger.log("Validating summarize repo request");
        // TODO: what should we verify before summarizing a repo?
        // For example, we could check if the repository has been cloned.
        return true;
    },
    handler: async (
        runtime: IAgentRuntime,
        message: Memory,
        _state: State,
        _options: any,
        callback: HandlerCallback
    ) => {
        elizaLogger.log("Github Repository summarize request: ", message);

        const embedding = await embed(runtime, message.content.text);

        // Query the local path from memory
        const memory = await runtime.knowledgeManager.searchMemoriesByEmbedding(
            embedding,
            {
                roomId: message.roomId,
            }
        );

        const repoMemory = memory.find(
            (m) => m.content.action === "CLONE_REPO"
        );
        const repo = repoMemory?.content.repo as Repo;

        if (!repo) {
            callback({
                text: "Repository not found. Please confirm the repository.",
            });
            return;
        }

        const repoPath = repo.localPath;

        elizaLogger.log("Repo Path:", repoPath);

        if (!repoPath) {
            callback({
                text: "Could you please provide a valid local path to the cloned repository?",
            });
            return;
        }

        elizaLogger.log("Summarizing Repo:", repoPath);

        callback({
            text: `I'll summarize the repository at ${repoPath}`,
        });

        try {
            const result = await summarizeRepo(repoPath, runtime, message);
            if (!result.success) {
                callback({
                    text: `Failed to summarize repository: ${result.error}`,
                    error: true,
                });
                return;
            }

            // const summaryText = `Summary of the repository ${repo.name}: ${JSON.stringify(result.data)}`;
            // const summaryEmbedding = await embed(runtime, summaryText);

            // await runtime.knowledgeManager.createMemory({
            //     userId: message.userId,
            //     agentId: message.agentId,
            //     roomId: message.roomId,
            //     embedding: summaryEmbedding,
            //     content: {
            //         text: summaryText,
            //         action: "SUMMARIZE_REPO",
            //         repo,
            //         summary: result.data
            //     }
            // });

            if (result.success) {
                callback({
                    text: "Repository summarized successfully",
                });
            } else {
                callback({
                    text: `Failed to summarize repository: ${result.error}`,
                    error: true,
                });
            }

            const contentSummaryResult = await generateRepoSummary(
                repo,
                runtime,
                message,
                result.data.importantFiles
            );

            if (!contentSummaryResult.success) {
                callback({
                    text: `Failed to generate repository summary: ${contentSummaryResult.error}`,
                    error: true,
                });
                return;
            }

            const contentSummaryText = `Summary of the repository ${repo.name}: ${JSON.stringify(contentSummaryResult.data)}`;
            const contentSummaryEmbedding = await embed(
                runtime,
                contentSummaryText
            );

            await runtime.knowledgeManager.createMemory({
                userId: message.userId,
                agentId: message.agentId,
                roomId: message.roomId,
                embedding: contentSummaryEmbedding,
                content: {
                    text: contentSummaryText,
                    action: "SUMMARIZE_REPO",
                    repo,
                    summary: result.data,
                },
            });

            callback({
                text: contentSummaryResult.data.purpose,
            });
        } catch (error) {
            elizaLogger.error(
                `Failed to summarize repository. Error: ${error}`
            );
            callback({
                text: `Failed to summarize repository: ${error.message}`,
                error: true,
            });
        }
    },
    examples: [],
} as Action;
