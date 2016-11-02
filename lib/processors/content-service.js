const request = require('superagent');
const config = require('../../config');
const URL = require('url');
const CONTENT_SERVICE_ENDPOINT = URL.resolve(config.content_service, 'v1/search/url');
const API_KEY = config.content_service_apikey;

const authHeaderBase64 = new Buffer(`apikey:${API_KEY}`)
  .toString('base64');
const authHeader = `Basic ${authHeaderBase64}`;

function getDataForUrl(url) {
  return new Promise((resolve, reject) => {
    request
      .post(CONTENT_SERVICE_ENDPOINT)
      .set('Authorization', authHeader)
      .set('Content-Type', 'application/json')
      .send([ url ])
      .end((err, res) => {
        if (err) {
          reject(err);
        } else {
          resolve(res.body[0] || {});
        }
      });
  });
}

module.exports = {
  getDataForUrl
};
