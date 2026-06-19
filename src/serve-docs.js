'use strict';

/**
 * Servidor estático simples para pré-visualizar o build do GitHub Pages
 * (pasta docs/) localmente, exatamente como ficará publicado.
 *   node src/build-static.js   # gera docs/
 *   node src/serve-docs.js     # serve em http://localhost:3001
 */

const path = require('path');
const express = require('express');

const app = express();
app.use(express.static(path.join(__dirname, '..', 'docs')));

const port = process.env.PORT || 3001;
app.listen(port, () => {
  console.log(`Preview do GitHub Pages em http://localhost:${port}`);
});
