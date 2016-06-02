'use strict';

const Graphite = require('graphite');
const Measured = require('measured');

const REPORT_INTERVAL = 5000;
const GRAPHITE_HOST = process.env.GRAPHITE_HOST || null;
const GRAPHITE_PORT = process.env.GRAPHITE_PORT || 2003;
const ENVIRONMENT_NAME = 'test';
const METRICS_NAMESPACE = process.env.GRAPHITE_NAMESPACE || 'mozilla.magnet';

const data = Measured.createCollection([METRICS_NAMESPACE, ENVIRONMENT_NAME].join('.'));

const failures = data.counter('graphiteReportingFailures');

data.gauge('memory', () => process.memoryUsage().rss);

if (GRAPHITE_HOST) {
  const graphite = Graphite.createClient(`plaintext://${GRAPHITE_HOST}:${GRAPHITE_PORT}`);

  const reportTimer = setInterval(() => {
    graphite.write(data.toJSON(), (err) => {
      if (err) {
        if (err.code === 'ETIMEDOUT' || err.code === 'EPIPE') {
          failures.inc();
        }

        console.error('Failed to write report to graphite - disabling...');
        console.error(err, err.stack);
        clearInterval(reportTimer);
      }
    });
  }, REPORT_INTERVAL);

  reportTimer.unref();
} else {
  console.warn('Graphite reporting disabled');
}

module.exports = data;
