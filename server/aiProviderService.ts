/**
 * Provider-agnostic AI service.
 *
 * Fallback chain (in order):
 *   1. Gemini key 1  (GEMINI_API_KEY)    — Google AI Studio free tier, 1500 req/day
 *   2. Gemini key 2  (GEMINI_API_KEY_2)  — Second key doubles the daily limit
 *   3. xAI Grok      (GROK_API_KEY)      — Grok-4-fast, OpenAI-compatible API
 *   4. Groq          (GROQ_API_KEY)      — Last resort, Llama 3.3 70B, 14400 req/day
 *
 * Switching is fully automatic — no manual intervention needed.
 * Every response includes which provider handled it for the UI badge.
 */

import { GoogleGenAI } from "@google/genai";
import { logger } from "./logger.ts";

export interface AIMessage {
  role: "user" | "assistant";
  content: string;
}

export type AIProvider = "gemini" | "gemini2" | "grok" | "groq" | "none";

export interface AIResponse {
  text: string;
  provider: AIProvider;
}

const GEMINI_MODEL = "gemini-3-flash-preview";
const GROK_MODEL   = "grok-4-1-fast";           // xAI Grok (api.x.ai)
const GROQ_MODEL   = "llama-3.3-70b-versatile"; // Groq (api.groq.com) — last resort

async function tryGemini(messages: AIMessage[], systemPrompt: string, apiKey: string): Promise<string> {
  try {
    const ai = new GoogleGenAI({ apiKey });

    const contents = messages.map(m => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }]
    }));

    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents,
      config: {
        systemInstruction: systemPrompt,
        maxOutputTokens: 1024,
        temperature: 0.7
      }
    });

    const text = response.text;
    if (!text) throw new Error("Gemini returned empty response");
    return text;
  } catch (err: any) {
    logger.error("ai_gemini_failed", { key: apiKey.substring(0, 8) + "...", error: err.message, stack: err.stack });
    // If 404, it might be the model name. Log it clearly.
    if (err.message?.includes('404') || err.message?.includes('not found')) {
      logger.error('gemini_model_not_found', { model: GEMINI_MODEL, error: err.message });
    }
    throw err;
  }
}

async function tryOpenAICompat(
  messages: AIMessage[],
  systemPrompt: string,
  apiKey: string,
  apiUrl: string,
  model: string,
  providerName: string
): Promise<string> {
  try {
    const payload = {
      model,
      messages: [
        { role: "system", content: systemPrompt },
        ...messages.map(m => ({ role: m.role, content: m.content }))
      ],
      max_tokens: 1024,
      temperature: 0.7,
      stream: false
    };

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`${providerName} API error ${response.status}: ${err}`);
    }

    const data: any = await response.json();
    const text = data.choices?.[0]?.message?.content;
    if (!text) throw new Error(`${providerName} returned empty response`);
    return text;
  } catch (err: any) {
    logger.error(`${providerName.toLowerCase()}_failed`, { error: err.message, stack: err.stack });
    throw err;
  }
}

/**
 * Send a chat message through the best available AI provider.
 * Tries each provider in order, falling through on any error.
 */
export async function chat(messages: AIMessage[], systemPrompt: string): Promise<AIResponse> {
  // 1. Gemini key 1
  const geminiKey1 = process.env.GEMINI_API_KEY;
  if (geminiKey1) {
    try {
      const text = await tryGemini(messages, systemPrompt, geminiKey1);
      logger.info("ai_provider_used", { provider: "gemini (key 1)" });
      return { text, provider: "gemini" };
    } catch (err: any) {
      logger.warn("ai_gemini_key1_failed", { error: err.message });
    }
  }

  // 2. Gemini key 2 (doubles daily rate limit)
  const geminiKey2 = process.env.GEMINI_API_KEY_2;
  if (geminiKey2) {
    try {
      const text = await tryGemini(messages, systemPrompt, geminiKey2);
      logger.info("ai_provider_used", { provider: "gemini (key 2)" });
      return { text, provider: "gemini2" };
    } catch (err: any) {
      logger.warn("ai_gemini_key2_failed", { error: err.message });
    }
  }

  // 3. xAI Grok
  const grokKey = process.env.GROK_API_KEY;
  if (grokKey) {
    try {
      const text = await tryOpenAICompat(
        messages, systemPrompt, grokKey,
        "https://api.x.ai/v1/chat/completions",
        GROK_MODEL, "xAI Grok"
      );
      logger.info("ai_provider_used", { provider: "xAI Grok" });
      return { text, provider: "grok" };
    } catch (err: any) {
      logger.warn("ai_grok_failed", { error: err.message });
    }
  }

  // 4. Groq (last resort)
  const groqKey = process.env.GROQ_API_KEY;
  if (groqKey) {
    try {
      const text = await tryOpenAICompat(
        messages, systemPrompt, groqKey,
        "https://api.groq.com/openai/v1/chat/completions",
        GROQ_MODEL, "Groq"
      );
      logger.info("ai_provider_used", { provider: "Groq" });
      return { text, provider: "groq" };
    } catch (err: any) {
      logger.warn("ai_groq_failed", { error: err.message });
    }
  }

  // No providers available
  logger.warn("ai_no_provider_available", {});
  return {
    text: "No AI provider is available. Check that `GEMINI_API_KEY` or `GROK_API_KEY` is set in your `.env` file and is valid.",
    provider: "none"
  };
}
