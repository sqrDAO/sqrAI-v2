import {
    Action,
    elizaLogger,
    embed,
    generateText,
    HandlerCallback,
    IAgentRuntime,
    IBullMQService,
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
export const firecrawlAction: Action = {
    name: "FIRE_CRAWL",
    similes: ["crawl website", "scrape web", "fetch web"],
    description: "Crawl a website",
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
        const urls = extractUrls(message.content.text);
        if (urls.length === 0) {
            elizaLogger.error("No URLs found in the message");
            await callback({ text: "No URLs found in the message" });
            return;
        }
        elizaLogger.log("URLs found in the message: ", urls);
        const firecrawlApp = Firecrawl.getInstance();
        const id = await firecrawlApp.asyncCrawlUrl(urls[0], {
            limit: 1,
            scrapeOptions: {
                formats: ["markdown", "html", "links"],
                onlyMainContent: true,
            },
        });
        if (id.success === false) {
            await callback({ text: "Crawl failed" });
            return;
        }

        const bullService = runtime.getService<IBullMQService>(
            ServiceType.BULL_MQ
        );
        if (!bullService) {
            throw new Error("BullMQ service not found");
        }
        await bullService.createQueue("firecrawl");

        const memory: Memory = {
            id: id.id as UUID,
            userId: message.userId,
            agentId: runtime.agentId,
            roomId: message.roomId,
            content: {
                text: "",
                firecrawlId: id.id,
                website: urls[0],
            },
            embedding: null,
        };
        const existing = await runtime.documentsManager.getMemoryById(
            memory.id
        );
        if (existing) {
            elizaLogger.log(
                `Already processed message ${message.id}, skipping`
            );
            return;
        }

        await bullService.createJob(
            "firecrawl",
            `firecrawl-${id.id}`,
            {
                id: id.id,
                website: urls[0],
            },
            {
                removeOnComplete: false,
                removeOnFail: false,
                attempts: 100,
                backoff: 30000,
            }
        );

        const worker = new Worker(
            "firecrawl",
            async (job: Job) => {
                const firecrawlApp = Firecrawl.getInstance();
                const id = job.data.id;
                const website = job.data.website;
                elizaLogger.log("check status with crawl ID: ", id);
                const currentStatus = await firecrawlApp.checkCrawlStatus(id);
                elizaLogger.log("Crawl status: ", currentStatus);
                if (currentStatus.success) {
                    if (currentStatus.status === "scraping") {
                        throw new Error("Crawl is still in progress");
                    }
                    elizaLogger.log("Crawl completed successfully");

                    // create document after crawl success
                    await runtime.documentsManager.createMemory({
                        ...memory,
                        content: {
                            text: (currentStatus as CrawlStatusResponse).data[0]
                                .markdown,
                        },
                    });

                    const responseSummarizing = await summaryWebsiteContent(
                        runtime,
                        currentStatus
                    );

                    // create knowledge
                    memory.content.text = JSON.stringify({
                        firecrawlId: id,
                        website: website,
                        summary: responseSummarizing,
                        crawledAt: new Date(),
                    });
                    memory.content.source = memory.id;
                    const embedRes = await embed(runtime, memory.content.text);
                    memory.embedding = embedRes;
                    await runtime.knowledgeManager.createMemory({
                        ...memory,
                        id: stringToUuid(memory.id + "summary"),
                        embedding: embedRes,
                    });

                    // create an message to tell user job completed
                    await runtime.messageManager.createMemory({
                        agentId: runtime.agentId as UUID,
                        userId: runtime.agentId as UUID,
                        roomId: message.roomId as UUID,
                        content: {
                            text: `Crawl website ${website} done, now you can summarize it`,
                            user: _state.agentName,
                        },
                    });
                } else {
                    throw new Error("Crawl failed");
                }
            },
            BullService.getInstance<IBullMQService>().getQueueOptions()
        );

        worker.on("completed", (job: Job) => {
            elizaLogger.log(`Job ${job.id} completed`);
        });

        worker.on("failed", (job: Job, error: Error) => {
            elizaLogger.error(
                `Job ${job.id} failed with error: ${error.message}`
            );
        });

        // let responseCrawl: any;
        elizaLogger.log("Crawl initiated successfully");
        elizaLogger.log("Crawl ID: ", id.id);
        return await callback({
            text: `Crawl initiated successfully , id is ${id.id}`,
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
