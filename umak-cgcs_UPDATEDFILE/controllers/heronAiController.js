require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');

const CANDIDATE_MODELS = [
  'gemini-3.5-flash-lite',
  'gemini-flash-lite-latest',
  'gemini-3.1-flash-lite',
  'gemini-3.8-flash'
];

// Helper: Enforce strict execution timeout to guarantee instant response and avoid hangs
function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout of ${ms}ms exceeded`)), ms)
    )
  ]);
}

// 1. Clinical Guidance Counseling Persona
const HERONCARE_SYSTEM_INSTRUCTION = `
You are "HeronCare", a 24/7 empathetic student wellness companion for the University of Makati (UMak) Center for Guidance and Counseling Services (CGCS).

Your Guiding Principles:
1. Active & Reflective Listening: Always acknowledge the specific pain point the student mentioned (e.g., thesis revisions, family pressure, heartbreak, financial worries, feeling inadequate). Validate their feelings first: "Valid na valid yang nararamdaman mo...", "Sobrang nakaka-drain nga pag sabay-sabay...".
2. Voice & Tone: Warm, calm, reassuring, and grounded. Speak in natural Filipino-English (Taglish) commonly spoken by UMak students. Never sound clinical, judgmental, robotic, or preachy.
3. Keep Responses Conversational: Keep messages to 2–4 short, readable paragraphs (avoid giant walls of text).
4. Offer Choices, Not Demands: Suggest grounding options gently (e.g., "Gusto mo bang mag-vent pa muna, o gusto mong mag-pause tayo saglit para huminga?").
5. Boundaries: You are a supportive peer companion, not a psychiatrist. Do not diagnose mental illnesses or prescribe treatments.
6. University Bridge: If the student feels overwhelmed for days, gently remind them that their UMak Registered Guidance Counselors at Admin Building Rm 304 are always available for a confidential 1-on-1 talk.
`;

// 2. Main Response Generator
async function generateHeronResponse({ message, history, studentName }) {
  const apiKey = process.env.GEMINI_API_KEY || process.env.AI_API_KEY;
  if (!apiKey) {
    // Graceful fallback if no API key is set
    return getEmpatheticFallback(message, studentName);
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);

    // Format chat memory (last 6 turns)
    let formattedHistory = (history || []).slice(-6).map(turn => ({
      role: turn.role === 'model' ? 'model' : 'user',
      parts: [{ text: turn.text || '' }]
    })).filter(t => t.parts[0].text);

    // Ensure history starts with user turn if non-empty (Gemini API requirement)
    while (formattedHistory.length > 0 && formattedHistory[0].role === 'model') {
      formattedHistory.shift();
    }

    // Append current user message
    formattedHistory.push({
      role: 'user',
      parts: [{ text: `Student Name: ${studentName}\nStudent says: "${message}"` }]
    });

    for (const candidateModel of CANDIDATE_MODELS) {
      try {
        const model = genAI.getGenerativeModel({
          model: candidateModel,
          systemInstruction: HERONCARE_SYSTEM_INSTRUCTION,
          generationConfig: {
            temperature: 0.85,
            topP: 0.95,
            maxOutputTokens: 380
          }
        });

        const result = await withTimeout(
          model.generateContent({ contents: formattedHistory }),
          3500
        );
        if (result && result.response) {
          const replyText = result.response.text();
          if (replyText && replyText.trim()) {
            return replyText.trim();
          }
        }
      } catch (err) {
        console.warn(`Model ${candidateModel} failed or timed out:`, err.message);
        // Continue to fallback model in candidate list
      }
    }

    // If all candidate models encounter temporary issues, gracefully fallback
    return getEmpatheticFallback(message, studentName);
  } catch (error) {
    console.error("AI Controller Error:", error.message);
    return getEmpatheticFallback(message, studentName);
  }
}

// 3. Dynamic Rule-Based Fallback (if API is offline)
function getEmpatheticFallback(message, studentName) {
  const text = (message || '').toLowerCase();

  if (text.includes('thesis') || text.includes('defense') || text.includes('acads')) {
    return `Naiintindihan ko ang kaba at pagod mo sa academics, ${studentName}. Ang daming deadlines at revisions, pero tandaan mo na hindi nasusukat ang halaga mo sa iisang papel o grado. Gusto mo bang mag-pause muna tayo saglit at huminga?`;
  }

  if (text.includes('pagod') || text.includes('burnout') || text.includes('drained')) {
    return `Yakap nang mahigpit, ${studentName}. Valid na valid ang pagod mo. Kapag ramdam mong ubos na ubos ka na, senyales yan na kailangan ng katawan at isip mo ng pahinga. Nandito lang ako para makinig kung gusto mo maglabas ng saloobin.`;
  }

  return `Nandito ako at nakikinig sa'yo, ${studentName}. Hindi madali ang mga pinagdadaanan sa college life, kaya salamat sa pagbabahagi mo nito. I-kwento mo lang, walang judgment dito. Paano kita pinakamatutulungan ngayon?`;
}

// 4. Dynamic AI Conversation & Concern Summarizer
async function generateLiveChatClinicalSummary({ messages, studentName, college }) {
  const apiKey = process.env.GEMINI_API_KEY || process.env.AI_API_KEY;
  if (!apiKey || !messages || messages.length === 0) {
    const lastStudentMsg = (messages || []).filter(m => m.sender_role === 'student').pop();
    return lastStudentMsg ? `Student concern: "${lastStudentMsg.message.slice(0, 100)}..."` : 'Student initiated guidance consultation.';
  }
  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const transcriptText = messages.map(m => `${m.sender_name} (${m.sender_role}): ${m.message}`).join('\n');
    for (const candidateModel of CANDIDATE_MODELS) {
      try {
        const model = genAI.getGenerativeModel({
          model: candidateModel,
          generationConfig: {
            temperature: 0.25,
            maxOutputTokens: 160
          }
        });
        const prompt = `You are a clinical guidance intake assistant for UMak CGCS.
Student: ${studentName || 'Student'} (${college || 'UMak'})
Full Conversation Transcript:
${transcriptText}
In 2 short sentences (in clear English or natural Taglish), summarize:
1. The student's primary issue or question.
2. The current counseling context or agreed-upon guidance status.
Keep it strictly factual, professional, and concise.`;
        const result = await withTimeout(model.generateContent(prompt), 3000);
        const summary = result.response.text().trim();
        if (summary) return summary;
      } catch (e) { }
    }
  } catch (err) {
    console.error('Error generating AI live chat summary:', err.message);
  }
  const last = (messages || []).filter(m => m.sender_role === 'student').pop();
  return last ? `Student concern: "${last.message.slice(0, 110)}..."` : 'Student requested guidance consultation.';
}

module.exports = {
  generateHeronResponse,
  generateLiveChatClinicalSummary,
  getEmpatheticFallback,
  HERONCARE_SYSTEM_INSTRUCTION,
  CANDIDATE_MODELS
};
