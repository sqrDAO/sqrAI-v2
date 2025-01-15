import {
    Job,
    JobsOptions,
    Queue,
    QueueOptions,
    Worker,
    RepeatOptions,
    JobSchedulerTemplateOptions,
} from "bullmq";
import { Service, ServiceType } from "@elizaos/core";

export class BullService extends Service {
    private redisURL: string = "";
    static serviceType: ServiceType = ServiceType.VIDEO;
    listQueues: { [queueName: string]: Queue } = {};
    currentQueueNames: string[] = ["schedule_queue"];

    queueOptions: QueueOptions = {
        connection: {
            url: process.env.REDIS_URL,
        },
        prefix: "eliza",
    };
    async initialize(): Promise<void> {
        console.log("Initializing BullService");
        this.redisURL = process.env.REDIS_URL;
        if (this.redisURL === "") {
            throw new Error("REDIS_URL is required");
        }
        await this.createQueue("schedule_default");

        new Worker(
            "schedule_default",
            async (job: Job) => {
                const body = JSON.stringify({
                    roomId: `self-message-${job.data.agentId}`,
                    text: job.data.text,
                    userId: job.data.agentId,
                    event: job.data.event,
                });
                console.log(
                    `Self sending message to agent ${job.data.agentId}`
                );
                await fetch(
                    `http://localhost:3000/${job.data.agentId}/action-message`,
                    {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                        },
                        body,
                    }
                );
            },
            this.queueOptions
        );
    }

    getInstance(): BullService {
        return BullService.getInstance();
    }

    public async createQueue(queueName: string): Promise<void> {
        console.log(`Creating queue ${queueName}`);
        if (this.listQueues[queueName]) {
            return;
        }
        this.listQueues[queueName] = new Queue(queueName, this.queueOptions);
    }

    public async createJob(
        queueName: string,
        jobName: string,
        data: any,
        opts: JobsOptions
    ): Promise<Job> {
        const queue = this.listQueues[queueName];
        if (!queue) {
            throw new Error(`Queue ${queueName} not found`);
        }
        console.log(`Creating job ${jobName} in queue ${queueName}`);
        return await queue.add(jobName, data, opts);
    }

    public async upsertJobScheduler(
        jobSchedulerId: string,
        opts: Omit<RepeatOptions, "key">,
        jobTemplate?: {
            name?: string;
            data?: any;
            opts?: JobSchedulerTemplateOptions;
        }
    ): Promise<Job> {
        const queue = this.listQueues[jobSchedulerId];
        if (!queue) {
            throw new Error(`Queue ${jobSchedulerId} not found`);
        }
        return await queue.upsertJobScheduler(
            jobSchedulerId,
            opts,
            jobTemplate
        );
    }

    public getQueueOptions(): QueueOptions {
        return this.queueOptions;
    }
}
