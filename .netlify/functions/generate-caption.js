// Netlify Function: /.netlify/functions/generate-caption
// Set ANTHROPIC_API_KEY in your Netlify site's environment variables.
// This keeps the API key server-side — never put it in admin.html directly.

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
    }

    try {
        const { image, mediaType } = JSON.parse(event.body || '{}');
        if (!image || !mediaType) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Missing image data' }) };
        }

        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': process.env.ANTHROPIC_API_KEY,
                'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify({
                model: 'claude-haiku-4-5-20251001',
                max_tokens: 300,
                messages: [{
                    role: 'user',
                    content: [
                        { type: 'image', source: { type: 'base64', media_type: mediaType, data: image } },
                        {
                            type: 'text',
                            text: 'Look at this photo and respond with ONLY raw JSON, no markdown fences, no preamble: {"title": "<catchy title, max 25 characters>", "description": "<engaging description, max 200 characters>"}'
                        }
                    ]
                }]
            })
        });

        const data = await response.json();

        if (!response.ok) {
            return { statusCode: response.status, body: JSON.stringify({ error: data.error?.message || 'Anthropic API error' }) };
        }

        const rawText = data.content?.find(block => block.type === 'text')?.text || '{}';
        const cleaned = rawText.replace(/```json|```/g, '').trim();

        let parsed;
        try {
            parsed = JSON.parse(cleaned);
        } catch {
            return { statusCode: 502, body: JSON.stringify({ error: 'Could not parse AI response' }) };
        }

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                title: (parsed.title || '').slice(0, 25),
                description: (parsed.description || '').slice(0, 200),
            }),
        };
    } catch (err) {
        return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
    }
};