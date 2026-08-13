/**
 * Netlify Function: Update Downloads
 * Increments the download count for a specific image in Cloudinary.
 * Expects a JSON body with { public_id }.
 */

const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: process.env.CLOUD_NAME,
  api_key: process.env.API_KEY,
  api_secret: process.env.API_SECRET,
});

exports.handler = async (event) => {
  try {
    const { public_id } = JSON.parse(event.body);
    if (!public_id) throw new Error('Missing public_id');

    const currentResource = await cloudinary.api.resource(public_id, { context: true });
    const currentDownloads = parseInt(currentResource.context?.custom?.downloads) || 0;
    const newDownloads = currentDownloads + 1;

    await cloudinary.api.update(public_id, {
      context: `downloads=${newDownloads}`,
    });

    console.log(`Updated downloads for ${public_id} to ${newDownloads}`);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ downloads: newDownloads }),
    };
  } catch (error) {
    console.error('Error updating downloads:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: 'Failed to update downloads', details: error.message }),
    };
  }
};

// All Right Reserved. This code is provided as-is without warranty of any kind. Use at your own risk.
// Property of Picpool. Issued under the MIT License. See LICENSE file for details.