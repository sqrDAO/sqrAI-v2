import {
    Action,
    AgentRuntime,
    elizaLogger,
    embed,
    generateText,
    HandlerCallback,
    IAgentRuntime,
    IBullMQService,
    knowledge,
    KnowledgeItem,
    Memory,
    ServiceType,
    State,
    stringToUuid,
    UUID,
} from "@elizaos/core";
import { Firecrawl } from "../services/firecrawl";
import { BullService } from "@sqrdao/plugin-bullmq";
import { Job, Worker } from "bullmq";
import { CrawlStatusResponse } from "@mendable/firecrawl-js";

const agentById: Record<string, IAgentRuntime> = {};

const worker = new Worker(
    "firecrawl",
    async (job: Job) => {
        const website = job.data.website;
        const roomId = job.data.roomId;
        const agentName = job.data.agentName;
        const firecrawlApp = Firecrawl.getInstance();
        const runtime = agentById[job.data.agentId];

        if (!job.data.firecrawlId) {
            const response = await firecrawlApp.asyncCrawlUrl(website, {
                limit: 1,
                scrapeOptions: {
                    formats: ["markdown", "html", "links"],
                    onlyMainContent: true,
                },
            });

            if (response.success === false) {
                throw Error("Crawl failed");
            }

            await job.updateData({
                ...job.data,
                firecrawlId: response.id,
            });
        }

        const id = job.data.firecrawlId;
        if (!id) throw new Error("Firecrawl ID not ready");

        elizaLogger.log("check status with crawl ID: ", id);
        const currentStatus = await firecrawlApp.checkCrawlStatus(id);
        elizaLogger.log("Crawl status: ", currentStatus);
        if (currentStatus.success) {
            if (currentStatus.status === "scraping") {
                throw new Error("Crawl is still in progress");
            }
            elizaLogger.log("Crawl completed successfully");

            const responseSummarizing = await summaryWebsiteContent(
                runtime,
                currentStatus
            );
            let knowledgeItem: KnowledgeItem = null;
            if (process.env.FIRECRAWL_SAVE_KNOWLEDGE_MODE === "summary") {
                knowledgeItem = {
                    id,
                    content: {
                        text: `Summary of the website ${website}: ${responseSummarizing}`,
                    },
                };
            } else {
                knowledgeItem = {
                    id,
                    content: {
                        text: `Source markdown of website ${website}:
    ${currentStatus.data[0].markdown}
    Metadata of website ${website}:
    ${currentStatus.data[0].metadata}
    Summary of the website ${website}:
    ${responseSummarizing}`,
                        source: website,
                    },
                };
            }

            // create knowledge
            if (knowledgeItem) {
                await knowledge.set(runtime as AgentRuntime, knowledgeItem);
            }

            // create an message to tell user job completed
            await runtime.messageManager.createMemory({
                agentId: runtime.agentId,
                userId: runtime.agentId,
                roomId: roomId,
                content: {
                    text: `Crawl website ${website} done, now you can summarize it`,
                    user: agentName,
                },
            });
        } else {
            throw new Error("Crawl failed");
        }
    },
    {
        ...BullService.getInstance<IBullMQService>().getQueueOptions(),
        autorun: false,
    }
);

worker.on("completed", (job: Job) => {
    elizaLogger.log(`Job ${job.id} completed`);
});

worker.on("failed", (job: Job, error: Error) => {
    elizaLogger.error(`Job ${job.id} failed with error: ${error.message}`);
});

export const crawlWebAction: Action = {
    name: "CRAWL_WEB",
    similes: ["crawl website", "scrape web", "fetch web"],
    description: "Crawl a website, only support 1 website",
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
        agentById[runtime.agentId] = runtime;
        if (worker.isRunning() === false) {
            worker.run();
        }

        elizaLogger.log("curent content: ", message.content.text);
        const urls = extractUrls(message.content.text);
        elizaLogger.log("urls after extract: ", urls);
        if (urls.length === 0) {
            elizaLogger.error("No URLs found in the message");
            await callback({ text: "No URLs found in the message" });
            return;
        }
        elizaLogger.log("URLs found in the message: ", urls);

        const bullService = runtime.getService<IBullMQService>(
            ServiceType.BULL_MQ
        );
        if (!bullService) {
            throw new Error("BullMQ service not found");
        }
        await bullService.createQueue("firecrawl");

        const idWeb = stringToUuid(urls[0]);
        await bullService.createJob(
            "firecrawl",
            idWeb,
            {
                id: idWeb,
                website: urls[0],
                roomId: message.roomId,
                agentName: _state.agentName,
                agentId: _state.agentId,
            },
            {
                removeOnComplete: false,
                removeOnFail: false,
                attempts: 100,
                backoff: 30000,
            }
        );

        // let responseCrawl: any;
        elizaLogger.log("Crawl initiated successfully");
        return await callback({
            text: `Crawl ${urls[0]} initiated successfully. I will tell you when it done`,
        });
    },
    examples: [],
};

async function summaryWebsiteContent(runtime: IAgentRuntime, currentStatus) {
    const contextTemplate = `You are a helpful assistant capable of analyzing raw HTML documents and summarizing their content. I will provide you with raw HTML code from a website. Please do the following:

Extract the visible text content from the HTML while ignoring code, metadata, and scripts.
Summarize what the website is saying in clear and concise language.
If the content appears to have a specific topic, provide the main idea or purpose of the website.
Extract contact information, such as email addresses, twitter, github, contract address, ... if available.
Keep the content short, under 200 words.
Here is the raw HTML:

${JSON.stringify((currentStatus as CrawlStatusResponse).data[0].markdown)}

Please return a summary of the website content as markdown format.
---
`;
    const responseLLM = await generateText({
        runtime,
        context: contextTemplate,
        modelClass: "large",
    });

    return responseLLM;
}

function extractUrls(context) {
    // Regex to capture URLs with or without http/https
    const urlPattern =
        /\b((https?:\/\/)?(www\.)?[a-zA-Z0-9-]+\.[a-zA-Z]{2,}(\S*)?)\b/g;

    // Find matches
    const matches = context.match(urlPattern);

    // Normalize to include "http://" if missing
    return matches
        ? matches.map((url) => (url.startsWith("http") ? url : `http://${url}`))
        : [];
}
