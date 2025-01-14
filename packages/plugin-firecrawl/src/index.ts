import { Plugin } from "@elizaos/core";
import { firecrawlAction } from "./actions/firecrawl";
import { summarizeCrawledWebsite } from "./actions/summarize";

export const firecrawlPlugin: Plugin = {
    name: "fireCrawlPlugin",
    description: "Firecrawl plugin",
    actions: [firecrawlAction, summarizeCrawledWebsite],
    services: [],
};
