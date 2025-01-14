import {
    Action,
    GoalStatus,
    HandlerCallback,
    IAgentRuntime,
    Memory,
    State,
    UUID,
    composeContext,
    createGoal,
    elizaLogger,
    embed,
    generateText,
    parseJSONObjectFromText,
} from "@elizaos/core";
import path from "path";
import PostgresSingleton from "../services/pg";
import fs from "fs";
import { v4 } from "uuid";
import { getAllFiles } from "./clone";

export const gendocAction: Action = {
    name: "GEN_DOC",
    similes: ["GEN_DOC", "CREATE_DOC", "GENERATE_DOC_FOR_CODE"],
    description: "Generate documentation for code",
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
        const pgClient = await PostgresSingleton.getInstance().getClient();
        elizaLogger.log("Generating documentation for code: ", message);
        const input = await getRepoAndPathFromContext(
            runtime,
            message,
            _state,
            _options,
            callback
        );
        elizaLogger.log("Repository Name:", input.repoName);
        elizaLogger.log("Folder Path:", input.folderPath);

        const foundRepo = await pgClient.query(
            `SELECT * FROM repositories WHERE name = $1 ORDER BY "createdAt" DESC LIMIT 1 `,
            [input.repoName.toLowerCase()]
        );
        if (foundRepo.rows.length === 0) {
            callback({
                text: `Repository ${input.repoName} not found. Please clone it.`,
            });
            return;
        }

        const searchPath = path.join(
            foundRepo.rows[0].localPath,
            input.folderPath
        );
        const files = await getAllFiles(searchPath);
        // const files = await glob(searchPath, { nodir: true });
        if (files.length === 0) {
            callback({
                text: `No files found in the folder path ${input.folderPath} of the repository ${input.repoName}. Please provide a valid folder path.`,
            });
            return;
        }

        const fileContent = await Promise.all(
            files.map(async (file) => {
                return {
                    fileName: file,
                    content: await fs.promises.readFile(file, "utf-8"),
                };
            })
        );
        const fileContentStr = fileContent
            .map((file) => {
                return `File: ${file.fileName}\nContent:\n${file.content}`;
            })
            .join("\n\n");

        const context = `You must create a README.md file for  some code files. These files may or may not be part of a cohesive project. Your task is to analyze the files and produce a README.md document that includes the following sections:

Introduction:

Provide a brief overview of the folder and its purpose (e.g., a collection of utility scripts, examples, or standalone tools).
File Descriptions:

List each file with its name and a brief description of what it does, based on its content.
Usage Instructions:

For each file, explain how to execute it, including command-line usage if applicable.
Dependencies:

List any libraries or tools required to run the files.
Additional Notes (Optional):

Include any miscellaneous information, such as limitations, example outputs, or further usage suggestions.
Input Files:
${fileContentStr}

Output Format:
Generate a concise and well-formatted README.md file in markdown syntax, ensuring clarity and appropriate structure.`;
        const resultReadme = await generateText({
            runtime,
            context: context,
            modelClass: "small",
        });
        // const content = { text: resultReadme };
        const embedding = await embed(
            runtime,
            `${resultReadme}\n Source input: ${path.join(
                foundRepo.rows[0].localPath,
                input.folderPath
            )} \n Source Repo: ${foundRepo.rows[0].localPath}
            \n Repo name: ${foundRepo.rows[0].name} \n Owner: ${foundRepo.rows[0].owner}`
        );

        const docId = v4() as UUID;

        await runtime.documentsManager.createMemory({
            id: docId,
            content: {
                text: resultReadme,
                source: path.join(
                    foundRepo.rows[0].localPath,
                    input.folderPath
                ),
                sourceRepo: foundRepo.rows[0].localPath,
                repoName: foundRepo.rows[0].name,
                owner: foundRepo.rows[0].owner,
            },
            agentId: runtime.agentId,
            roomId: message.roomId,
            userId: message.userId,
            createdAt: Date.now(),
            embedding: embedding,
        });

        await createGoal({
            runtime,
            goal: {
                name: `Gendoc:${docId}`,
                roomId: message.roomId,
                userId: message.userId,
                status: GoalStatus.IN_PROGRESS,
                objectives: [
                    {
                        description: `Generate documentation: ${docId}`,
                        completed: true,
                    },
                    {
                        description: "Create file",
                        completed: false,
                    },
                ],
            },
        });

        const response = {
            text: resultReadme,
        };
        callback(response);
    },
    examples: [
        [
            {
                user: "{{user1}}",
                content: {
                    text: "Generate documentation for code in repository project-management-tool and folder src/utils",
                },
            },
            {
                user: "{{agentName}}",
                content: {
                    text: "Here is the generated file content from your codes:\n# Introduction\n\nThis repository contains utility scripts for managing projects.\n\n# File Descriptions\n\n## utils.js\n\nThis file contains utility functions for managing projects.\n\n## constants.js\n\nThis file contains constants used in the project.\n\n# Usage Instructions\n\nTo use the utility functions, import the utils.js file in your project.\n\nTo use the constants, import the constants.js file in your project.\n\n# Dependencies\n\nNone\n\n# Additional Notes\n\n- The utils.js file contains functions for managing tasks and deadlines.\n\n- The constants.js file contains project-specific constants.\n\nOutput Format:\n\nGenerate a concise and well-formatted README.md file in markdown syntax, ensuring clarity and appropriate structure.",
                    action: "GEN_DOC",
                },
            },
        ],
    ],
};

export async function getRepoAndPathFromContext(
    runtime: IAgentRuntime,
    message: Memory,
    _state: State,
    _options: any,
    callback: HandlerCallback
): Promise<{ repoName: string; folderPath: string }> {
    const contextTemplate = `
You are working on a chat with user, and you need to get repository name and a folder path within it. You need the following information:
- Repository Name: The name of the repository that contains the code or resources you want to work with. Example: project-management-tool, ecommerce-site-backend.
- Folder Path: The relative path to the folder inside the repository that you need to handle. Example: src/utils, data/models, docs/reference.
Make sure to specify the correct repository and folder path so the system can efficiently locate and process the content.
---
Current context:
{{recentMessages}}
---
Response format should be formatted in JSON block like this:
{ "repoName": "project-management-tool", "folderPath": "src/utils" }
`;
    const context2 = await composeContext({
        state: {
            ..._state,
        },
        template: contextTemplate,
    });

    const resultRepo = await generateText({
        runtime,
        context: context2,
        modelClass: "small",
    });
    const input = parseJSONObjectFromText(resultRepo);
    elizaLogger.log("Result:", input);
    if (!input.repoName) {
        callback({
            text: "Repository name is missing. Please provide the repository name.",
        });
        return;
    }
    if (!input.folderPath) {
        callback({
            text: "Folder path is missing. Please provide the folder path.",
        });
        return;
    }
    return {
        repoName: input.repoName,
        folderPath: input.folderPath,
    };
}
