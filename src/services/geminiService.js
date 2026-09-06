/**
 * Gemini Streaming AI Service
 * Supports streaming responses via official SDK or direct REST API
 */

class GeminiService {
  constructor(apiKey) {
    this.apiKey = apiKey || process.env.GEMINI_API_KEY;
    this.modelName = 'gemini-2.0-flash';
    this.fallbackModel = 'gemini-flash-latest';
  }

  setApiKey(key) {
    this.apiKey = key;
  }

  buildSystemPrompt(profile, mode) {
    const styleGuides = {
      points: "Output 3-4 punchy, high-impact bullet points immediately. Start with the direct bottom-line answer in bold. Under 15 words per point. Zero filler.",
      desi: "Use natural Indian software professional phrasing ('Desi Mode'). Sound polite, confident, pragmatic, and conversational. Give the direct technical answer right away.",
      code: "Output clean, complete, optimal code immediately with Big-O time and space complexity at the top.",
      deep: "Provide a quick structured technical response: 1) Concept, 2) Trade-offs, 3) Real-world architecture example."
    };

    const selectedGuide = styleGuides[mode] || styleGuides.points;

    return `You are a real-time AI Interview Copilot assisting a candidate live in an interview.

CANDIDATE CONTEXT:
- Target Role: ${profile.targetRole || 'Software Engineer'}
- Skills: ${(profile.primarySkills || []).join(', ')}
- Resume Background: ${profile.resumeSummary || 'Experienced software engineer.'}

STYLE GUIDELINES (${mode.toUpperCase()} MODE):
${selectedGuide}

CRITICAL RULES:
1. START IMMEDIATELY. NO filler like 'Sure', 'Here is an answer', or conversational preamble.
2. First-person voice ('I use...', 'My approach is...').
3. Short, high-contrast talking points that can be read in 1 second.`;
  }

  async streamAnswer(question, profile = {}, mode = 'points', onToken, onComplete, onError) {
    if (!this.apiKey) {
      if (onError) onError(new Error("Gemini API Key is missing. Please set it in Settings."));
      return;
    }

    const systemPrompt = this.buildSystemPrompt(profile, mode);

    try {
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

      const headers = {
        "Content-Type": "application/json",
        "X-goog-api-key": this.apiKey
      };

      // Try streaming endpoint first
      let url = `https://generativelanguage.googleapis.com/v1beta/models/${this.modelName}:streamGenerateContent?alt=sse`;
      let response = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(payload)
      });

      // If model not found or error, fallback to gemini-1.5-flash
      if (!response.ok) {
        url = `https://generativelanguage.googleapis.com/v1beta/models/${this.fallbackModel}:streamGenerateContent?alt=sse`;
        response = await fetch(url, {
          method: "POST",
          headers,
          body: JSON.stringify(payload)
        });
      }

      // If streaming fails, try standard generateContent
      if (!response.ok) {
        const directUrl = `https://generativelanguage.googleapis.com/v1beta/models/${this.modelName}:generateContent`;
        const directRes = await fetch(directUrl, {
          method: "POST",
          headers,
          body: JSON.stringify(payload)
        });

        if (directRes.ok) {
          const data = await directRes.json();
          const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
          if (onToken) onToken(text, text);
          if (onComplete) onComplete(text);
          return;
        }

        const errText = await response.text();
        throw new Error(`Gemini API Error (${response.status}): ${errText}`);
      }

      await this._processSSEResponse(response, onToken, onComplete);
    } catch (err) {
      if (onError) onError(err);
    }
  }

  async streamAudioAnswer(audioBase64, mimeType = 'audio/webm', profile = {}, mode = 'points', onTranscribed, onToken, onComplete, onError) {
    if (!this.apiKey) {
      if (onError) onError(new Error("Gemini API Key is missing."));
      return;
    }

    const systemPrompt = this.buildSystemPrompt(profile, mode);
    const instruction = `${systemPrompt}

TASK:
1. Listen carefully to the audio clip of the interviewer.
2. First, output the exact transcribed question on a single line starting with:
[QUESTION]: <the transcribed question here>
3. Then output on a new line:
[ANSWER]:
followed immediately by your candidate response following the style guidelines.`;

    try {
      const cleanMime = mimeType.split(';')[0];
      const payload = {
        contents: [
          {
            role: "user",
            parts: [
              {
                inline_data: {
                  mime_type: cleanMime,
                  data: audioBase64
                }
              },
              {
                text: instruction
              }
            ]
          }
        ],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 2048
        }
      };

      const headers = {
        "Content-Type": "application/json",
        "X-goog-api-key": this.apiKey
      };

      // Try streaming endpoint first
      let url = `https://generativelanguage.googleapis.com/v1beta/models/${this.modelName}:streamGenerateContent?alt=sse`;
      let response = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        url = `https://generativelanguage.googleapis.com/v1beta/models/${this.fallbackModel}:streamGenerateContent?alt=sse`;
        response = await fetch(url, {
          method: "POST",
          headers,
          body: JSON.stringify(payload)
        });
      }

      if (!response.ok) {
        // Fallback to non-streaming generateContent
        const directUrl = `https://generativelanguage.googleapis.com/v1beta/models/${this.modelName}:generateContent`;
        const directRes = await fetch(directUrl, {
          method: "POST",
          headers,
          body: JSON.stringify(payload)
        });

        if (directRes.ok) {
          const data = await directRes.json();
          const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
          this._parseAudioResponse(text, onTranscribed, onToken, onComplete);
          return;
        }

        const errText = await response.text();
        throw new Error(`Gemini Audio API Error (${response.status}): ${errText}`);
      }

      let accumulated = "";
      await this._processSSEResponse(
        response,
        (chunk, full) => {
          accumulated = full;
          this._parseAudioStreaming(accumulated, onTranscribed, onToken);
        },
        (finalFull) => {
          this._parseAudioResponse(finalFull, onTranscribed, onToken, onComplete);
        }
      );
    } catch (err) {
      if (onError) onError(err);
    }
  }

  _parseAudioStreaming(text, onTranscribed, onToken) {
    if (text.includes('[QUESTION]:') && text.includes('[ANSWER]:')) {
      const qMatch = text.match(/\[QUESTION\]:\s*([\s\S]*?)(?=\[ANSWER\]:)/);
      if (qMatch && qMatch[1] && onTranscribed) {
        onTranscribed(qMatch[1].trim());
      }
      const answerPart = text.split('[ANSWER]:')[1] || "";
      if (onToken) onToken(answerPart, answerPart);
    } else if (text.includes('[QUESTION]:')) {
      const qText = text.replace(/\[QUESTION\]:\s*/, '');
      if (onTranscribed) onTranscribed(qText.trim());
    } else {
      if (onToken) onToken(text, text);
    }
  }

  _parseAudioResponse(text, onTranscribed, onToken, onComplete) {
    let question = "";
    let answer = text;

    if (text.includes('[QUESTION]:') && text.includes('[ANSWER]:')) {
      const parts = text.split('[ANSWER]:');
      question = parts[0].replace('[QUESTION]:', '').trim();
      answer = (parts[1] || "").trim();
    } else if (text.includes('[QUESTION]:')) {
      question = text.replace('[QUESTION]:', '').trim();
    }

    if (question && onTranscribed) onTranscribed(question);
    if (onToken) onToken(answer, answer);
    if (onComplete) onComplete(answer);
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
