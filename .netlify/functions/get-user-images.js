/**
 * Netlify Function: Get User Images
 * Retrieves all images uploaded by a specific user
 */

const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: process.env.CLOUD_NAME,
  api_key: process.env.API_KEY,
  api_secret: process.env.API_SECRET,
});

exports.handler = async (event) => {
  try {
    const queryParams = event.queryStringParameters || {};
    const userEmail = queryParams.user_email;

    if (!userEmail) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          error: 'Missing user_email parameter'
        }),
      };
    }

    const userTag = userEmail.replace('@', '_').replace(/\./g, '_');
    console.log(`Fetching images for user: ${userEmail} (tag: user-${userTag})`);

    try {
      // Search for resources with user tag
      const result = await cloudinary.api.resources_by_tag(`user-${userTag}`, {
        resource_type: 'image',
        type: 'upload',
        max_results: 100,
        context: true,
        tags: true,
      });

      const images = (result.resources || []).map((resource) => ({
        id: resource.public_id,
        url: resource.secure_url,
        title: resource.context?.custom?.alt || resource.public_id.split('/').pop() || 'Untitled',
        description: resource.context?.custom?.description || '',
        tags: resource.tags || [],
        date: resource.created_at,
      }));

      console.log(`Found ${images.length} images for user ${userEmail}`);

      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({
          images: images,
          total: result.total_count || images.length,
          success: true,
        }),
      };

    } catch (apiError) {
      console.error('Cloudinary API error:', apiError.message);

      // If tag doesn't exist or no resources found, return empty array
      if (apiError.http_code === 404 || apiError.message.includes('not found')) {
        return {
          statusCode: 200,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
          body: JSON.stringify({
            images: [],
            total: 0,
            success: true,
            message: 'No photos found',
          }),
        };
      }

      throw apiError;
    }

  } catch (error) {
    console.error('Error fetching user images:', error.message);

    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        error: 'Failed to fetch images',
        details: error.message,
        images: [],
      }),
    };
  }
};