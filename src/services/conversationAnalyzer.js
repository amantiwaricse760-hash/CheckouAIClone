/**
 * Interview Conversation Analyzer
 * Analyzes live interview transcripts and identifies ONLY the interviewer's latest question.
 * Strictly ignores candidate speech, small talk, thinking out loud, and repeated questions.
 */

class InterviewConversationAnalyzer {
  constructor(apiKey) {
    this.apiKey = apiKey || process.env.GEMINI_API_KEY;
    this.modelName = 'gemini-flash-lite-latest';
    this.processedQuestions = new Set();
    this.lastProcessedTime = 0;
  }

  setApiKey(key) {
    this.apiKey = key;
  }

  /**
   * 0ms heuristic pre-check to discard obvious candidate speech and trivial greetings
   */
  fastPreCheck(speaker, text) {
    if (!text || typeof text !== 'string') return { skip: true, isQuestion: false };

    const clean = text.trim();
    // 1. Never extract a question from CANDIDATE speech
    if (speaker && speaker.toUpperCase() === 'CANDIDATE') {
      return { skip: true, isQuestion: false, speaker: 'candidate', reason: 'candidate_turn' };
    }

    // 2. Reject trivial length (< 8 chars or < 2 words)
    if (clean.length < 8 || clean.split(/\s+/).length < 2) {
      return { skip: true, isQuestion: false, speaker: 'interviewer', reason: 'too_short' };
    }

    // 3. Reject pure greetings and audio checks
    const lower = clean.toLowerCase();
    const greetings = [
      'hello', 'hi', 'hey', 'good morning', 'good afternoon', 'good evening',
      'can you hear me', 'am i audible', 'can you see my screen',
      'nice to meet you', 'thank you', 'thanks', 'cool', 'sounds good', 'alright'
    ];
    for (const g of greetings) {
      if (lower === g || lower === g + '?' || lower === g + '.') {
        return { skip: true, isQuestion: false, speaker: 'interviewer', reason: 'greeting_check' };
      }
    }

    return { skip: false };
  }

  /**
   * Analyzes the latest interview turn against conversation context
   */
  async analyze(transcriptText, speaker = 'interviewer', conversationHistory = '') {
    // Fast pre-check first
    const pre = this.fastPreCheck(speaker, transcriptText);
    if (pre.skip) {
      return {
        isQuestion: false,
        speaker: pre.speaker || 'interviewer',
        question: null,
        questionType: null,
        confidence: 1.0
      };
    }

    if (!this.apiKey) {
      // Fallback if no key: basic heuristic
      return {
        isQuestion: true,
        speaker: 'interviewer',
        question: transcriptText,
        questionType: 'technical',
        confidence: 0.8
      };
    }

    const systemPrompt = `You are an Interview Conversation Analyzer.
Your job is to analyze a live interview transcript and identify ONLY the interviewer's latest question.

CRITICAL RULES:
1. SPEAKER RULES:
   - Only analyze text spoken by INTERVIEWER.
   - NEVER extract a question from CANDIDATE speech, candidate answers, candidate thinking out loud ('Let me think', 'What I would do is...'), or candidate self-reflections ('closures, right?').
   - If speaker is candidate or uncertain, return isQuestion: false.

2. QUESTION DETECTION:
   - An interviewer turn IS a question/request even if conversational, starting with 'Tell me...', 'Explain...', 'Suppose...', 'Imagine...', 'How would you...', 'What happens if...', or asking to write/explain code.
   - GREETINGS & AUDIO CHECKS are NOT questions ('Can you hear me?', 'Can you see my screen?', 'How are you?'). Return isQuestion: false.
   - Follow-up questions ('Good. And why PostgreSQL?') -> extract clean question ('Why would you choose PostgreSQL?').
   - Multiple questions in one turn -> return complete question without splitting.

3. SPEECH RECOGNITION CLEANUP:
   - Clean obvious phonetic transcription errors while preserving intended meaning.
   - Do NOT invent information. Do NOT answer the question.

4. INCREMENTAL CRITICAL RULE:
   - Only return isQuestion: true when a NEW interviewer turn contains a new question.
   - If uncertain, return isQuestion: false rather than guessing.

OUTPUT JSON FORMAT ONLY:
{
  "isQuestion": boolean,
  "speaker": "interviewer",
  "question": string or null,
  "questionType": "technical" | "system_design" | "behavioral" | null,
  "confidence": number
}`;

    const promptContext = `${conversationHistory ? 'RECENT CONVERSATION HISTORY:\n' + conversationHistory + '\n\n' : ''}LATEST TRANSCRIPT TURN:
${speaker.toUpperCase()}: "${transcriptText}"`;

    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${this.modelName}:generateContent`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-goog-api-key': this.apiKey
        },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [{ text: systemPrompt + '\n\n' + promptContext }]
            }
          ],
          generationConfig: {
            responseMimeType: 'application/json',
            temperature: 0.0,
            maxOutputTokens: 150
          }
        })
      });

      if (!res.ok) {
        throw new Error(`Analyzer API error: ${res.status}`);
      }

      const data = await res.json();
      const jsonText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      const parsed = JSON.parse(jsonText);

      // Deduplication check: Do not re-trigger previously answered question within 60s
      if (parsed.isQuestion && parsed.question) {
        const normalizedQ = parsed.question.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (this.processedQuestions.has(normalizedQ)) {
          return {
            isQuestion: false,
            speaker: 'interviewer',
            question: null,
            questionType: null,
            confidence: 0.95
          };
        }
        this.processedQuestions.add(normalizedQ);
        // Expire from set after 60s to allow re-asking
        setTimeout(() => this.processedQuestions.delete(normalizedQ), 60000);
      }

      return parsed;
    } catch (e) {
      console.error('[ConversationAnalyzer] Analysis error:', e.message);
      // Fallback
      return {
        isQuestion: speaker === 'interviewer',
        speaker,
        question: transcriptText,
        questionType: 'technical',
        confidence: 0.7
      };
    }
  }
}

module.exports = InterviewConversationAnalyzer;
