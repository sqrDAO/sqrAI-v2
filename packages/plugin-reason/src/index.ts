import { Plugin } from "@elizaos/core";
import { makePlanAction } from "./actions/make_plan";

export const reasonPlugin: Plugin = {
    name: "calendarPlugin",
    description: "Plugin for Calendar integration",
    actions: [makePlanAction],
    evaluators: [],
    providers: [],
};
