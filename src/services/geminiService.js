/**
 * Gemini Streaming AI Service
 * Supports streaming responses via official SDK or direct REST API
 */

class GeminiService {
  constructor(apiKey) {
    this.apiKey = apiKey || process.env.GEMINI_API_KEY;
    this.modelName = 'gemini-2.0-flash'; // Ultra-low latency model
    this.fallbackModel = 'gemini-1.5-flash';
  }

  setApiKey(key) {
    this.apiKey = key;
  }

  buildSystemPrompt(profile, mode) {
    const styleGuides = {
      points: "Format output strictly as punchy bullet points. Start with a direct 1-sentence bottom line. Keep points under 15 words each so the candidate can read them at a glance while speaking.",
      desi: "Use natural Indian software professional phrasing ('Desi Mode'). Sound polite, confident, pragmatic, and conversational. Refer to practical engineering experience and common production scenarios.",
      code: "Prioritize writing clean, complete, idiomatic code right away. Add time and space complexity analysis (Big-O). Include brief comments explaining key logic.",
      deep: "Provide a structured technical response: 1) High-level concept, 2) Key trade-offs/mechanisms, 3) Real-world architectural example, 4) Edge cases."
    };

    const selectedGuide = styleGuides[mode] || styleGuides.points;

    return `You are a real-time AI Interview Copilot assisting a candidate discreetly during a live technical/behavioral interview.

CANDIDATE CONTEXT:
- Target Role: ${profile.targetRole || 'Software Engineer'}
- Experience: ${profile.yearsOfExperience || 'Experienced'}
- Primary Skills: ${(profile.primarySkills || []).join(', ')}
- Resume Background: ${profile.resumeSummary || 'Experienced software developer with strong fundamentals.'}
- Special Notes: ${profile.customInstructions || 'Be clear and concise.'}

STYLE GUIDELINES FOR THIS QUESTION (${mode.toUpperCase()} MODE):
${selectedGuide}

CRITICAL RULES:
1. Answer directly in the FIRST PERSON ('I', 'We in my previous project', 'My approach is...').
2. NEVER say 'Here is an answer for you' or 'As an AI'. Sound 100% like an experienced engineer talking.
3. Put the most critical talking points at the very top. The candidate only has 2 seconds to glance at your response.
4. If code is requested, provide syntactically valid code blocks with language tag (e.g. \`\`\`javascript or \`\`\`python).`;
  }

  async streamAnswer(question, profile = {}, mode = 'points', onToken, onComplete, onError) {
    if (!this.apiKey) {
      if (onError) onError(new Error("Gemini API Key is missing. Please set it in Settings."));
      return;
    }

    const systemPrompt = this.buildSystemPrompt(profile, mode);

    try {
      // Direct REST API streaming endpoint (compatible with Node 18+ native fetch)
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.modelName}:streamGenerateContent?alt=sse&key=${this.apiKey}`;
      
      const payload = {
        contents: [
          {
            role: "user",
            parts: [
              { text: `${systemPrompt}\n\nINTERVIEWER QUESTION: "${question}"` }
            ]
          }
        ],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 2048
        }
      };

      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        // Attempt fallback to 1.5-flash if 2.0-flash is unavailable for this key
        const fallbackUrl = `https://generativelanguage.googleapis.com/v1beta/models/${this.fallbackModel}:streamGenerateContent?alt=sse&key=${this.apiKey}`;
        const fallbackRes = await fetch(fallbackUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });

        if (!fallbackRes.ok) {
          const errText = await fallbackRes.text();
          throw new Error(`Gemini API Error (${fallbackRes.status}): ${errText}`);
        }
        await this._processSSEResponse(fallbackRes, onToken, onComplete);
        return;
      }

      await this._processSSEResponse(response, onToken, onComplete);
    } catch (err) {
      if (onError) onError(err);
    }
  }

  async _processSSEResponse(response, onToken, onComplete) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";
    let fullText = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith("data:")) continue;
        
        const jsonStr = trimmed.replace(/^data:\s*/, "");
        if (jsonStr === "[DONE]") continue;

        try {
          const parsed = JSON.parse(jsonStr);
          const textChunk = parsed?.candidates?.[0]?.content?.parts?.[0]?.text;
          if (textChunk) {
            fullText += textChunk;
            if (onToken) onToken(textChunk, fullText);
          }
        } catch (e) {
          // Incomplete chunk in buffer
        }
      }
    }

    if (onComplete) onComplete(fullText);
  }
}

module.exports = GeminiService;
