const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: process.env.CLOUD_NAME,
  api_key: process.env.API_KEY,
  api_secret: process.env.API_SECRET,
  max_image_file_size: 10485760, // 10MB limit (adjust as needed)
};
console.log('Cloudinary config:', {
  cloud_name: config.cloud_name || 'MISSING',
  api_key: config.api_key ? '[REDACTED]' : 'MISSING',
  api_secret: config.api_secret ? '[REDACTED]' : 'MISSING',
});

// Hypothetical endpoint to increment downloads (not implemented here)
const incrementDownloads = async (publicId) => {
    await cloudinary.api.update(publicId, {
        context: `downloads|=increment`,
    });
};

cloudinary.config(config);

exports.handler = async (event) => {
  console.log('Function invoked:', { method: event.httpMethod, bodyLength: event.body ? event.body.length : 'NO BODY' });

  if (event.httpMethod === 'OPTIONS') {
    console.log('Returning OPTIONS response');
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
      body: '',
    };
  }

  if (event.httpMethod !== 'POST') {
    console.log('Method not allowed:', event.httpMethod);
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method Not Allowed' }),
      headers: { 'Content-Type': 'application/json' },
    };
  }

  try {
    if (!event.body) {
      console.log('No body provided');
      throw new Error('Request body is empty');
    }

    console.log('Raw body preview:', event.body.slice(0, 100) + '...');
    let data;
    try {
      data = JSON.parse(event.body);
    } catch (parseError) {
      console.error('Body parsing failed:', parseError);
      throw new Error(`Invalid JSON: ${parseError.message}`);
    }

    const { image, title, description, tags } = data;
    console.log('Parsed data:', {
      title: title || 'MISSING',
      description: description || 'NONE',
      tags: tags || 'MISSING',
      imagePreview: image ? `${image.slice(0, 50)}... (length: ${image.length})` : 'MISSING',
    });

    if (!image || !title || !tags || !Array.isArray(tags) || tags.length === 0) {
      console.log('Validation failed: missing or invalid fields');
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing or invalid fields: image, title, or tags (must be a non-empty array)' }),
        headers: { 'Content-Type': 'application/json' },
      };
    }

    const base64Regex = /^data:image\/[a-z]+;base64,/;
    if (!base64Regex.test(image)) {
      console.log('Invalid base64 format');
      throw new Error('Image must be a valid base64 string (e.g., "data:image/jpeg;base64,...")');
    }

    const uploadOptions = {
  folder: 'photo-gallery',
  public_id: `${title.replace(/\s+/g, '-').toLowerCase()}-${Date.now()}`, // Unique ID with timestamp
  tags: tags, // Array of tags
  context: `alt=${title}|description=${description || ''}|tags=${tags.join(',')}|date=${new Date().toISOString()}`,
  resource_type: 'image', // Make sure the resource type is set to 'image'
  chunk_size: 10000000, // Set chunk size to 6MB, adjust as needed
};
    console.log('Upload options:', uploadOptions);

    console.log('Starting Cloudinary upload...');
    const result = await cloudinary.uploader.upload(image, uploadOptions).catch((err) => {
      console.error('Upload error:', err);
      if (err.http_code === 429 || err.message.includes('limit')) {
        throw new Error('Cloudinary rate limit exceeded. Please try again later or check your plan.');
      }
      throw new Error(`Cloudinary upload failed: ${JSON.stringify(err)}`);
    });

    console.log('Upload result:', {
      url: result.secure_url,
      id: result.public_id,
    });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: result.secure_url,
        id: result.public_id,
      }),
    };
  } catch (error) {
    console.error('Full error in upload-images:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Internal server error',
        details: error.message || 'No error message available',
        fullError: JSON.stringify(error, Object.getOwnPropertyNames(error)),
      }),
      headers: { 'Content-Type': 'application/json' },
    };
  }
};
