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

    // 1. Reject trivial length (< 5 chars or < 2 words)
    if (clean.length < 5 || clean.split(/\s+/).length < 2) {
      return { skip: true, isQuestion: false, speaker, reason: 'too_short' };
    }

    // 2. Reject pure greetings and audio checks
    const lower = clean.toLowerCase().replace(/[?!.,]/g, '').trim();
    const greetings = [
      'hello', 'hi', 'hey', 'good morning', 'good afternoon', 'good evening',
      'can you hear me', 'am i audible', 'can you see my screen',
      'nice to meet you', 'thank you', 'thanks', 'cool', 'sounds good', 'alright',
      'yes', 'no', 'yeah', 'sure', 'okay'
    ];
    if (greetings.includes(lower)) {
      return { skip: true, isQuestion: false, speaker, reason: 'greeting_check' };
    }

    // 3. Fast filter for candidate thinking-out-loud or monologue indicators
    const candidateMonologuePrefixes = [
      'let me think',
      'what i would do',
      'what i will do',
      'i am going to',
      'i will write',
      'so basically what i',
      'maybe i can use',
      'i think i will'
    ];
    for (const prefix of candidateMonologuePrefixes) {
      if (lower.startsWith(prefix)) {
        return { skip: true, isQuestion: false, speaker: 'candidate', reason: 'candidate_thinking' };
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
        speaker: pre.speaker || 'candidate',
        question: null,
        questionType: null,
        confidence: 1.0
      };
    }

    const isMeetAudio = speaker === 'monitor' || speaker === 'interviewer';
    const sourceLabel = isMeetAudio ? 'GOOGLE MEET (Interviewer)' : 'MICROPHONE';

    if (!this.apiKey) {
      const lower = transcriptText.toLowerCase().trim();
      const isCandidateThinking = lower.startsWith('let me') || lower.startsWith('what i would') || lower.startsWith('what i will') || lower.startsWith('i will');
      const isQuestionLike = lower.endsWith('?') || lower.startsWith('what') || lower.startsWith('how') || lower.startsWith('why') || lower.startsWith('explain') || lower.startsWith('suppose') || lower.startsWith('tell me');

      return {
        isQuestion: !isCandidateThinking && isQuestionLike,
        speaker: isQuestionLike ? 'interviewer' : 'candidate',
        question: isQuestionLike ? transcriptText : null,
        questionType: 'technical',
        confidence: 0.75
      };
    }

    const systemPrompt = `You are an Interview Conversation Analyzer for a live technical interview.
Your job is to analyze the live transcript turn and determine if an interview question/problem was asked that requires an AI answer.

AUDIO SOURCE & SPEAKER CONTEXT:
- Audio Source: "${sourceLabel}"
- Speaker Tag: "${speaker}"

RULES FOR IDENTIFICATION:
1. GOOGLE MEET (Interviewer):
   - Someone joining from Google Meet is the INTERVIEWER.
   - Any technical question, coding problem, architecture prompt, or explanation request from Google Meet must be extracted.

2. MICROPHONE (Candidate or Room):
   - If the sound is coming from the microphone:
     * If the speaker is asking an interview question / technical topic (e.g. "What is binary search?", "What is debouncing?", "How does garbage collection work in V8?", "Explain redux", "Suppose we have an array..."): Treat it as an interviewer question and extract it so the AI can provide the answer.
     * If the speaker is the candidate answering, explaining their code, thinking out loud ("Let me think about how to solve this...", "I will create a map...", "So the time complexity is O(N)..."), or self-reflecting: DO NOT treat it as an interviewer question (return isQuestion: false, question: null).

3. SMALL TALK & GREETINGS:
   - Always return isQuestion: false for small talk, greetings ("Hi, how are you?"), or technical checks ("Can you see my screen?").

4. PHONETIC RECOGNITION CORRECTION:
   - Clean speech recognition errors into their intended technical terms (e.g. "brand research" -> "binary search", "deep bow" -> "debouncing", "what is primary" -> "what is primary key" or "what is debouncing" if phonetic).
   - Do NOT answer the question. Only extract the clean question text.

OUTPUT JSON FORMAT ONLY:
{
  "isQuestion": boolean,
  "speaker": "interviewer" | "candidate",
  "question": string or null,
  "questionType": "technical" | "system_design" | "behavioral" | null,
  "confidence": number
}`;

    const promptContext = `${conversationHistory ? 'RECENT CONVERSATION HISTORY:\n' + conversationHistory + '\n\n' : ''}LATEST TRANSCRIPT TURN (${sourceLabel}):
"${transcriptText}"`;

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
            speaker: parsed.speaker || 'interviewer',
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
      const lower = transcriptText.toLowerCase().trim();
      const isCandidateThinking = lower.startsWith('let me') || lower.startsWith('what i would') || lower.startsWith('what i will') || lower.startsWith('i will');
      const isQuestionLike = lower.endsWith('?') || lower.startsWith('what') || lower.startsWith('how') || lower.startsWith('why') || lower.startsWith('explain') || lower.startsWith('suppose') || lower.startsWith('tell me');

      return {
        isQuestion: !isCandidateThinking && isQuestionLike,
        speaker: isQuestionLike ? 'interviewer' : 'candidate',
        question: isQuestionLike ? transcriptText : null,
        questionType: 'technical',
        confidence: 0.75
      };
    }
  }
}

module.exports = InterviewConversationAnalyzer;
