export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!process.env.OPENAI_API_KEY) {
    return res.status(503).json({ error: 'AI checker is not configured yet.' });
  }

  const { word, sentence } = req.body || {};
  const target = String(word || '').trim();
  const text = String(sentence || '').trim();

  if (!target || !text) {
    return res.status(400).json({ error: 'Word and sentence are required.' });
  }

  // Never send obviously incomplete answers to the model as a passing attempt.
  const tokens = text.split(/\s+/).filter(Boolean);
  if (tokens.length < 4) {
    return res.status(200).json({
      pass: false,
      target_spelled_correctly: text.toLowerCase().includes(target.toLowerCase()),
      target_used_correctly: false,
      natural: false,
      corrected_sentence: '',
      note: 'Write a complete sentence, not only the vocabulary word.'
    });
  }

  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-5-mini',
        store: false,
        input: [
          {
            role: 'system',
            content: [
              {
                type: 'input_text',
                text: 'You are an English vocabulary tutor for a B2-C1 learner. Judge a learner sentence using a required target word. Ignore capitalization and minor punctuation. PASS only when the target word itself is spelled correctly, is used with the correct meaning and grammar, and the whole sentence is a complete, reasonably natural English sentence. A fragment, the target word alone, or an unnatural/incorrect use must fail. Give a concise correction note. If the sentence is already natural and correct, corrected_sentence should repeat it and note should say it is natural.'
              }
            ]
          },
          {
            role: 'user',
            content: [
              {
                type: 'input_text',
                text: `Target word: ${target}\nLearner sentence: ${text}`
              }
            ]
          }
        ],
        text: {
          format: {
            type: 'json_schema',
            name: 'sentence_review',
            strict: true,
            schema: {
              type: 'object',
              additionalProperties: false,
              properties: {
                pass: { type: 'boolean' },
                target_spelled_correctly: { type: 'boolean' },
                target_used_correctly: { type: 'boolean' },
                natural: { type: 'boolean' },
                corrected_sentence: { type: 'string' },
                note: { type: 'string' }
              },
              required: [
                'pass',
                'target_spelled_correctly',
                'target_used_correctly',
                'natural',
                'corrected_sentence',
                'note'
              ]
            }
          }
        }
      })
    });

    if (!response.ok) {
      const detail = await response.text();
      console.error('OpenAI error:', detail);
      return res.status(502).json({ error: 'AI sentence check failed.' });
    }

    const data = await response.json();
    const outputText = data.output_text ||
      data.output?.flatMap(x => x.content || []).find(x => x.type === 'output_text')?.text;

    if (!outputText) {
      return res.status(502).json({ error: 'AI sentence check returned no result.' });
    }

    const review = JSON.parse(outputText);
    return res.status(200).json(review);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'AI sentence check failed.' });
  }
}
