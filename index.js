
/**
 * Dependencies
 */

const config = require('./config');
const app = require('./app');

// Enable metrics
require('./lib/utils/metrics');

// start listening
const port = process.env.PORT || config.port;
const address = process.env.ADDRESS || config.address || '';
const server = app.listen(port, address, () => {
  const host = server.address().address;
  const port = server.address().port;
  console.log(`magnet service listening at http://${host}:${port}`); // eslint-disable-line no-console
});
