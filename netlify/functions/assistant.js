const SYSTEM_PROMPT = `You are an internal IT help desk assistant for Akwa Group employees.
- Reply in Moroccan Darija if the user writes in Darija, in French if the user writes in French, and in English if the user writes in English.
- Be practical, clear, concise, and action-oriented.
- Do not mention tickets unless the user asks.
- If the problem is a TPE/APOS connection issue or DOMS error, reply ONLY with: FLOW:tpe_connexion`;

const TPE_CONNEXION_KEYWORDS = [
  'tpe',
  'apos',
  'doms',
  'pas de connexion',
  'erreur doms',
  'message doms',
  'connexion tpe',
  'tpe bloqu',
  'terminal de paiement'
];

function json(statusCode, payload) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  };
}

function normalize(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function shouldTriggerFlow(message) {
  const lower = normalize(message);
  return TPE_CONNEXION_KEYWORDS.some((keyword) => lower.includes(normalize(keyword)));
}

async function callGemini({ message, imageBase64, imageMimeType }) {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('Missing GEMINI_API_KEY');
  }

  const parts = [
    {
      text: `${SYSTEM_PROMPT}\n\nUser message: ${message || '(no text provided)'}`
    }
  ];

  if (imageBase64) {
    parts.push({
      inline_data: {
        mime_type: imageMimeType || 'image/png',
        data: imageBase64
      }
    });
    parts.push({
      text: "Analyse aussi l'image si elle contient un écran, une erreur, un TPE, un PDA ou un message technique. Si l'image montre une erreur DOMS ou un problème de connexion TPE/APOS, réponds uniquement par FLOW:tpe_connexion."
    });
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts }],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 500
        }
      })
    }
  );

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error?.message || 'Gemini error');
  }

  const reply = data?.candidates?.[0]?.content?.parts
    ?.map((part) => part.text || '')
    .join('\n')
    .trim();

  if (!reply) throw new Error('Gemini empty response');
  return reply;
}

async function callGroq(message) {
  if (!process.env.GROQ_API_KEY) {
    throw new Error('Missing GROQ_API_KEY');
  }

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.GROQ_API_KEY}`
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      temperature: 0.3,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: message }
      ]
    })
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error?.message || 'Groq error');
  }

  const reply = data?.choices?.[0]?.message?.content?.trim();
  if (!reply) throw new Error('Groq empty response');
  return reply;
}

async function callHuggingFace(message) {
  if (!process.env.HF_API_KEY) {
    throw new Error('Missing HF_API_KEY');
  }

  const response = await fetch('https://router.huggingface.co/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.HF_API_KEY}`
    },
    body: JSON.stringify({
      model: 'HuggingFaceH4/zephyr-7b-beta',
      temperature: 0.3,
      max_tokens: 500,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: message }
      ]
    })
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error || data?.message || 'Hugging Face error');
  }

  const reply = data?.choices?.[0]?.message?.content?.trim();
  if (!reply) throw new Error('Hugging Face empty response');
  return reply;
}

exports.handler = async function(event) {
  if (event.httpMethod !== 'POST') {
    return json(405, { reply: 'Method not allowed.' });
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const message = String(body.message || '').trim();
    const imageBase64 = body.imageBase64 ? String(body.imageBase64) : '';
    const imageMimeType = body.imageMimeType ? String(body.imageMimeType) : 'image/png';

    if (!message && !imageBase64) {
      return json(400, { reply: 'Message vide.' });
    }

    if (shouldTriggerFlow(message)) {
      return json(200, {
        type: 'flow',
        flowKey: 'tpe_connexion',
        reply: "Je lance le guide pas à pas pour l'erreur de connexion TPE."
      });
    }

    let reply = '';

    try {
      reply = await callGemini({ message, imageBase64, imageMimeType });
    } catch (geminiError) {
      console.error('Gemini failed:', geminiError.message);

      if (imageBase64) {
        return json(200, {
          reply: "L'analyse d'image n'est pas disponible pour le moment. Réessaie dans quelques instants ou envoie le texte de l'erreur."
        });
      }

      try {
        reply = await callGroq(message);
      } catch (groqError) {
        console.error('Groq failed:', groqError.message);
        reply = await callHuggingFace(message);
      }
    }

    if (String(reply).trim() === 'FLOW:tpe_connexion' || shouldTriggerFlow(reply)) {
      return json(200, {
        type: 'flow',
        flowKey: 'tpe_connexion',
        reply: "Je lance le guide pas à pas pour l'erreur de connexion TPE."
      });
    }

    return json(200, { reply });
  } catch (error) {
    console.error('Assistant error:', error);
    return json(500, { reply: 'Erreur assistant.' });
  }
};
