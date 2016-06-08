
/**
 * Dependencies
 */

const express = require('express');
const config = require('./config');
const morgan = require('morgan');

const app = express();
if (config.enable_cors) {
  app.use(function(req, res, next) {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    next();
  });
}

module.exports = app
  .use(morgan('combined'))
  .use('/api/v1/', require('./lib/routes/api'))
  // compatibility for google's physical-web schema
  .post(/^\/resolve-scan$/, (req, res) => res.redirect('/api/v1/metadata'))
  .use('/', require('./lib/routes/frontend'));
