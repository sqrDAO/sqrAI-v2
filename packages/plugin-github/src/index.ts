import {
    GoalStatus,
    ModelClass,
    booleanFooter,
    createGoal,
    elizaLogger,
    embed,
    parseBooleanFromText,
    parseJSONObjectFromText,
    parseJsonArrayFromText,
    stringArrayFooter,
    updateGoal,
} from "@elizaos/core";
import {
    Action,
    HandlerCallback,
    IAgentRuntime,
    Memory,
    Plugin,
    State,
} from "@elizaos/core";
import fs from "fs";
import path from "path";
import { generateText } from "@elizaos/core"; // Assuming generateText is a function from the eliza package
import { cloneRepoAction, Repo } from "./actions/clone";
import { getFileStructure, loadFiles } from "./actions/utils";
import { summarizeRepoAction } from "./actions/summarize";
import PostgresSingleton from "./services/pg";
import { fileURLToPath } from "url";
import {
    extractRepoNameAndOwner,
    getRepoByNameAndOwner,
    queryRelatedCodeFiles,
} from "./utils"; // Assuming extractRepoNameAndOwner and getRepoByNameAndOwner are functions from the utils
import repoApiRouter from "./repo_api";
import { gendocAction } from "./actions/gendoc";
import { createFileAction } from "./actions/createfile";
import { createPRAction } from "./actions/createPR";

