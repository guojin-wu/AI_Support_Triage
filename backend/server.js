const path = require('path');
require('dotenv').config();
const express = require('express');
const cors = require('cors');

const authRoutes = require('./routes/auth');
const apiRoutes = require('./routes/api');
const ragRoutes = require('./routes/rag');

const app = express();
const PORT = process.env.PORT || 3001;
const frontendDir = path.join(__dirname, '../frontend');

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(frontendDir));

app.use('/auth', authRoutes);
app.use('/api', apiRoutes);
app.use('/rag', ragRoutes);

app.get('/', (req, res) => {
  res.sendFile(path.join(frontendDir, 'index.html'));
});

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    project: 'ai-workflow-rebuild',
    timestamp: new Date().toISOString()
  });
});

app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.listen(PORT, () => {
  console.log(`AI Workflow Rebuild running on http://localhost:${PORT}`);
});

module.exports = app;
