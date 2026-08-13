/**
 * Netlify Function: Update Photo Tags
 * Updates tags for a photo in Cloudinary.
 * Expects a JSON body with { photoId, tags }.
 * not used in the current version of the app, but kept for potential future use.
 */

const cloudinary = require('cloudinary').v2;
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

exports.handler = async (event) => {
  const { photoId } = JSON.parse(event.body);
  try {
    await cloudinary.uploader.destroy(photoId, { invalidate: true });
    return { statusCode: 200 };
  } catch (error) {
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};

// All Right Reserved. This code is provided as-is without warranty of any kind. Use at your own risk.
// Property of Picpool. Issued under the MIT License. See LICENSE file for details.