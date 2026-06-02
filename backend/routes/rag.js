const requireDep = require('../require-dep');
const express = requireDep('express');

const router = express.Router();

router.get('/health', (req, res) => {
  res.json({
    ollama: true,
    qdrant: true,
    mode: 'demo'
  });
});

module.exports = router;
