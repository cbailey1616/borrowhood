import Anthropic from '@anthropic-ai/sdk';
import { logger } from '../utils/logger.js';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

/**
 * Analyze an image of an item and extract listing details
 * @param {string} imageUrl - URL of the image to analyze
 * @returns {Promise<{title: string, description: string, condition: string, category?: string}>}
 */
export async function analyzeItemImage(imageUrl) {
  try {
    // Fetch the image and convert to base64
    const imageResponse = await fetch(imageUrl);
    if (!imageResponse.ok) {
      throw new Error('Failed to fetch image');
    }

    const imageBuffer = await imageResponse.arrayBuffer();
    const base64Image = Buffer.from(imageBuffer).toString('base64');
    const contentType = imageResponse.headers.get('content-type') || 'image/jpeg';

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: contentType,
                data: base64Image,
              },
            },
            {
              type: 'text',
              text: `You are helping someone list an item for borrowing in a neighborhood sharing app.

Analyze this image and provide details about the item shown. Return a JSON object with these fields:

1. "title": A concise, descriptive title for the item (e.g., "DeWalt 20V Cordless Drill", "Weber 22-inch Charcoal Grill"). Include brand and model if visible. Keep it under 60 characters.

2. "description": A helpful 2-3 sentence description that would help a neighbor understand what the item is and what it can be used for. Mention any notable features visible in the image.

3. "condition": Assess the visible condition. Must be one of: "like_new", "good", "fair", or "worn"
   - "like_new": Appears unused or barely used, no visible wear
   - "good": Normal wear, fully functional appearance
   - "fair": Noticeable wear, scratches, or cosmetic issues
   - "worn": Significant wear, but still appears functional

4. "category": If you can identify the category, include it. Options: "tools", "outdoor", "kitchen", "electronics", "sports", "games", "baby", "home", "other"

Respond with ONLY the JSON object, no other text. Example:
{"title": "Black & Decker Circular Saw", "description": "7-1/4 inch circular saw with laser guide. Great for cutting lumber, plywood, and other wood materials. Includes blade guard and dust port.", "condition": "good", "category": "tools"}

If you cannot identify the item or the image doesn't show a lendable item, return:
{"error": "Could not identify a lendable item in this image"}`,
            },
          ],
        },
      ],
    });

    // Parse the response
    const content = response.content[0];
    if (content.type !== 'text') {
      throw new Error('Unexpected response format');
    }

    // Extract JSON from response (handle potential markdown code blocks)
    let jsonText = content.text.trim();
    if (jsonText.startsWith('```')) {
      jsonText = jsonText.replace(/```json?\n?/g, '').replace(/```$/g, '').trim();
    }

    const result = JSON.parse(jsonText);

    if (result.error) {
      return { error: result.error };
    }

    // Validate condition value
    const validConditions = ['like_new', 'good', 'fair', 'worn'];
    if (!validConditions.includes(result.condition)) {
      result.condition = 'good'; // Default to good if invalid
    }

    return {
      title: result.title || '',
      description: result.description || '',
      condition: result.condition || 'good',
      category: result.category || null,
    };
  } catch (err) {
    logger.error('Image analysis error:', err);
    throw new Error('Failed to analyze image');
  }
}

export default { analyzeItemImage };
