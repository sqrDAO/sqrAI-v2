import {
    Action,
    composeContext,
    elizaLogger,
    generateText,
    HandlerCallback,
    IAgentRuntime,
    IBullMQService,
    Memory,
    parseJSONObjectFromText,
    ServiceType,
    State,
} from "@elizaos/core";
import { z } from "zod";
import { v4 } from "uuid";
import cronParser from "cron-parser";
import { Database } from "../db";

const eventDetailsSchema = z.object({
    name: z.string(),
    data: z.any(),
    action: z.string(),
    cron: z.string().nullable(),
    scheduledAt: z.preprocess((val) => {
        if (typeof val === "string" || val instanceof String) {
            const date = new Date(val as string);
            if (!isNaN(date.getTime())) {
                return date;
            }
        }
        return val;
    }, z.date()),
    message: z.string().optional(),
});

export const setCalendarAction: Action = {
    name: "SET_CALENDAR",
    similes: ["ADD_EVENT", "CREATE_EVENT", "SCHEDULE_ACTION"],
    description:
        "Set a calendar event or schedule an action for the agent using cron scheduler.",
    validate: async (runtime: IAgentRuntime, _message: Memory) => {
        elizaLogger.log("Validating set calendar request");
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
        // Extract event details from the message
        if (!state) {
            elizaLogger.error("State is missing for set calendar action");
            return false;
        }

        // Use LLM to extract name, data, and action
        const extractionContext = composeContext({
            state,
            template: `
            Extract the name, data, and action of an event, requested by user from the following context:

            CONTEXT:
            {{recentMessages}}

            ACTIONS:
            {{actions}}

            TASK:
            Current time: ${new Date().toISOString()}
            Identify the event name, data, and action from the context.
            Should not return SET_CALENDAR action.
            Return the time in ISO format, but in the message, use user-friendly format.
            If the event is repeating, provide a cron expression. Otherwise, return a empty string.
            Data should contain additional information that are necessary to perform the action.
            Generate a message which will be sent to the user, acknowledging the event details.

            Output in JSON format, wrapped in triple backticks:
                \`\`\`json
                {
                    "name": "Event Name",
                    "data": "Event Data",
                    "scheduledAt": "schedule Time",
                    "cron": "Cron Expression",
                    "action": "Event Action",
                    "message": "Acknowledge Message"
                }
                \`\`\`
            `,
        });

        const extractionResult = await generateText({
            runtime,
            context: extractionContext,
            modelClass: "small",
        });

        elizaLogger.log("Extraction result:", extractionResult);
        const eventDetails = parseJSONObjectFromText(extractionResult.trim());
        elizaLogger.log("Event details:", eventDetails);

        // Validate event details using Zod
        const validation = eventDetailsSchema.safeParse(eventDetails);

        if (!validation.success) {
            if (callback) {
                callback({
                    text: `I couldn't extract the necessary details for the event.
                    Please provide the name, data, and action.
                    ${validation.error.message}
                    `,
                });
            }
            return false;
        }

        // validate the cron expression
        if (validation.data.cron) {
            try {
                cronParser.parseExpression(validation.data.cron);
            } catch (error) {
                elizaLogger.error("Error validating cron expression", error);
                if (callback) {
                    callback({
                        text: "I couldn't understand the required schedule. Please try again.",
                    });
                }
                return false;
            }
        }

        // Save event to the database
        const db = new Database();
        const id = v4();
        const event = await db.insertEvent({
            id,
            agentId: runtime.agentId,
            roomId: state?.roomId,
            userId: message.userId,
            name: validation.data.name,
            data: validation.data.data,
            cron: validation.data.cron,
            action: validation.data.action,
            scheduledAt: validation.data.scheduledAt,
            createdAt: new Date(),
        });

        const bullService = runtime.getService<IBullMQService>(
            ServiceType.BULL_MQ
        );
        if (!bullService) {
            throw new Error("BullMQ service not found");
        }

        if (event.action === "SET_CALENDAR") {
            // create a job that run the event action at the scheduled time
            // this is supposed to send a message to the user
        } else {
            // create a job that run the event action at the scheduled time
            await bullService.createJob(
                "schedule_default",
                `calendar-${event.id}`,
                {
                    eventId: event.id,
                    text: `I will use the action ${event.action} with the following data: ${JSON.stringify(event)}`,
                    agentId: runtime.agentId,
                    data: event.data,
                    event: event,
                },
                {
                    jobId: event.id,
                    repeat: validation.data.cron
                        ? { pattern: validation.data.cron }
                        : undefined,
                    delay: !validation.data.cron
                        ? validation.data.scheduledAt.getTime() - Date.now()
                        : undefined,
                    removeOnComplete: true,
                    removeOnFail: {
                        age: 60 * 60 * 24,
                    },
                }
            );
        }

        if (callback) {
            callback({
                text:
                    validation.data.message ||
                    `Understood. I will ${validation.data.name} at ${validation.data.scheduledAt}.`,
            });
        }

        return true;
    },
    examples: [
        [
            {
                user: "{{user1}}",
                content: {
                    text: "Schedule a twitter post for tomorrow at 10 AM UTC+7.",
                },
            },
            {
                user: "{{agentName}}",
                content: {
                    text: "Understood. I will schedule a twitter post for tomorrow at 10 AM UTC+7.",
                    action: "SET_CALENDAR",
                },
            },
        ],
        [
            {
                user: "{{user1}}",
                content: {
                    text: "Schedule a meeting with the team tomorrow at 10 AM UTC+7.",
                },
            },
            {
                user: "{{agentName}}",
                content: {
                    text: "Understood. I will notify you five minutes before the event.",
                    action: "SET_CALENDAR",
                },
            },
        ],
        [
            {
                user: "{{user1}}",
                content: {
                    text: "Add a doctor's appointment on Friday at 3 PM.",
                },
            },
            {
                user: "{{agentName}}",
                content: {
                    text: "Understood. I will remind you about the appointment at Friday 3PM.",
                    action: "SET_CALENDAR",
                },
            },
        ],
        [
            {
                user: "{{user1}}",
                content: {
                    text: "Create an event for the project deadline next Monday.",
                },
            },
            {
                user: "{{agentName}}",
                content: {
                    text: "Understood. I will do the project deadline next Monday.",
                    action: "SET_CALENDAR",
                },
            },
        ],
    ],
};
