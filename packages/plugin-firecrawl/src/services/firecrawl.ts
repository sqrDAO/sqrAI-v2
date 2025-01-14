import FirecrawlApp, {
    CrawlParams,
    CrawlResponse,
    CrawlStatusResponse,
    ErrorResponse,
} from "@mendable/firecrawl-js";

export class Firecrawl {
    private static instance: Firecrawl;
    private firecrawlApp: FirecrawlApp;
    private constructor() {
        this.firecrawlApp = new FirecrawlApp({
            apiKey: process.env.FIRECRAWL_API_KEY,
        });
    }

    public static getInstance(): Firecrawl {
        if (!Firecrawl.instance) {
            Firecrawl.instance = new Firecrawl();
        }
        return Firecrawl.instance;
    }

    public async asyncCrawlUrl(
        url: string,
        params?: CrawlParams
    ): Promise<ErrorResponse | CrawlResponse> {
        const response = await this.firecrawlApp.asyncCrawlUrl(url, params);
        return response;
    }

    public async checkCrawlStatus(
        id: string
    ): Promise<CrawlStatusResponse | ErrorResponse> {
        const response = await this.firecrawlApp.checkCrawlStatus(id);
        return response;
    }
}
