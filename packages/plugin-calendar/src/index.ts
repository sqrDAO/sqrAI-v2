import { Plugin } from "@elizaos/core";
import { setCalendarAction } from "./actions/set_calendar";
import { notifyAction } from "./actions/notify";
import api from "./api";

export const calendarApiRouter = api;

export const calendarPlugin: Plugin = {
    name: "calendarPlugin",
    description: "Plugin for Calendar integration",
    actions: [setCalendarAction, notifyAction],
    evaluators: [],
    providers: [],
};
