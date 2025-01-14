import { Kysely, Generated, PostgresDialect, Selectable, Insertable, Updateable } from 'kysely';
import pg from 'pg';

export interface CalendarTable {
    id: Generated<string>;
    agentId: string;
    roomId?: string;
    userId?: string;
    name: string;
    data: string;
    action: string;
    cron?: string;
    scheduledAt?: Date;
    createdAt: Date;
}

export type CalendarEvent = Selectable<CalendarTable>;
export type NewCalendarEvent = Insertable<CalendarTable>;
export type CalenderEventUpdate = Updateable<CalendarTable>;

export interface IDatabase {
    calendar_events: CalendarTable;
}

export class Database {
    public instance: Kysely<IDatabase>;

    constructor() {
        const pool = new pg.Pool({
            connectionString: process.env.POSTGRES_URL,
        });

        this.instance = new Kysely<IDatabase>({
            dialect: new PostgresDialect({ pool }),
        });
    }

    async insertEvent(event: NewCalendarEvent): Promise<CalendarEvent> {
        return await this.instance.insertInto('calendar_events')
            .values(event)
            .returningAll()
            .executeTakeFirstOrThrow();
    }
}
