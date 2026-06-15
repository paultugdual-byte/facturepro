export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  try {
    const { image, mediaType } = req.body;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-opus-4-5",
        max_tokens: 1024,
        messages: [{
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: mediaType || "image/jpeg", data: image },
            },
            {
              type: "text",
              text: `Analyse cette facture ou ce reçu et extrais les informations suivantes.
Réponds UNIQUEMENT avec un objet JSON valide, sans markdown, sans explication.

{
  "object": "Description courte de ce qui a été acheté (ex: Déjeuner client, Plein de carburant, Matériel informatique)",
  "vendor": "Nom du fournisseur / commerce",
  "date": "Date en français (ex: 21 mai 2026)",
  "cat": "Catégorie parmi: Repas, Carburant, Matériel, Transport, Hébergement, Fournitures, Autre",
  "ht": "Montant HT avec € (ex: 74,92 €). Si absent, calcule depuis TTC et TVA.",
  "tva": "Montant TVA avec € (ex: 14,98 €). Si absent, laisse vide.",
  "ttc": "Montant TTC avec € (ex: 89,90 €)"
}

Si une information est absente ou illisible, mets une chaîne vide "".`,
            },
          ],
        }],
      }),
    });

    const data = await response.json();
    const text = data.content?.[0]?.text || "{}";
    const clean = text.replace(/```json|```/g, "").trim();
    const result = JSON.parse(clean);

    res.status(200).json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
