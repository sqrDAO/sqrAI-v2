import { Action, elizaLogger, generateText, HandlerCallback, IAgentRuntime, Memory, parseJSONObjectFromText, State, stringToUuid, UUID } from "@elizaos/core";
import { Database } from "../db";

// this is a system action that should only be used by the system or the agent itself
// the chat room should be the agent's room
export const notifyAction: Action = {
    name: "NOTIFY_EVENT",
    similes: ["REMIND_EVENT", "NOTIFY_USER"],
    description: "Notify the user about a scheduled event. This action should only be used by system or the agent itself.",
    validate: async (runtime: IAgentRuntime, _message: Memory) => {
        elizaLogger.log("Validating notify user request");
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
            elizaLogger.error("State is missing for notify user action");
            return false;
        }

        const roomId = stringToUuid( `self-message-${runtime.agentId}`);
        // check if the message is from the agent
        if (message.roomId !== roomId) {
            elizaLogger.error("Notify user action can only be performed by the agent");
            return false;
        }

        // extract event details from the message
        const extractionContext = `
        Extract the event details from the message, requested by the agent:

        MESSAGE:
        ${message.content.text}

        TASK:
        Identify the event ID from the message.

        Output in JSON format, wrapped in triple backticks:
        \`\`\`json
        {
            "eventId": "Event ID",
            "userId": "User ID"
        }
        \`\`\`
        `;
        const extractionResult = await generateText({
            runtime,
            context: extractionContext,
            modelClass: "small",
        });

        elizaLogger.log("Extraction result:", extractionResult);
        const eventDetails = parseJSONObjectFromText(extractionResult.trim());
        elizaLogger.log("Event details:", eventDetails);

        if (!eventDetails.eventId) {
            if (callback) {
                callback({
                    text: "I couldn't extract the event ID from the message. Please try again.",
                });
            }
            return false;
        }

        const db = new Database();
        const event = await db.instance
            .selectFrom('calendar_events')
            .selectAll()
            .where('id', '=', eventDetails.eventId)
            .executeTakeFirstOrThrow();

        if (!event) {
            elizaLogger.error("Event not found for notify user action");
            return false;
        }

        const notifyPromptTemplate = `
        About {{agentName}}:
        {{bio}}
        {{lore}}

        TASK: Generate a notification message for user, based on the event details:

        Event Name: ${event.name}
        Event Data: ${event.data}
        Scheduled At: ${event.scheduledAt}
        Current timezone: ${Intl.DateTimeFormat().resolvedOptions().timeZone}

        It's time to notify the user about the event. The notification should be sent to the user's room.
        Notification message should be user-friendly and informative.

        Output in JSON format, wrapped in triple backticks:
        \`\`\`json
        {
            "text": "Notification message"
        }
        \`\`\`
        `

        const notificationMessage = await generateText({
            runtime,
            context: notifyPromptTemplate,
            modelClass: "small",
        });

        elizaLogger.log("Notification message:", notificationMessage);
        const parsedNotificationMessage = parseJSONObjectFromText(notificationMessage.trim());

        await runtime.messageManager.createMemory({
            agentId: runtime.agentId,
            roomId: event.roomId as UUID || roomId,
            userId: eventDetails.userId,
            content: {
                text: parsedNotificationMessage.text,
                user: state.agentName,
                action: "NOTIFY_USER",
            },
        });

        if (callback) {
            callback({
                text: `Notification sent: ${notificationMessage}`,
            });
        }

        return true;
    },
    examples: [
        [
            {
                user: "{{agentName}}",
                content: {
                    text: "I will notify user with the event details. {{eventData}}",
                },
            },
            {
                user: "{{agentName}}",
                content: {
                    text: "Notification sent: Reminder: Meeting is scheduled at tomorrow 10 AM.",
                },
            },
        ],
    ],
};