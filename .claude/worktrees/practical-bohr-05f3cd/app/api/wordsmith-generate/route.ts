import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { getGeminiApiKey } from '@/app/api/gemini-key/route';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const apiKey = getGeminiApiKey(req);
  if (!apiKey) {
    return NextResponse.json(
      { error: 'No Gemini API key found. Please set one in Settings.' },
      { status: 401 }
    );
  }

  try {
    const { prompt } = await req.json();

    if (!prompt) {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });
    }

    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
    });

    const text = response.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    return NextResponse.json({ text });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal Server Error';
    console.error('Wordsmith generate error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
