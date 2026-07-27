// Netlify Function: /.netlify/functions/generate-caption
// Set GEMINI_API_KEY in your Netlify site's environment variables.

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
    }

    try {
        const { image, mediaType } = JSON.parse(event.body || '{}');
        if (!image || !mediaType) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Missing image data' }) };
        }

        const model = 'gemini-flash-latest'; // auto-updating alias to Google's current Flash model, vision-capable
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`;

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{
                    parts: [
                        { text: 'Look at this photo and respond with ONLY raw JSON, no markdown fences: {"title": "<catchy title, max 25 characters>", "description": "<engaging description, max 200 characters>"}' },
                        { inline_data: { mime_type: mediaType, data: image } }
                    ]
                }],
                generationConfig: {
                    maxOutputTokens: 800,
                    responseMimeType: 'application/json',
                    thinkingConfig: { thinkingBudget: 0 }
                }
            })
        });

        const data = await response.json();

        if (!response.ok) {
            return { statusCode: response.status, body: JSON.stringify({ error: data.error?.message || 'Gemini API error' }) };
        }

        const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';

        let parsed;
        try {
            parsed = JSON.parse(rawText);
        } catch {
            return { statusCode: 502, body: JSON.stringify({ error: 'Could not parse AI response', raw: rawText.slice(0, 300) }) };
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