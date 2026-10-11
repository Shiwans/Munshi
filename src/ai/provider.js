// The only AI entry point the bot uses. chat({system, messages, tools, images}) → {text, toolCalls, provider, fellBack}
// MUNSHI_PROVIDER=gemma (default) | local. If Gemma fails, retry once on the local model.

const load = (name) => (name === 'local' ? import('./local.js') : import('./gemma.js'));

export function providerName() {
  return process.env.MUNSHI_PROVIDER === 'local' ? 'local' : 'gemma';
}

export async function chat(req) {
  const primary = providerName();
  try {
    const p = await load(primary);
    return { ...(await p.chat(structuredClone(req))), fellBack: false }; // SDKs may mutate the request
  } catch (err) {
    if (primary === 'local' || process.env.MUNSHI_FALLBACK === 'off') throw err;
    console.error(`[provider] gemma failed (${err.message?.slice(0, 160)}), trying local`);
    try {
      const p = await load('local');
      return { ...(await p.chat(structuredClone(req))), fellBack: true };
    } catch (err2) {
      console.error(`[provider] local failed too (${err2.message?.slice(0, 160)})`);
      throw err;
    }
  }
}
