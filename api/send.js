export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  try {
    const { image, mediaType, filename, email, object, vendor, date, cat, ht, tva, ttc } = req.body;

    const html = `
<div style="font-family: system-ui, sans-serif; max-width: 480px; color: #26221E;">
  <h2 style="font-size: 20px; margin: 0 0 4px;">${object || vendor}</h2>
  <p style="color: #7A7068; margin: 0 0 24px;">${vendor} · ${date}</p>
  <table style="width: 100%; border-collapse: collapse;">
    <tr><td style="padding: 10px 0; border-bottom: 1px solid #eee; color: #7A7068;">Catégorie</td><td style="text-align: right; padding: 10px 0; border-bottom: 1px solid #eee;">${cat}</td></tr>
    <tr><td style="padding: 10px 0; border-bottom: 1px solid #eee; color: #7A7068;">Montant HT</td><td style="text-align: right; padding: 10px 0; border-bottom: 1px solid #eee;">${ht}</td></tr>
    <tr><td style="padding: 10px 0; border-bottom: 1px solid #eee; color: #7A7068;">TVA</td><td style="text-align: right; padding: 10px 0; border-bottom: 1px solid #eee;">${tva}</td></tr>
    <tr><td style="padding: 12px 0; font-weight: 700;">Total TTC</td><td style="text-align: right; padding: 12px 0; font-size: 20px; font-weight: 700; color: #C4603A;">${ttc}</td></tr>
  </table>
  <p style="margin-top: 24px; font-size: 12px; color: #B0A898;">
    Justificatif transmis via FacturePro · Photo originale en pièce jointe
  </p>
</div>`;

    const body = {
      from: "FacturePro <onboarding@resend.dev>",
      to: [email],
      subject: `Justificatif · ${object || vendor} · ${ttc}`,
      html,
    };

    if (image) {
      body.attachments = [{
        filename: filename || "justificatif.jpg",
        content: image,
        type: mediaType || "image/jpeg",
        disposition: "attachment",
      }];
    }

    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.RESEND_API_KEY}`,
      },
      body: JSON.stringify(body),
    });

    if (!resendRes.ok) {
      const err = await resendRes.text();
      throw new Error(`Resend error: ${err}`);
    }

    res.status(200).json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
