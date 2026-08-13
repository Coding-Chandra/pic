/**
 * Netlify Function: Update Image Metadata
 * Updates title and description for a photo
 * Used in Dashboard to allow users to edit their photo metadata.
 */

const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: process.env.CLOUD_NAME,
  api_key: process.env.API_KEY,
  api_secret: process.env.API_SECRET,
});

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') {
      return {
        statusCode: 405,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Method not allowed' }),
      };
    }

    let body;
    try {
      body = JSON.parse(event.body);
    } catch (e) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Invalid JSON in request body' }),
      };
    }

    const { publicId, title, description, userEmail } = body;

    if (!publicId || !userEmail) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          error: 'Missing required fields',
          details: 'Need: publicId and userEmail'
        }),
      };
    }

    console.log(`Update attempt - PublicId: ${publicId}, User: ${userEmail}`);

    // Verify user owns this photo
    let resource;
    try {
      resource = await cloudinary.api.resource(publicId, {
        resource_type: 'image',
      });
    } catch (err) {
      console.error('Resource not found:', err.message);
      return {
        statusCode: 404,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: 'Photo not found',
          details: 'The photo does not exist',
        }),
      };
    }

    // Check ownership via user tag
    const userTag = userEmail.replace('@', '_').replace(/\./g, '_');
    const hasUserTag = resource.tags && resource.tags.includes(`user-${userTag}`);

    if (!hasUserTag) {
      console.warn(`Unauthorized update: ${userEmail} tried to update ${publicId}`);
      return {
        statusCode: 403,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: 'Unauthorized',
          details: 'You do not have permission to update this photo',
        }),
      };
    }

    // Update metadata
    try {
      const updateResult = await cloudinary.api.update(publicId, {
        context: {
          alt: title || 'Untitled',
          description: description || '',
          user_email: userEmail,
        },
      });

      console.log(`Successfully updated: ${publicId}`);

      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({
          success: true,
          message: 'Photo metadata updated successfully',
          publicId: publicId,
        }),
      };
    } catch (updateErr) {
      console.error('Update failed:', updateErr.message);
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: 'Failed to update photo metadata',
          details: updateErr.message,
        }),
      };
    }

  } catch (error) {
    console.error('Unexpected error in update handler:', error);
    
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: 'Internal server error',
        details: error.message || 'Unknown error',
        type: error.constructor.name,
      }),
    };
  }
};

// All Right Reserved. This code is provided as-is without warranty of any kind. Use at your own risk.
// Property of Picpool. Issued under the MIT License. See LICENSE file for details.