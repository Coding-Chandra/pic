const fetch = require('node-fetch');

exports.handler = async (event) => {
  const { url, title } = event.queryStringParameters;
  if (!url || !title) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Missing url or title' })
    };
  }

  try {
    const imageUrl = decodeURIComponent(url);
    const cleanTitle = decodeURIComponent(title).replace(/\s+/g, '_');
    console.log('Proxy: Fetching', imageUrl, 'with title', cleanTitle);

    const response = await fetch(imageUrl);
    if (!response.ok) throw new Error(`Fetch failed: ${response.statusText}`);
    const buffer = await response.buffer();

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'image/jpeg',
        'Content-Disposition': `attachment; filename="${cleanTitle}.jpg"`
      },
      body: buffer.toString('base64'),
      isBase64Encoded: true
    };
  } catch (error) {
    console.error('Proxy error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};
