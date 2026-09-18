import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { contentDisposition, downloadFilename } from '../../src/storage/filename.js';

const ID = 'abcdef12-3456-7890-abcd-ef1234567890';

describe('download filename', () => {
  it('keeps the name the upload arrived with', () => {
    assert.equal(downloadFilename('holiday.jpg', ID, 'image/jpeg'), 'holiday.jpg');
  });

  it('takes the extension from the bytes, so a converted result is renamed', () => {
    assert.equal(downloadFilename('holiday.jpg', ID, 'image/webp'), 'holiday.webp');
    assert.equal(downloadFilename('logo.PNG', ID, 'image/jpeg'), 'logo.jpg');
  });

  it('falls back to a generated name when there is nothing usable', () => {
    assert.equal(downloadFilename(null, ID, 'image/png'), 'image-abcdef12.png');
    assert.equal(downloadFilename('', ID, 'image/png'), 'image-abcdef12.png');
    assert.equal(downloadFilename('.gitignore', ID, 'image/png'), 'image-abcdef12.png');
  });

  it('strips path separators so the file cannot land outside the folder', () => {
    assert.equal(downloadFilename('../../etc/passwd', ID, 'image/png'), 'passwd.png');
    assert.equal(downloadFilename('C:\\Users\\me\\pic.png', ID, 'image/png'), 'pic.png');
  });

  it('strips the control characters that would inject a header', () => {
    const filename = downloadFilename('a\r\nX-Injected: 1.jpg', ID, 'image/png');

    assert.ok(!filename.includes('\r'));
    assert.ok(!filename.includes('\n'));
    assert.ok(!filename.includes(':'));
  });

  it('keeps a non-ascii stem intact for the encoded parameter', () => {
    assert.equal(downloadFilename('写真.jpg', ID, 'image/jpeg'), '写真.jpg');
  });

  it('falls back to a generic extension for an unknown type', () => {
    assert.equal(downloadFilename('blob', ID, 'application/octet-stream'), 'blob.bin');
  });

  it('caps a very long name', () => {
    assert.equal(downloadFilename(`${'a'.repeat(300)}.png`, ID, 'image/png').length, 68);
  });
});

describe('content disposition', () => {
  it('quotes the name and adds the encoded form', () => {
    assert.equal(
      contentDisposition('holiday.jpg'),
      'attachment; filename="holiday.jpg"; filename*=UTF-8\'\'holiday.jpg',
    );
  });

  it('degrades a non-ascii name to underscores in the quoted fallback', () => {
    assert.equal(
      contentDisposition('写真.jpg'),
      'attachment; filename="__.jpg"; filename*=UTF-8\'\'%E5%86%99%E7%9C%9F.jpg',
    );
  });

  it('escapes the characters that are not valid in the encoded form', () => {
    assert.ok(contentDisposition("a'b(c).jpg").includes("filename*=UTF-8''a%27b%28c%29.jpg"));
  });

  it('always marks the response as an attachment', () => {
    assert.ok(contentDisposition('x.png').startsWith('attachment; '));
  });
});
