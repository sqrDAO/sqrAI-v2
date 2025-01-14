import { BullService } from "./services/bullmq";
import { Plugin } from "@elizaos/core";
// import { ggScheduleAction } from "./actions/ggSchedule";
export { BullService };

export const BullMQPlugin: Plugin = {
    name: "bullmqPlugin",
    description: "BullMQ plugin",
    actions: [],
    services: [new BullService()],
};
