import express from 'express';
import { Database } from './db';
import { z } from 'zod';
import { stringToUuid } from '@elizaos/core';

const router: express.Router = express.Router();
const db = new Database();

const eventQuerySchema = z.object({
    userId: z.string(),
    agentId: z.string(),
});

router.get('/events', async (req, res) => {
    const { success, data } = eventQuerySchema.safeParse(req.query);
    if (!success) {
        return res.status(400).send('Invalid query parameters');
    }
    let { userId, agentId } = data;

    if (!userId || !agentId) {
        return res.status(400).send('Missing userId or agentId');
    }

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

    if (!uuidRegex.test(userId)) {
      userId = stringToUuid(userId);
    }

    if (!uuidRegex.test(agentId)) {
      agentId = stringToUuid(agentId);
    }

    try {
        const events = await db.instance.selectFrom('calendar_events')
            .selectAll()
            .where('userId', '=', userId)
            .where('agentId', '=', agentId)
            .orderBy('scheduledAt', 'asc')
            .execute();
        res.json(events);
    } catch (error) {
        console.error(error);
        res.status(500).send('Internal Server Error');
    }
});

export default router;
