// Gemma 4 through the Gemini API (@google/genai). Reads text and diary photos; function calling.

import { GoogleGenAI, ThinkingLevel, FunctionCallingConfigMode } from '@google/genai';

let ai = null;
const client = () => {
  if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY missing in .env');
  return (ai ||= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }));
};

export const MODEL = () => process.env.GEMMA_MODEL || 'gemma-4-26b-a4b-it';

// messages: [{ role: 'user'|'assistant', text }]; images go on the last user turn.
export async function chat({ system, messages, tools = [], images = [] }) {
  const contents = messages.map((m, i) => {
    const parts = [];
    if (i === messages.length - 1 && m.role === 'user') {
      for (const { mimeType, base64 } of images) parts.push({ inlineData: { mimeType, data: base64 } });
    }
    parts.push({ text: m.text });
    return { role: m.role === 'assistant' ? 'model' : 'user', parts };
  });

  const res = await client().models.generateContent({
    model: MODEL(),
    contents,
    config: {
      systemInstruction: system,
      // AUTO, not ANY: forcing a call made Gemma drop fields (customer, qty). Free-text numbers are blocked in handler.js.
      ...(tools.length ? { tools: [{ functionDeclarations: tools }], toolConfig: { functionCallingConfig: { mode: FunctionCallingConfigMode.AUTO } } } : {}),
      thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
      temperature: 0.1,
    },
  });

  const toolCalls = (res.functionCalls || []).map((fc) => ({ name: fc.name, args: fc.args || {} }));
  let text = '';
  try {
    text = (res.candidates?.[0]?.content?.parts || [])
      .filter((p) => p.text && !p.thought)
      .map((p) => p.text)
      .join('');
  } catch {
    text = '';
  }
  return { text: text.trim(), toolCalls, provider: 'gemma', model: MODEL() };
}
