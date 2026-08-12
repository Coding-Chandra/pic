const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: process.env.CLOUD_NAME,
  api_key: process.env.API_KEY,
  api_secret: process.env.API_SECRET,
});

// Same defensive decode used in upload-images.js. Cloudinary itself never
// introduces %-encoding into context values (confirmed against the SDK
// source) — so if we see %XX sequences here, they were already baked into
// storage by an upstream bug. This unwinds them at read time so display
// and search both work correctly, independent of whether/when the write
// path gets fixed or old assets get migrated.
const cleanText = (value) => {
  if (typeof value !== 'string') return value;
  if (!/%[0-9A-Fa-f]{2}/.test(value)) return value;
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

exports.handler = async (event) => {
  try {
    console.log('Cloudinary config:', {
      cloud_name: process.env.CLOUD_NAME || 'MISSING',
      api_key: process.env.API_KEY ? '[REDACTED]' : 'MISSING',
      api_secret: process.env.API_SECRET ? '[REDACTED]' : 'MISSING',
    });

    const queryParams = event.queryStringParameters || {};
    const nextCursor = queryParams.next_cursor || null;

    console.log('Fetching resources with params:', {
      resource_type: 'image',
      type: 'upload',
      prefix: 'photo-gallery',
      max_results: 100,
      context: true,
      tags: true,
      next_cursor: nextCursor,
    });

    const result = await cloudinary.api.resources({
      resource_type: 'image',
      type: 'upload',
      prefix: 'photo-gallery',
      max_results: 100,
      context: true,
      tags: true,
      next_cursor: nextCursor,
    });

    if (!Array.isArray(result.resources)) {
      throw new Error(`Cloudinary response.resources is not an array: ${JSON.stringify(result)}`);
    }

    const images = result.resources.map((resource) => {
      const rawTags = resource.tags && resource.tags.length > 0
        ? resource.tags
        : (resource.context?.custom?.tags ? resource.context.custom.tags.split(',') : []);

      return {
        id: resource.public_id,
        url: resource.secure_url,
        title: cleanText(resource.context?.custom?.alt) || resource.public_id.split('/').pop(),
        description: cleanText(resource.context?.custom?.description) || '',
        tags: rawTags.map(cleanText),
        date: resource.context?.custom?.date || resource.created_at,
        downloads: parseInt(resource.context?.custom?.downloads) || 0,
      };
    });

    console.log('Final images array length:', images.length);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        images,
        next_cursor: result.next_cursor || null,
      }),
    };
  } catch (error) {
    console.error('Error fetching images:', {
      message: error.message,
      name: error.name,
      stack: error.stack,
      http_code: error.http_code,
      response: error.response ? JSON.stringify(error.response) : 'No response',
    });
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        error: 'Failed to fetch images',
        details: error.message || 'Unknown error',
        http_code: error.http_code || 'N/A',
      }),
    };
  }
};