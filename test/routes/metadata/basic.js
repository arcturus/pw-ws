'use strict';

/**
 * Dependencies
 */

const parseHtml = require('magnet-html-parser');
const app = require('../../../lib/routes/api');
const cache = require('../../../lib/routes/api/metadata').cache;
const supertest = require('supertest');
const assert = require('assert');
const sinon = require('sinon');
const nock = require('nock');

const testRequestBody = {
  objects: [
    { url: 'https://mozilla.org/' },
    { url: 'http://facebook.com/' }
  ]
};

/**
 * Tests
 */

describe('basic parsing', () => {
  beforeEach(function() {
    this.sandbox = sinon.sandbox.create();
  });

  afterEach(function() {
    this.sandbox.restore();
    nock.cleanAll();
    cache.clear();
  });

  it('should give us compatible output with Google PW service', function(done) {
    const requestBody = {
      objects: [{ url: 'https://mozilla.org/' }]
    };

    // mock response
    nock('https://mozilla.org')
      .get('/')
      .reply(200, '<title>mozilla</title><meta name="description" content="desc"/>');

    supertest(app)
      .post('/metadata/')
      .send(requestBody)
      .expect(200)
      .end((err, res) => {
        if (err) {
          throw err;
        }
        assert.equal(res.body.length, 1);
        const result = res.body[0];

        [
          'id',
          'url',
          'displayUrl',
          'title',
          'description'
        ].forEach(field => assert.ok(result[field]));

        assert.equal(result.id, result.url);
        assert.equal(result.id, result.displayUrl);
        done();
      });
  });

  it('should give information of several sites at once', (done) => {
    const requestBody = {
      objects: [
        { url: 'https://mozilla.org/' },
        { url: 'http://facebook.com/' }
      ]
    };

    // mock response
    nock('https://mozilla.org')
      .get('/')
      .reply(200, '<title>mozilla</title>');

    // mock response
    nock('http://facebook.com')
      .get('/')
      .reply(200, '<title>facebook</title>');

    supertest(app)
      .post('/metadata')
      .send(requestBody)
      .expect(200)
      .end((err, res) => {
        if (err) {
          throw err;
        }

        assert.equal(res.body.length, 2);
        assert.equal(res.body[0].title, 'mozilla');
        assert.equal(res.body[1].title, 'facebook');
        done();
      });
  });

  describe('no parsable content', function() {
    it('errors if a title or html embed can not be found', function(done) {
      const requestBody = {
        objects: [{ url: 'https://mozilla.org/' }]
      };

      // mock response
      nock('https://mozilla.org')
        .get('/')
        .reply(200, 'unparsable jibberish');

      supertest(app)
        .post('/metadata')
        .send(requestBody)
        .end((err, res) => {
          if (err) {
            throw err;
          }

          assert.ok(res.body[0].error);
          assert.equal(res.body[0].error, 'empty');
          done();
        });
    });

    it('doesn\'t error if a title is found, but without html content', function(done) {
      const requestBody = {
        objects: [{ url: 'https://mozilla.org/' }]
      };

      // mock response
      nock('https://mozilla.org')
        .get('/')
        .reply(200, '<title>Hello World</title>');

      supertest(app)
        .post('/metadata')
        .send(requestBody)
        .end((err, res) => {
          if (err) {
            throw err;
          }

          assert.ok(!res.body[0].error);
          assert.equal('Hello World', res.body[0].title);
          done();
        });
    });

    it('doesn\'t error if an embed is found, but title is missing', function(done) {
      const requestBody = {
        objects: [{ url: 'https://mozilla.org/' }]
      };

      nock('https://mozilla.org')
        .get('/mockoembed.json')
        .reply(200, JSON.stringify({type: 'video', html: '<img src="" />' }));

      // mock response
      nock('https://mozilla.org')
        .get('/')
        .reply(200, '<link type="application/json+oembed" href="https://mozilla.org/mockoembed.json" />');

      supertest(app)
        .post('/metadata')
        .send(requestBody)
        .end((err, res) => {
          if (err) {
            throw err;
          }

          assert.ok(!res.body[0].error);
          assert.equal('<img src="" />', res.body[0].embed.html);
          done();
        });
    });

  });

  it('should unwrap shorted urls', function(done) {
    const endUrl = 'https://francisco.com';
    const sites = {
      objects: [{ url: 'http://bit.ly/1Q3Pb6u' }]
    };

    // redirect
    nock('http://bit.ly')
      .get('/1Q3Pb6u')
      .reply(301, 'CONTENT', {
        'Location': 'https://francisco.com',
        'Content-Type': 'text/html; charset=utf-8'
      });

    // final response
    nock('https://francisco.com')
      .get('/')
      .reply(200, '<title>Francisco</title>', {
        'Content-Type': 'text/html; charset=utf-8'
      });

    supertest(app)
      .post('/metadata')
      .send(sites)
      .expect(200)
      .end((err, res) => {
        if (err) {
          throw err;
        }

        assert.equal(res.body.length, 1);
        assert.equal(res.body[0].url, endUrl);
        done();
      });
  });

  it('protects against too many redirects', function(done) {
    const url = 'http://bit.ly/1Q3Pb6u';
    const MAX_REDIRECTS = 5;
    const sites = {
      objects: [{ url: url }]
    };

    nock(url)
      .get(/./)
      .times(MAX_REDIRECTS + 1)
      .reply(301, 'CONTENT', {
        'Location': url, // << recursive
        'Content-Type': 'text/html; charset=utf-8'
      });

    supertest(app)
      .post('/metadata')
      .send(sites)
      .expect(200)
      .end((err, res) => {
        if (err) {
          throw err;
        }

        assert.equal(res.body[0].error, 'max redirects reached');
        done();
      });
  });

  describe('404', function() {
    beforeEach(function(done) {

      // mock response
      nock('https://mozilla.org')
        .get('/')
        .reply(200, '<title>mozilla</title>');

      // mock response
      nock('http://facebook.com')
        .get('/')
        .reply(404, 'error message');

      supertest(app)
        .post('/metadata/')
        .send(testRequestBody)
        .end((err, res) => {
          this.res = res;
          done();
        });
    });

    it('returns an error for the 404 result', function() {
      const results = this.res.body;
      assert.equal(results[0].title, 'mozilla');
      assert.ok(results[1].error.indexOf('404') > -1);
    });
  });

  describe('undefined urls', function() {
    beforeEach(function(done) {
      const body = {
        objects: [{ url: '' }]
      };

      supertest(app)
        .post('/metadata/')
        .send(body)
        .end((err, res) => {
          this.res = res;
          done();
        });
    });

    it('returns an error when `url` is undefined', function() {
      assert.equal(this.res.body[0].error, 'url undefined');
    });
  });

  it('does not 500 if one url errors', function(done) {
    this.sandbox.stub(parseHtml, 'parse');
    parseHtml.parse.returns(Promise.resolve({}));

    nock('https://twitter.com')
      .get('/mepartoconmigo')
      .reply(200, 'CONTENT', {
        'Content-Type': 'text/html; charset=utf-8'
      });

    nock('https://fakecalendar.com')
      .get('/')
      .reply(200, 'CONTENT', {
        'Content-Type': 'text/calendar; charset=utf-8'
      });

    const requestBody = {
      objects: [
        { url: 'https://twitter.com/mepartoconmigo' },
        { url: 'https://fakecalendar.com/' }
      ]
    };

    supertest(app)
      .post('/metadata/')
      .send(requestBody)
      .end((err, res) => {
        const error = res.body[1].error;
        assert.ok(error);
        assert.ok(error.indexOf('unsupported response type') > -1);
        done();
      });
  });

  it('does html-parsing if the service returns HTML', function(done) {
    this.sandbox.spy(parseHtml, 'parse');

    const requestBody = {
      objects: [{ url: 'https://wilsonpage.co.uk' }]
    };

    nock('https://wilsonpage.co.uk')
      .get(/./)
      .reply(200, '<title>wilson page</title>', {
        'Content-Type': 'text/html; charset=utf-8'
      });

    supertest(app)
      .post('/metadata/')
      .send(requestBody)
      .end((err, res) => {
        assert.equal(res.body[0].title, 'wilson page');
        sinon.assert.calledOnce(parseHtml.parse);
        done();
      });
  });

  describe('twitter username', function() {
    describe('no redirect', function() {
      beforeEach(function(done) {
        const requestBody = {
          objects: [{ url: 'https://wilsonpage.co.uk?magnet_twitter_username=@wilsonpage' }]
        };

        nock('https://wilsonpage.co.uk')
          .get(/./)
          .reply(200, '<title>wilson page</title>', {
            'Content-Type': 'text/html; charset=utf-8'
          });

        supertest(app)
          .post('/metadata/')
          .send(requestBody)
          .end((err, res) => {
            this.result = res.body;
            done();
          });
      });

      it('returns the twitter username', function() {
        assert.equal(this.result[0].twitterUsername, 'wilsonpage');
      });
    });

    describe('with redirect', function() {
      beforeEach(function(done) {
        const endUrl = 'https://francisco.com/?magnet_twitter_username=arcturus';
        const sites = {
          objects: [{ url: 'http://bit.ly/1Q3Pb6u' }]
        };

        // redirect
        nock('http://bit.ly')
          .get('/1Q3Pb6u')
          .reply(301, 'CONTENT', {
            'Location': endUrl,
            'Content-Type': 'text/html; charset=utf-8'
          });

        // final response
        nock('https://francisco.com')
          .get('/?magnet_twitter_username=arcturus')
          .reply(200, '<title>Francisco</title>', {
            'Content-Type': 'text/html; charset=utf-8'
          });

        supertest(app)
          .post('/metadata')
          .send(sites)
          .expect(200)
          .end((err, res) => {
            if (err) { throw err; }
            this.result = res.body;
            done();
          });
      });

      it('returns the twitter username', function() {
        assert.equal(this.result[0].twitterUsername, 'arcturus');
      });
    });
  });

  describe('content service additional data', function() {
    beforeEach(function(done) {
      const sites = {
        objects: [{ url: 'https://example.com' }]
      };

      nock('https://example.com')
        .get('/')
        .reply(200, '<title>Example</title>', {
          'Content-Type': 'text/html; charset=utf-8'
        });

      nock('http://localhost:3000')
        .post('/v1/search/url', ['https://example.com'])
        .reply(200, [
          {
            id: '4d',
            short_url: 'https://pm0.io/4d',
            channel: 'TestChannel',
            url: 'http://example.com',
            call_to_action: { call: 'action' },
            extra_metadata: { image: 'test.jpg' },
            location: { latitude: 51.5245625, longitude: -0.1362341 },
            is_virtual: true
          }
        ]);

      supertest(app)
        .post('/metadata')
        .send(sites)
        .expect(200)
        .end((err, res) => {
          if (err) {
            done(err);
            return;
          }

          this.result = res.body;
          done();
        });
    });

    it('should include call_to_action data', function() {
      assert.deepEqual(this.result[0].call_to_action, { call: 'action' });
    });

    it('should include extra metadata merged into response', function() {
      assert.equal(this.result[0].image, 'test.jpg');
    });
  });

  // Not sure if this is a requirement.
  // Supporting this breaks lots of other things.
  describe.skip('unencoded urls', function() {
    beforeEach(function(done) {
      const self = this;

      this.path = '/venue/Billy’s+Place/20+E.+Perry+St.,+second+floor';
      this.sandbox.spy(parseHtml, 'parse');

      const requestBody = {
        objects: [{ url: `https://dosavannahcalendar.sched.org${this.path}` }]
      };

      nock('https://dosavannahcalendar.sched.org')
        .get(/./)
        .reply(200, function(uri) {
          self.requestPath = uri;
          return '<title>title</title>';
        });

      supertest(app)
        .post('/metadata/')
        .send(requestBody)
        .end((err, res) => {
          if (err) {
            throw err;
          }

          done();
        });
    });

    it('encodes uri before request', function() {
      assert.equal(this.requestPath, encodeURI(this.path));
    });
  });
});
