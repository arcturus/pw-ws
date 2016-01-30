const fetch = require('node-fetch');
const parser = require('./parser.js');
const jsdom = require('jsdom').jsdom;
const config = require('../config.js');

const levelup = require('levelup');
const db = levelup(config.db_file, { valueEncoding: 'json' });

/**
 * Wrapper around the function fetchAndParse that adds
 * two methods for pre and post processing
 */
function process(url) {
  return preProcess(url).then((preResult) => {
    if (preResult) {
      return Promise.resolve(preResult);
    }

    return fetchAndParse(url);
  }).then((metadata) => {
    return postProcess(url, metadata).then((result) => {
      return Promise.resolve(result);
    });
  });
}

function preProcess(url) {
  return new Promise((resolve) => {
    db.get(url, (err, value) => {
      if (err || !value) {
        resolve(null);
      } else {
        resolve(value);
      }
    })
  });
}

function postProcess(url, data) {
  if (!data || data === {}) {
    return Promise.resolve(data);
  }
  return new Promise((resolve) => {
    db.put(url, data, (err) => {
      resolve(data);
    });
  });
}

/**
 * Given a url string, fetch the contents and tryies to build a jsdom
 * object with the result to send it to the parsing module.
 */
function fetchAndParse(url) {
  var finalUrl = url;
  return fetch(url, {
    timeout: config.fetch_timeout || 3000
  }).then((res) => {
    if (res.status !== 200) {
      return null;
    }

    // After following redirections keep the final url
    if (res.url !== finalUrl) {
      finalUrl = res.url;
    }

    return new Promise((resolve) => {
      res.text().then((dom) => {
        var doc = jsdom(dom, {
          'userAgent': 'Gecko Like ;)'
        });
        resolve(doc);
      });
    });
  }).then((doc) => {
    return parser.parse(finalUrl, doc);
  }).catch((err) => {
    console.info('Error parsing url ', url, ':: ', err);
  });
}

function refresh(url) {
  return Promise.resolve(true);
}

module.exports = {
  process,
  refresh
};
