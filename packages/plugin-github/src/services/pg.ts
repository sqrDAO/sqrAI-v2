// Import the required libraries
import pg from "pg";

export class PostgresSingleton {
    private static instance: PostgresSingleton;
    private pool: pg.Pool;

    // Private constructor to prevent direct instantiation
    private constructor() {
        this.pool = new pg.Pool({
            connectionString: process.env.POSTGRES_URL,
        });

        this.pool.on("error", (err) => {
            console.error("Unexpected error on idle PostgreSQL client:", err);
            process.exit(-1);
        });
    }

    // Static method to get the singleton instance
    public static getInstance(): PostgresSingleton {
        if (!PostgresSingleton.instance) {
            PostgresSingleton.instance = new PostgresSingleton();
        }
        return PostgresSingleton.instance;
    }

    // Method to get a database client
    public async getClient(): Promise<pg.PoolClient> {
        return await this.pool.connect();
    }

    // Method to query the database directly using the pool
    public async query(text: string, params?: any[]): Promise<any> {
        try {
            return await this.pool.query(text, params);
        } catch (error) {
            console.error("Error executing query:", error);
            throw error;
        }
    }

    // Close the pool
    public async close(): Promise<void> {
        await this.pool.end();
    }
}

// Export the singleton instance
export default PostgresSingleton;
