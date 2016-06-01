
/**
 * Dependencies
 */

const checkBody = require('../middleware/check-body');
const bodyParser = require('body-parser');
const metadata = require('./metadata');
const express = require('express');

/**
 * Sub-app to handle `api/` routes
 *
 * @type {Object}
 */
const app = module.exports = express();

app.use(bodyParser.json());
app.use(require('../middleware/validate-post'));

app.post(/^\/metadata(\/)?$/, checkBody, metadata);
app.post(/^\/metadata\/raw(\/)?$/, checkBody, metadata);

// Since we don't have caching system yet, this is a mock.
app.post(/^\/metadata\/refresh$/, function(req, res) {
  res.json({});
});

// this route is hit when any of the
// above routes call next(new Error('...'))
app.use(function(err, req, res, next) {
  if (err) {
    // Prioritize the error status code
    if (err.statusCode) {
      res.status(err.statusCode);
    } else if (res.statusCode && (res.statusCode !== 200)) {
      res.status(res.statusCode);
    } else {
      res.status(500);
    }

    res.send(err.message || err);
  }
});
