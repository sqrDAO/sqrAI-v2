import {
    Action,
    composeContext,
    elizaLogger,
    generateText,
    GoalStatus,
    HandlerCallback,
    IAgentRuntime,
    Memory,
    parseJSONObjectFromText,
    State,
    updateGoal,
    UUID,
} from "@elizaos/core";
import fs from "fs/promises";
import path from "path";

export const createFileAction: Action = {
    name: "CREATE_FILE",
    similes: ["CREATE_FILE", "CREATE_FILE_IN_FOLDER"],
    description: "Create a file with the provided content",
    validate: async (_runtime, _message) => {
        return true;
    },
    handler: async (
        runtime: IAgentRuntime,
        message: Memory,
        state: State,
        _options: any,
        callback: HandlerCallback
    ) => {
        elizaLogger.log("Creating a file action: ", message);
        // get repo and path from context

        const sortedGoals = state.goalsData
            .filter(
                (a) =>
                    a.status === GoalStatus.IN_PROGRESS &&
                    a.name.startsWith("Gendoc")
            )
            // @ts-ignore
            .sort((a, b) => b.createdAt - a.createdAt);
        const latestGoal = sortedGoals[0];
        if (latestGoal) {
            const docId = latestGoal.name.split(":")[1] as UUID;

            const doc = await runtime.documentsManager.getMemoryById(docId);

            const contextDocument = {
                text: doc.content.text,
                source: doc.content.source,
                sourceRepo: doc.content.sourceRepo,
            };

            const input = await getPathFileAndContentFromContext(
                runtime,
                JSON.stringify(contextDocument, null, 2),
                state,
                _options,
                callback
            );
            const { filePath } = input;
            elizaLogger.log("File Path:", filePath);
            elizaLogger.log("Content:", contextDocument.text);

            // create the file with the provided content
            try {
                await fs.mkdir(path.dirname(filePath), { recursive: true });
                await fs.writeFile(filePath, contextDocument.text, "utf8");
                elizaLogger.log(`File created at ${filePath}`);

                await updateGoal({
                    runtime,
                    goal: { ...latestGoal, status: GoalStatus.DONE },
                });

                return callback({
                    text: `File created at ${filePath}`,
                });
            } catch (error) {
                elizaLogger.error("Error creating file: ", error);
                return callback({
                    text: `Error creating file: ${error}`,
                });
            }
        } else {
            callback({
                text: "You must call gendoc before call create file",
            });
        }
    },
    examples: [
        [
            {
                user: "{{user1}}",
                content: {
                    text: "Create file in folder /path/to/folder with content: Hello, World!",
                },
            },
            {
                user: "{{agentName}}",
                content: {
                    text: "File created at /path/to/folder",
                    action: "CREATE_FILE",
                },
            },
        ],
        [
            {
                user: "{{user1}}",
                content: {
                    text: "Use your output to create file doc for me",
                },
            },
            {
                user: "{{agentName}}",
                content: {
                    text: "ok, i created file at folder where source folder is",
                    action: "CREATE_FILE",
                },
            },
        ],
    ],
};

export async function getPathFileAndContentFromContext(
    runtime: IAgentRuntime,
    docContent: string,
    state: State,
    _options: any,
    callback: HandlerCallback
): Promise<{ filePath: string }> {
    const contextTemplate = `
You are working in a conversational context with a user. Your task is to extract and format information necessary to create a local file based on the user's input. To achieve this, look for the following details in the conversation:

1. **Path to the File**: The directory or file path where the user wants the file to be created. Default you can use folder input in file content
2. **User instructions**: Additional instruction of user.

### Context of Conversation:
{{recentMessages}}

The content of the file to be created:
${docContent}

### Instructions:
- Default you can use source folder from the context document as filePath.
- If both the file path and content are provided by the user, output them in the specified JSON format.
- If any required information is missing, ask a clarifying question to ensure both the path and content are captured accurately.
- The output must strictly follow this JSON format:
{
  "filePath": "example/path/to/file",
}
`;
    const context2 = await composeContext({
        state,
        template: contextTemplate,
    });
    const resultRepo = await generateText({
        runtime,
        context: context2,
        modelClass: "small",
    });
    const input = parseJSONObjectFromText(resultRepo);
    elizaLogger.log("Result:", input);
    if (!input.filePath) {
        callback({
            text: "File path is missing.",
        });
        return;
    }
    return {
        filePath: input.filePath,
    };
}
