const express = require('express');

const router = express.Router();

router.get('/health', (req, res) => {
  res.json({
    ollama: true,
    qdrant: true,
    mode: 'demo'
  });
});

module.exports = router;
