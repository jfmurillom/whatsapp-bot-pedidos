// Edge Function: whatsapp-webhook
// Verifica el webhook, interpreta el mensaje con IA, y responde por WhatsApp

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);

  // --- Verificación del webhook (GET) ---
  if (req.method === "GET") {
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    const VERIFY_TOKEN = Deno.env.get("WHATSAPP_VERIFY_TOKEN");

    if (mode === "subscribe" && token === VERIFY_TOKEN) {
      return new Response(challenge, { status: 200 });
    }
    return new Response("Verificación fallida", { status: 403 });
  }

  // --- Mensajes entrantes (POST) ---
  if (req.method === "POST") {
    try {
      const body = await req.json();
      const value = body?.entry?.[0]?.changes?.[0]?.value;
      const message = value?.messages?.[0];

      if (message?.type === "text") {
        const from = message.from;
        const text = message.text.body;
        const phoneNumberId = value.metadata.phone_number_id;

        console.log(`Mensaje de ${from}: ${text}`);

        const respuesta = await interpretarConIA(text);
        await enviarWhatsApp(phoneNumberId, from, respuesta);
      }
    } catch (err) {
      console.error("Error procesando mensaje:", err);
    }

    // Meta necesita un 200 rápido, siempre, aunque algo falle internamente
    return new Response("EVENT_RECEIVED", { status: 200 });
  }

  return new Response("Método no soportado", { status: 405 });
});

async function interpretarConIA(texto: string): Promise<string> {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey!,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 300,
      messages: [
        {
          role: "user",
          content:
            `Eres el asistente de pedidos de un negocio por WhatsApp. ` +
            `El cliente escribió: "${texto}". ` +
            `Responde breve y amable, en español, confirmando el pedido si tiene producto y cantidad claros, ` +
            `o pidiendo el dato que falte si no está completo.`,
        },
      ],
    }),
  });

  const data = await response.json();
  return data?.content?.[0]?.text ?? "Gracias por tu mensaje, en breve te contactamos.";
}

async function enviarWhatsApp(phoneNumberId: string, to: string, texto: string) {
  const token = Deno.env.get("WHATSAPP_ACCESS_TOKEN");

  await fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      text: { body: texto },
    }),
  });
}
