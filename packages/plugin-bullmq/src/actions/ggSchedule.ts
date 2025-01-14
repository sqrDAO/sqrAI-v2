import {
    Action,
    elizaLogger,
    HandlerCallback,
    IAgentRuntime,
    IBullMQService,
    Memory,
    State,
} from "@elizaos/core";
import { Job, Worker } from "bullmq";
import { BullService } from "../services/bullmq";

const worker = new Worker(
    "gg_schedule",
    async (job: Job) => {
        await job.updateProgress(0);
        await job.updateProgress(100);
    },
    BullService.getInstance<IBullMQService>().getQueueOptions()
);

worker.on("progress", (job: Job, progress: number) => {
    elizaLogger.log(`Job ${job.id} is ${progress}% done`);
});

export const ggScheduleAction: Action = {
    name: "GG_SCHEDULE",
    similes: ["schedule", "plan", "book"],
    description: "Schedule a meeting or event",
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
        try {
            const bullService = runtime.getService<IBullMQService>(
                BullService.serviceType
            );
            if (!bullService) {
                throw new Error("BullMQ service not found");
            }
            await bullService.createQueue("gg_schedule");
            // use for repeatable jobs
            // await bullService.upsertJobScheduler(
            //     "gg_schedule",
            //     {
            //         every: 1000,
            //     },
            //     {
            //         name: "my-job-name",
            //         data: { foo: "bar" },
            //         opts: {
            //             backoff: 3,
            //             attempts: 5,
            //             removeOnFail: 1000,
            //         },
            //     }
            // );
            await bullService.createJob("gg_schedule", "gg_schedule", {}, {});
            await (BullService.getInstance() as BullService).createQueue(
                "gg_schedule"
            );
            callback({
                text: "Meeting scheduled successfully",
            });
        } catch (error) {
            elizaLogger.error("Error scheduling meeting", error);
            callback({
                text: "Error scheduling meeting" + error,
            });
        }
    },
    examples: [],
};
