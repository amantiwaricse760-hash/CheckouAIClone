/**
 * Gemini Streaming AI Service
 * Supports streaming responses via official SDK or direct REST API
 */

class GeminiService {
  constructor(apiKey) {
    this.apiKey = apiKey || process.env.GEMINI_API_KEY;
    this.modelName = 'gemini-flash-lite-latest';
    this.fallbackModel = 'gemini-3.5-flash-lite';
    this.activeController = null;
  }

  setApiKey(key) {
    this.apiKey = key;
  }

  buildSystemPrompt(profile, mode) {
    const role = profile.targetRole || 'Senior Software Engineer';
    const skills = (profile.primarySkills || []).join(', ') || 'Modern Full-Stack, Distributed Systems, Cloud Architecture, Algorithms';
    const background = profile.resumeSummary || 'Experienced software engineer building high-scale, resilient production systems.';

    const styleGuides = {
      points: `FORMAT IN 3-4 SHARP BULLET POINTS:
- Bullet 1: The direct, definitive bottom-line answer in **bold** (the exact punchline you say aloud first).
- Bullets 2-4: The underlying technical mechanics, architecture trade-offs, and proven production impact.
- Keep each point under 18 words. Crisp, scannable at a glance.`,
      desi: `Deliver a natural, polite, pragmatic Indian tech professional response ('Desi Mode'):
- Lead with the direct technical solution right away.
- Confident, conversational, and grounded in practical production experience.`,
      code: `Output clean, production-grade, optimal code immediately:
- Line 1: **Time Complexity: O(...) | Space Complexity: O(...)**
- Optimal, bug-free implementation in the requested language (or standard JS/TS/Python).
- 2 bullet points on edge cases handled.`,
      deep: `Structured technical breakdown:
1) Core Mechanism: How it works internally under the hood.
2) Production Trade-offs: Scalability, memory, CPU, or network bottlenecks.
3) Real-world Architecture: Proven patterns used at scale.`
    };

    const selectedGuide = styleGuides[mode] || styleGuides.points;

    return `You are an elite, real-time AI Interview Copilot assisting a candidate live in a high-stakes technical interview.

CANDIDATE CONTEXT:
- Target Role: ${role}
- Skills: ${skills}
- Experience Background: ${background}
- Custom Directives: ${profile.customInstructions || 'Authoritative, precise, zero fluff.'}

STYLE INSTRUCTIONS (${mode.toUpperCase()} MODE):
${selectedGuide}

CRITICAL RULES FOR ACCURACY & CLARITY:
1. START IMMEDIATELY with the answer. ZERO filler like 'Sure', 'Certainly', 'Here is the answer', or pleasantries.
2. First-person voice ('I implement...', 'In my previous architecture, I used...').
3. 100% technical accuracy: Use exact industry terminology, standard library APIs, and modern best practices.
4. Bold key technical phrases so the candidate can read and speak seamlessly without hesitation.`;
  }

  async streamAnswer(question, profile = {}, mode = 'points', onToken, onComplete, onError) {
    if (!this.apiKey) {
      if (onError) onError(new Error("Gemini API Key is missing. Please set it in Settings."));
      return;
    }

    // Cancel any previous ongoing stream so new question starts immediately
    if (this.activeController) {
      try {
        this.activeController.abort();
      } catch (e) {}
    }
    this.activeController = new AbortController();
    const { signal } = this.activeController;

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
          temperature: 0.2,
          maxOutputTokens: 350
        }
      };

      const headers = {
        "Content-Type": "application/json",
        "X-goog-api-key": this.apiKey
      };

      // Try streaming endpoint with ultra-fast flash-lite
      let url = `https://generativelanguage.googleapis.com/v1beta/models/${this.modelName}:streamGenerateContent?alt=sse`;
      let response = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
        signal
      });

      // Fallback if needed
      if (!response.ok) {
        url = `https://generativelanguage.googleapis.com/v1beta/models/${this.fallbackModel}:streamGenerateContent?alt=sse`;
        response = await fetch(url, {
          method: "POST",
          headers,
          body: JSON.stringify(payload),
          signal
        });
      }

      // If streaming fails, try standard generateContent
      if (!response.ok) {
        const directUrl = `https://generativelanguage.googleapis.com/v1beta/models/${this.modelName}:generateContent`;
        const directRes = await fetch(directUrl, {
          method: "POST",
          headers,
          body: JSON.stringify(payload),
          signal
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
      if (err.name === 'AbortError') {
        // Ignored: superseded by a newer question
        return;
      }
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
