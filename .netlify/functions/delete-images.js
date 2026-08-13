/**
 * Netlify Function: Delete Image (robust, improved logging & error handling)
 * - Accepts JSON body { publicId, userEmail } OR { url, userEmail }
 * - Verifies ownership by `user-<email_sanitized>` tag or context.custom.user_email
 * - Better logging, CORS handling, consistent responses
 */

const cloudinary = require('cloudinary').v2;

const DEFAULT_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function respond(statusCode, payload = {}, extraHeaders = {}) {
  return {
    statusCode,
    headers: { ...DEFAULT_HEADERS, ...extraHeaders },
    body: JSON.stringify(payload),
  };
}

function sanitizeEmailForTag(email = '') {
  try {
    return String(email).toLowerCase().replace(/@/g, '_').replace(/\./g, '_');
  } catch (e) {
    return String(email || '');
  }
}

function extractPublicIdFromUrl(url) {
  try {
    if (!url) return null;
    const u = new URL(url);
    const parts = u.pathname.split('/'); // ['', 'image', 'upload', 'v12345', 'folder', 'public_id.ext']
    const uploadIndex = parts.indexOf('upload');
    if (uploadIndex === -1) return null;
    const afterUpload = parts.slice(uploadIndex + 1);
    if (!afterUpload || afterUpload.length === 0) return null;
    if (/^v\d+$/.test(afterUpload[0])) afterUpload.shift();
    const joined = afterUpload.join('/');
    const dot = joined.lastIndexOf('.');
    const publicId = dot === -1 ? joined : joined.substring(0, dot);
    return publicId || null;
  } catch (err) {
    console.warn('extractPublicIdFromUrl error:', err && err.stack ? err.stack : err);
    return null;
  }
}

// Validate env and configure cloudinary
(function initCloudinary() {
  const cfgName = process.env.CLOUD_NAME || process.env.CLOUDINARY_CLOUD_NAME || process.env.CLOUDINARY_URL;
  const apiKey = process.env.API_KEY || process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.API_SECRET || process.env.CLOUDINARY_API_SECRET;

  if (!cfgName || !apiKey || !apiSecret) {
    console.warn('Cloudinary environment variables appear to be missing or incomplete. Expected: CLOUD_NAME/API_KEY/API_SECRET (or CLOUDINARY_* equivalents). Some calls will fail until these are provided.');
  }

  try {
    cloudinary.config({
      cloud_name: process.env.CLOUD_NAME || process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.API_KEY || process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.API_SECRET || process.env.CLOUDINARY_API_SECRET,
    });
  } catch (err) {
    console.error('cloudinary.config failed:', err && err.stack ? err.stack : err);
  }
})();

