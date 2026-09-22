import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { batchEmail, notifyAddress } from '../../src/services/email.js';

const HISTORY = 'https://lumina.test/history';

describe('notification address', () => {
  it('accepts an address a provider vouched for', () => {
    assert.equal(notifyAddress('someone@gmail.com'), 'someone@gmail.com');
  });

  it('refuses the invented address a guest carries', () => {
    assert.equal(notifyAddress('guest-8f2c1d2e@guest.local'), null);
  });

  it('refuses the invented address a twitter account carries', () => {
    assert.equal(notifyAddress('twitter-4242@twitter.local'), null);
  });
});

describe('batch notification', () => {
  it('says the batch is complete however it ended', () => {
    assert.equal(
      batchEmail({ total: 5, ready: 5, failed: 0 }, HISTORY).subject,
      'Your batch processing is complete',
    );
    assert.equal(
      batchEmail({ total: 5, ready: 3, failed: 2 }, HISTORY).subject,
      'Your batch processing is complete',
    );
  });

  it('says every image finished when nothing failed', () => {
    const { html } = batchEmail({ total: 5, ready: 5, failed: 0 }, HISTORY);

    assert.ok(html.includes('All 5 images in your batch have successfully finished transforming.'));
    assert.ok(
      html.includes(
        'The files have been processed according to your specifications and are now ready.',
      ),
    );
    assert.ok(!html.includes('could not be processed'));
  });

  it('counts the failures rather than claiming they all succeeded', () => {
    const { html } = batchEmail({ total: 5, ready: 3, failed: 2 }, HISTORY);

    assert.ok(html.includes('3 of 5 images in your batch finished transforming and are ready.'));
    assert.ok(html.includes('2 could not be processed.'));
  });

  it('reads a batch of one as an image rather than as images', () => {
    const { html } = batchEmail({ total: 1, ready: 1, failed: 0 }, HISTORY);

    assert.ok(html.includes('The image in your batch has successfully finished transforming.'));
  });

  it('greets, sends the reader to the dashboard, and signs off', () => {
    const { html } = batchEmail({ total: 2, ready: 2, failed: 0 }, HISTORY);

    assert.ok(html.includes('Hello,'));
    assert.ok(html.includes('Please visit your history dashboard'));
    assert.ok(html.includes(`href="${HISTORY}"`));
    assert.ok(html.includes('Open History Dashboard'));
    assert.ok(html.includes('The Lumina Team'));
  });

  it('links to the app rather than to the results', () => {
    const { html } = batchEmail({ total: 2, ready: 2, failed: 0 }, HISTORY);

    assert.ok(!html.includes('X-Amz'), 'a signed url would be dead before the mail is read');
  });
});
