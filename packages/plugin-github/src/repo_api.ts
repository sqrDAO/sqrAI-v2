import express from 'express';
import { getAllRepositories } from './utils';

const router = express.Router();

router.get('/repos', async (req, res) => {
  try {
    const repositories = await getAllRepositories();
    res.json(repositories);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch repositories' });
  }
});

export default router;