const queryProjectAction: Action = {
    name: "EXPLAIN_PROJECT",
    similes: [
        "WHAT_IS_PROJECT",
        "HOW_TO_USE",
        "HOW_TO_BUILD",
        "SEARCH_PROJECT",
        "EXPLAIN_CODE",
        "EXPLAIN_PROJECT",
    ],
    description:
        // "Explain how a project works or provide information such as usage or purpose of a project",
        `Provide a clear and detailed explanation of how a project functions,
        including its purpose, usage instructions, or technical details.
        This may involve explaining the project's goals, key components, implementation,
        or guiding the user on how to utilize or search for specific features or code within the project.
        Provide accurate and relevant information by analyzing the project's codebase or documentation.
        `,
    validate: async (runtime: IAgentRuntime, _message: Memory) => {
        elizaLogger.log("Validating query project request");
        elizaLogger.log("Message:", _message);
        return true;
    },
    handler: async (
        runtime: IAgentRuntime,
        message: Memory,
        state: State,
        _options: any,
        callback: HandlerCallback
    ) => {
        elizaLogger.log("Explain project request: ", message);
        elizaLogger.log("State message: ", state.recentMessages);
        elizaLogger.log("State goal: ", state.goals);

        // Combine all recent messages between the user and the agent
        const combinedMessages = state.recentMessages;

        // Ask the LLM to write a better question
        const betterQuestionContext = `
            Here are the recent messages between the user and the agent:
            ${combinedMessages}

            TASK: Write a better question that combines all the recent messages.
            Take into account the context of the conversation and the user's intent.
            Give higher priority to users' messages.
            Include any relevant details or keywords that may help in answering the question.

            FORMAT:
            \`\`\`json
            {
            "repository": "owner/repo-name",
            "question": "What is the purpose of the project?",
            "context": "Any additional context or details that may be relevant."
            }
            \`\`\`
        `;

        const betterQuestion = await generateText({
            runtime,
            context: betterQuestionContext,
            modelClass: ModelClass.SMALL,
        });

        elizaLogger.log("Better Question: ", betterQuestion.trim());
        const questionDetails = parseJSONObjectFromText(betterQuestion.trim());

        if (!questionDetails.repository || !questionDetails.question) {
            callback({
                text: "I couldn't get the necessary details to answer the question. Could you please provide the repository and the question?",
            });
            return;
        }
        const [owner, repoName] = questionDetails.repository.split("/");

        if (!repoName || !owner) {
            callback({
                text: "I couldn't extract the repository name or owner. Could you please provide the repository details?",
            });
            return;
        }

        const repo = await getRepoByNameAndOwner(repoName, owner);
        if (!repo) {
            callback({
                text: "I couldn't find the repository in the database. Could you please confirm the repository details?",
            });
            return;
        }

        // await createGoal({
        //     runtime,
        //     goal: {
        //         roomId: state.roomId,
        //         userId: state.userId,
        //         name: `Working on Project: ${owner}/${repoName}`,
        //         status: GoalStatus.IN_PROGRESS,
        //         objectives: [
        //             {
        //                 description: "Understand the project's code base to answer the user's question",
        //                 completed: false
        //             }
        //         ]
        //     },
        // });

        const repoPath = repo.localPath;

        elizaLogger.log("Repo Path:", repoPath);

        if (!repoPath) {
            callback({
                text: "Could you please provide a valid local path to the cloned repository?",
            });
            return;
        }

        elizaLogger.log("Querying Project:", repoPath);

        let attempts = 0;
        let sufficientKnowledge = false;

        const questionEmbedding = await embed(
            runtime,
            `
            Question: ${questionDetails.question}
            Repository: ${questionDetails.repository}
            Context: ${questionDetails.context}
            `
        );
        const checkedFiles: { relativePath: string }[] =
            await queryRelatedCodeFiles(runtime, repo.id, questionEmbedding);

        while (attempts < 2 && !sufficientKnowledge) {
            // elizaLogger.log("Related files:", checkedFiles);
            attempts++;

            if (checkedFiles.length > 0) {
                const fileContents = await Promise.all(
                    checkedFiles.map(async (file) => {
                        try {
                            const content = fs.readFileSync(
                                path.join(repoPath, file.relativePath),
                                "utf-8"
                            );
                            return { relativePath: file.relativePath, content };
                        } catch (error) {
                            elizaLogger.error(
                                `Error reading file ${file.relativePath}:`,
                                error
                            );
                            return {
                                relativePath: file.relativePath,
                                content: "Error reading file",
                            };
                        }
                    })
                );

                const context =
                    `
                    Here is the existing knowledge about the project:
                    ${fileContents.map((file) => `Path: ${file.relativePath}\nContent: ${file.content}`).join("\n\n")}

                    CONTEXT:
                    ${questionDetails.context}

                    TASK: Determine if the existing knowledge is sufficient to answer the following question:
                    ${questionDetails.question}
                ` + booleanFooter;

                const response = await generateText({
                    runtime,
                    context,
                    modelClass: ModelClass.SMALL,
                });

                elizaLogger.log(
                    `Sufficient Knowledge Response: "${response.trim()}" - ${parseBooleanFromText(response.trim())}`
                );

                // answer anyway
                if (parseBooleanFromText(response.trim())) {
                    sufficientKnowledge = true;
                    const context = `
                        Here is the existing knowledge about the project:
                        ${fileContents.map((file) => `Path: ${file.relativePath}\nContent: ${file.content}`).join("\n\n")}

                        CONTEXT:
                        ${questionDetails.context}

                        TASK: Answer the following question:
                        ${questionDetails.question}

                        Answer clearly and concisely. Provide references to files or code snippets if necessary.
                        Code block formatting is supported.
                    `;

                    const answer = await generateText({
                        runtime,
                        context,
                        modelClass: ModelClass.SMALL,
                    });

                    callback({
                        text: answer,
                    });
                    return true;
                }
            }

            const fileList = getFileStructure(repoPath, 3, repoPath);
            elizaLogger.log("File List:", fileList);
            const unreadFiles = fileList.filter(
                (file) => !checkedFiles.some((f) => f.relativePath === file)
            );

            const filesRespond = await generateText({
                runtime,
                context:
                    `
                    CONTEXT:
                    ${questionDetails.context}
                    ---
                    Determine up to 5 files to read to gather more information about the project.
                    The file should contain information that can help answer the question:
                    ${questionDetails.question}
                    ---
                    List of potential files:
                    ${unreadFiles.join("\n")}
                    ---
                    List of files already checked:
                    ${checkedFiles.join("\n")}
                ` + stringArrayFooter,
                modelClass: ModelClass.SMALL,
            });

            const filesToRead = parseJsonArrayFromText(filesRespond);
            elizaLogger.log("Files to Read:", filesToRead);
            checkedFiles.push(
                ...filesToRead.map((file) => ({ relativePath: file }))
            );
        }

        if (!sufficientKnowledge) {
            callback({
                text: "I couldn't gather enough information after multiple attempts.",
                error: true,
            });
            return false;
        }

        return true;
    },
    examples: [
        [
            {
                user: "{{user1}}",
                content: {
                    text: "What is the purpose of the project {{project_name}}?",
                },
            },
            {
                user: "{{agentName}}",
                content: {
                    text: "I'll look into the project code to find out.",
                    action: "QUERY_PROJECT",
                },
            },
        ],
        [
            {
                user: "{{user1}}",
                content: {
                    text: "How to use {{project_name}} to build a web application?",
                },
            },
            {
                user: "{{agentName}}",
                content: {
                    text: "I'll look into the project to find out.",
                    action: "HOW_TO_USE",
                },
            },
        ],
        [
            {
                user: "{{user1}}",
                content: {
                    text: "Can you explain the structure of {{project_name}}?",
                },
            },
            {
                user: "{{agentName}}",
                content: {
                    text: "I'll look into the project to find out.",
                    action: "EXPLAIN_PROJECT",
                },
            },
        ],
    ],
} as Action;

let pgClient = null;
export async function initDB() {
    pgClient = await PostgresSingleton.getInstance().getClient();

    const __filename = fileURLToPath(import.meta.url); // get the resolved path to the file
    const __dirname = path.dirname(__filename); // get the name of the directory

    const githubSchema = fs.readFileSync(
        path.resolve(__dirname, "../schema.sql"),
        "utf8"
    );
    pgClient.query(githubSchema);
}

initDB().then(() => console.log("create db success"));
export const githubPlugin: Plugin = {
    name: "githubPlugin",
    description: "Plugin for GitHub integration",
    actions: [
        cloneRepoAction,
        summarizeRepoAction,
        queryProjectAction,
        gendocAction,
        createFileAction,
        createPRAction,
    ],
    evaluators: [],
    providers: [],
};

export { repoApiRouter };
