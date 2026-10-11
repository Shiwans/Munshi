// Local provider: Qwen3.6-35B-A3B in LM Studio (OpenAI-compatible API on the laptop). Same interface as gemma.js.
// Thinking is disabled by prefilling an empty <think></think> assistant turn (the /no_think flag and
// reasoning params do not work in LM Studio; the prefill does → ~1 s to first token).

const URL = () => (process.env.LMSTUDIO_URL || 'http://localhost:1234/v1') + '/chat/completions';
export const MODEL = () => process.env.LOCAL_MODEL || 'qwen/qwen3.6-35b-a3b';

export async function chat({ system, messages, tools = [], images = [] }) {
  const msgs = [{ role: 'system', content: system }];
  messages.forEach((m, i) => {
    const last = i === messages.length - 1 && m.role === 'user';
    if (last && images.length) {
      msgs.push({
        role: 'user',
        content: [
          ...images.map(({ mimeType, base64 }) => ({ type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64}` } })),
          { type: 'text', text: m.text },
        ],
      });
    } else msgs.push({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.text });
  });
  msgs.push({ role: 'assistant', content: '<think>\n\n</think>\n\n' });

  const res = await fetch(URL(), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: MODEL(),
      messages: msgs,
      temperature: 0.1,
      ...(tools.length ? { tools: tools.map((t) => ({ type: 'function', function: t })), tool_choice: 'required' } : {}),
    }),
    signal: AbortSignal.timeout(images.length ? 240000 : 90000),
  });
  if (!res.ok) throw new Error(`lmstudio ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const j = await res.json();
  const msg = j.choices?.[0]?.message || {};
  const toolCalls = (msg.tool_calls || []).map((c) => {
    let args = {};
    try {
      args = typeof c.function.arguments === 'string' ? JSON.parse(c.function.arguments || '{}') : c.function.arguments || {};
    } catch {
      args = {};
    }
    return { name: c.function.name, args };
  });
  const text = String(msg.content || '').replace(/<think>[\s\S]*?<\/think>/g, '').trim();
  return { text, toolCalls, provider: 'local', model: MODEL() };
}