exports.handler = async (event) => {
  // Handle CORS preflight quickly
  if (event && event.httpMethod === 'OPTIONS') {
    return respond(200, { ok: true });
  }

  try {
    if (!event || event.httpMethod !== 'POST') {
      return respond(405, { error: 'Method not allowed' });
    }

    // parse body safely
    let body;
    try {
      body = event.body ? JSON.parse(event.body) : {};
    } catch (e) {
      console.warn('JSON parse error for event.body:', e && e.stack ? e.stack : e);
      return respond(400, { error: 'Invalid JSON in request body' });
    }

    const { publicId: rawPublicId, userEmail: rawUserEmail, url } = body || {};

    const userEmail = rawUserEmail ? String(rawUserEmail).trim() : '';
    if (!userEmail) {
      return respond(400, { error: 'Missing required field: userEmail' });
    }

    // Accept either publicId or url (try to extract if url provided)
    let publicId = rawPublicId || '';
    if (!publicId && url) {
      publicId = extractPublicIdFromUrl(url);
      if (!publicId) {
        console.warn('Could not extract publicId from url:', url);
      }
    }

    if (!publicId) {
      return respond(400, {
        error: 'Missing publicId',
        details: 'Send { publicId, userEmail } or { url, userEmail } - could not extract publicId',
      });
    }

    console.info(`Delete requested (publicId="${publicId}", user="${userEmail}")`);

    // Attempt to retrieve resource
    let resource = null;
    try {
      resource = await cloudinary.api.resource(publicId, { resource_type: 'image' });
      console.info(`api.resource found: public_id=${resource && resource.public_id}, type=${resource && resource.resource_type}`);
    } catch (err) {
      // log full error and attempt fallback search
      console.warn(`api.resource failed for ${publicId}:`, err && err.stack ? err.stack : err);
      try {
        const searchResult = await cloudinary.search
          .expression(`public_id:${publicId}`)
          .max_results(1)
          .execute();
        if (searchResult && Array.isArray(searchResult.resources) && searchResult.resources.length > 0) {
          resource = searchResult.resources[0];
          console.info(`Fallback search found resource for ${publicId}: public_id=${resource.public_id}`);
        } else {
          console.info(`Fallback search returned no resources for ${publicId}`);
        }
      } catch (searchErr) {
        console.warn('Search fallback failed:', searchErr && searchErr.stack ? searchErr.stack : searchErr);
      }
    }

    if (!resource) {
      return respond(404, {
        error: 'Photo not found',
        details: 'No Cloudinary resource matching publicId or URL was found',
      });
    }

    // Ensure we have a public_id in resource, otherwise use the requested publicId
    const resourcePublicId = resource.public_id || publicId;

    // Verify owner tag or context
    const expectedTag = `user-${sanitizeEmailForTag(userEmail)}`;
    const tags = Array.isArray(resource.tags) ? resource.tags : [];
    const contextUserEmail = resource.context && resource.context.custom && resource.context.custom.user_email;
    const isOwner = tags.includes(expectedTag) || (contextUserEmail && String(contextUserEmail) === String(userEmail));

    console.info('Ownership check', {
      expectedTag,
      tags,
      contextUserEmail,
      isOwner,
      resourcePublicId,
    });

    if (!isOwner) {
      console.warn(`Ownership mismatch for publicId=${resourcePublicId}. Expected tag ${expectedTag}, tags=${JSON.stringify(tags)}, contextUserEmail=${contextUserEmail}`);
      return respond(403, {
        error: 'Unauthorized',
        details: 'You do not have permission to delete this photo',
      });
    }

    // Perform deletion
    try {
      const destroyResult = await cloudinary.uploader.destroy(resourcePublicId, { resource_type: 'image' });
      console.info('cloudinary.uploader.destroy result:', destroyResult);

      if (!destroyResult || typeof destroyResult !== 'object') {
        console.warn('Unexpected destroy result:', destroyResult);
      }

      // Common responses: { result: 'ok' } or { result: 'not found' }
      if (destroyResult && destroyResult.result === 'not found') {
        return respond(404, {
          error: 'Photo not found during delete',
          details: destroyResult,
        });
      }

      if (destroyResult && (destroyResult.result === 'ok' || destroyResult.result === 'deleted' || destroyResult.result === 'destroyed')) {
        return respond(200, {
          success: true,
          message: 'Photo deleted successfully',
          publicId: resourcePublicId,
        });
      }

      // Unknown but successful-looking response — return it
      return respond(200, {
        success: true,
        message: 'Photo deletion attempted',
        details: destroyResult,
        publicId: resourcePublicId,
      });
    } catch (delErr) {
      console.error('Deletion error:', delErr && delErr.stack ? delErr.stack : delErr);
      return respond(500, { error: 'Failed to delete photo', details: delErr && delErr.message ? delErr.message : String(delErr) });
    }
  } catch (unhandled) {
    console.error('Unhandled error in delete-images function:', unhandled && unhandled.stack ? unhandled.stack : unhandled);
    return respond(500, { error: 'Internal server error', details: unhandled && unhandled.message ? unhandled.message : String(unhandled) });
  }
};

// All Right Reserved. This code is provided as-is without warranty of any kind. Use at your own risk.
// Property of Picpool. Issued under the MIT License. See LICENSE file for details.