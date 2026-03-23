// api/chat.js - Vercel Serverless Function for Omkar Trading AI
// Uses OpenRouter API with multimodal support for chart analysis

export default async function handler(req, res) {
  // CORS headers for development (optional, Vercel handles automatically)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  try {
    const { message, history, image } = req.body;
    
    // Validate required fields
    if (!message && !image) {
      return res.status(400).json({ error: 'Message or image required' });
    }
    
    // Get API key from environment
    const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
    if (!OPENROUTER_API_KEY) {
      console.error('OPENROUTER_API_KEY not configured');
      return res.status(500).json({ error: 'API key not configured' });
    }
    
    // Build conversation messages with system prompt
    const systemPrompt = `You are Omkar Trading AI, a professional trading assistant specializing in stocks, crypto, and forex markets. 
    
**Your expertise:**
- Technical analysis (support/resistance, patterns, indicators, volume)
- Fundamental catalysts and market structure
- Risk management (position sizing, stop-loss placement, risk/reward ratios)
- Multi-timeframe analysis
- Crypto on-chain metrics when relevant
- Chart pattern recognition and candlestick analysis

**Response format requirements:**
- ALWAYS structure responses with clear sections using markdown
- Use bullet points for actionable insights
- Include specific price levels, percentages, and concrete numbers
- Provide risk assessment with clear warnings when appropriate
- If analyzing a chart image, describe patterns, trendlines, key levels
- Keep responses concise but comprehensive (200-400 words typical)
- Never give financial advice as guarantees — always frame as analysis

**Trading-focused tone:** Analytical, data-driven, pragmatic. Avoid generic AI fluff. Focus on actionable market intelligence.`;

    // Prepare messages array
    const messages = [
      { role: 'system', content: systemPrompt }
    ];
    
    // Add conversation history (last 10 exchanges to manage token count)
    if (history && Array.isArray(history)) {
      const recentHistory = history.slice(-10); // Keep context manageable
      for (const msg of recentHistory) {
        if (msg.role === 'user' || msg.role === 'assistant') {
          messages.push({
            role: msg.role,
            content: msg.content
          });
        }
      }
    }
    
    // Handle current user message with optional image
    let userContent = message && message.trim() ? message.trim() : '';
    
    // If no text message but image exists, provide default trading context
    if (!userContent && image) {
      userContent = "Please analyze this trading chart. Provide technical analysis including support/resistance levels, trend direction, pattern recognition, and potential entry/exit zones with risk considerations.";
    }
    
    // Build user message with multimodal support if image exists
    let userMessageContent;
    if (image && image.startsWith('data:image')) {
      // Extract MIME type and base64 data
      const matches = image.match(/^data:image\/(png|jpeg|jpg);base64,(.+)$/);
      if (matches) {
        const imageType = matches[1] === 'jpg' ? 'jpeg' : matches[1];
        userMessageContent = [
          {
            type: 'text',
            text: userContent
          },
          {
            type: 'image_url',
            image_url: {
              url: image // OpenRouter accepts data URLs directly
            }
          }
        ];
      } else {
        // Fallback if image format invalid
        userMessageContent = userContent;
      }
    } else {
      userMessageContent = userContent;
    }
    
    messages.push({
      role: 'user',
      content: userMessageContent
    });
    
    // Select optimal model for trading analysis with vision capability if image present
    let model = 'google/gemini-2.0-flash-exp:free'; // Default fast model
    if (image) {
      // Use vision-capable models for chart analysis
      model = 'google/gemini-2.0-flash-exp:free'; // Supports vision, good for charts
      // Alternative premium: 'anthropic/claude-3.5-sonnet' or 'openai/gpt-4o'
    } else {
      // Text-only optimized models
      model = 'google/gemini-2.0-flash-exp:free';
    }
    
    // Call OpenRouter API
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000',
        'X-Title': 'Omkar Trading AI'
      },
      body: JSON.stringify({
        model: model,
        messages: messages,
        temperature: 0.7,
        max_tokens: 1000,
        top_p: 0.95,
        frequency_penalty: 0.3,
        presence_penalty: 0.2
      })
    });
    
    if (!response.ok) {
      const errorData = await response.text();
      console.error('OpenRouter API error:', response.status, errorData);
      
      // Provide graceful fallback response
      const fallbackReply = `**⚠️ Market Data Stream Limited**

I'm currently experiencing connectivity with my analysis engine. Here's a structured framework based on your query:

**Technical Framework:**
- **Support Levels:** Identify recent swing lows and volume nodes
- **Resistance Zones:** Previous highs and order blocks
- **Trend Bias:** Higher timeframe context (4H/Daily) determines direction
- **Risk Parameters:** Max risk 1-2% per trade, stop below key structure

**Recommendation:** Re-query with specific symbol/timeframe or check API configuration. For immediate assistance, specify asset class (crypto/stocks/forex) and timeframe.`;
      
      return res.status(200).json({ reply: fallbackReply });
    }
    
    const data = await response.json();
    const aiReply = data.choices[0]?.message?.content || 'Analysis complete. No structured data returned.';
    
    // Post-process to ensure trading-focused formatting
    const enhancedReply = enhanceTradingResponse(aiReply);
    
    return res.status(200).json({ reply: enhancedReply });
    
  } catch (error) {
    console.error('Chat API error:', error);
    
    // Graceful error response - trading-focused fallback
    const errorReply = `**📊 Trading Assistant - Connection Issue**

My analysis pipeline encountered a technical interruption. Based on standard trading principles:

**Current Market Considerations:**
- **Volatility Assessment:** Check ATR (Average True Range) for position sizing
- **Key Levels:** Mark previous day's high/low and weekly pivots
- **Risk Protocol:** Maintain 1:2 minimum risk-reward ratio
- **Confirmation:** Wait for candlestick confirmation at key levels

**Next Steps:** 
• Retry your query with specific symbol (e.g., "BTC/USD 4H analysis")
• Upload chart image for visual pattern recognition
• Check API key configuration if issue persists

*Omkar AI prioritizes structured risk management in all market conditions.*`;
    
    return res.status(200).json({ reply: errorReply });
  }
}

/**
 * Post-process AI response to ensure trading-specific formatting
 * Adds structure and clarity if response is too generic
 */
function enhanceTradingResponse(reply) {
  // If response already has good structure, return as-is
  if (reply.includes('**') || reply.includes('##') || reply.includes('•') || reply.includes('-')) {
    return reply;
  }
  
  // Otherwise, add basic trading structure for consistency
  const paragraphs = reply.split('\n\n');
  if (paragraphs.length <= 2) {
    return `**Market Analysis**\n\n${reply}\n\n**Risk Note:** Always use stop-loss orders and size positions according to account risk tolerance.`;
  }
  
  return reply;
}
