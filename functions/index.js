const { onRequest } = require('firebase-functions/v2/https');
const logger = require('firebase-functions/logger');
const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp();
}

function parseDataUrl(dataUrl) {
  const match = String(dataUrl || '').match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) return null;
  const mimeType = match[1];
  const base64Data = match[2];
  return {
    mimeType,
    buffer: Buffer.from(base64Data, 'base64'),
  };
}

exports.ogImage = onRequest(
  {
    region: 'asia-northeast3',
    invoker: 'public',
    timeoutSeconds: 15,
    memory: '256MiB',
  },
  async (req, res) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');

    try {
      const snap = await admin.firestore().doc('hero_background_images/slot_1').get();
      const data = snap.exists ? snap.data() || {} : {};
      const parsed = parseDataUrl(data.dataUrl);

      if (parsed && parsed.buffer.length > 0) {
        res.set('Content-Type', parsed.mimeType || 'image/jpeg');
        res.status(200).send(parsed.buffer);
        return;
      }

      res.redirect(302, '/og-main-left-image-removebg.jpg');
    } catch (error) {
      logger.error('ogImage failed', error);
      res.redirect(302, '/og-main-left-image-removebg.jpg');
    }
  }
);
