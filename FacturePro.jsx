import { useState, useRef } from "react";

// ─── UTILS ────────────────────────────────────────────────────────────────────
function buildFilename(extraction, f) {
  const ext = f?.name?.split(".").pop() || "jpg";
  const v = (extraction.vendor||"facture").toLowerCase().normalize("NFD")
    .replace(/[\u0300-\u036f]/g,"").replace(/\s+/g,"-").replace(/[^a-z0-9-]/g,"");
  return `${v}_${(extraction.date||"").replace(/\//g,"-")}.${ext}`;
}

async function analyzeWithAI(file) {
  const base64 = await new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = e => resolve(e.target.result.split(",")[1]);
    reader.readAsDataURL(file);
  });
  const res = await fetch("/api/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image: base64, mediaType: file.type }),
  });
  if (!res.ok) throw new Error("Analyse échouée");
  return res.json();
}

async function sendToComptable({ file, filename, extraction, email }) {
  const base64 = await new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = e => resolve(e.target.result.split(",")[1]);
    reader.readAsDataURL(file);
  });
  const res = await fetch("/api/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image: base64, mediaType: file.type, filename, email, ...extraction }),
  });
  if (!res.ok) throw new Error("Envoi échoué");
}

function groupByDate(items) {
  const now = new Date();
  const today    = now.toDateString();
  const yesterday = new Date(now - 86400000).toDateString();
  const groups = {};
  items.forEach(inv => {
    const d = new Date(inv._ts);
    const ds = d.toDateString();
    let label = ds === today ? "Aujourd'hui" : ds === yesterday ? "Hier" : d.toLocaleDateString("fr-FR",{day:"numeric",month:"long"});
    if (!groups[label]) groups[label] = [];
    groups[label].push(inv);
  });
  return groups;
}

let _id = Date.now();

function loadHistory() {
  try { return JSON.parse(localStorage.getItem("fp_history") || "[]"); } catch { return []; }
}
function saveHistory(h) {
  // previews (base64) sont trop lourds pour localStorage — on les exclut
  try { localStorage.setItem("fp_history", JSON.stringify(h.map(i => ({ ...i, preview: null })))); } catch {}
}

// ─── TOKENS ────────────────────────────────────────────────────────────────────
const C = {
  cream:   "#F8F6F1",
  ink:     "#26221E",
  inkMid:  "#7A7068",
  inkLight:"#B0A898",
  terra:   "#C4603A",   // single accent — terracotta
  terraBg: "rgba(196,96,58,0.08)",
  sep:     "rgba(38,34,30,0.08)",
  white:   "#FFFFFF",
  green:   "#2D7A52",
  greenBg: "#F0F7F3",
  red:     "#B84040",
};

// ─── ICONS ─────────────────────────────────────────────────────────────────────
const Ic = {
  Scan:     (p) => <svg width={p.s||22} height={p.s||22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={p.w||1.7} strokeLinecap="round" strokeLinejoin="round"><path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><rect x="7" y="7" width="10" height="10" rx="1"/></svg>,
  Archive:  (p) => <svg width={p.s||22} height={p.s||22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={p.w||1.7} strokeLinecap="round" strokeLinejoin="round"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></svg>,
  Account:  (p) => <svg width={p.s||22} height={p.s||22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={p.w||1.7} strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
  Send:     (p) => <svg width={p.s||15} height={p.s||15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>,
  Check:    (p) => <svg width={p.s||13} height={p.s||13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>,
  Back:     (p) => <svg width={p.s||18} height={p.s||18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>,
  Pencil:   (p) => <svg width={p.s||12} height={p.s||12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>,
  Clip:     (p) => <svg width={p.s||12} height={p.s||12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>,
  Trash:    (p) => <svg width={p.s||14} height={p.s||14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>,
  Image:    (p) => <svg width={p.s||22} height={p.s||22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>,
};

// ─── SHARED ────────────────────────────────────────────────────────────────────
function Dots({ color = C.terra }) {
  return (
    <div style={{ display:"flex", gap:5, alignItems:"center" }}>
      {[0,150,300].map((d,i) => <span key={i} style={{ width:5, height:5, borderRadius:"50%", background:color, display:"block", animation:"dp 1.2s ease-in-out infinite", animationDelay:`${d}ms` }} />)}
      <style>{`@keyframes dp{0%,80%,100%{opacity:.12}40%{opacity:1}}`}</style>
    </div>
  );
}

function Nav({ tab, set }) {
  const tabs = [
    { id:"scan",    label:"Scanner",  Icon:Ic.Scan },
    { id:"archive", label:"Historique", Icon:Ic.Archive },
    { id:"account", label:"Compte",   Icon:Ic.Account },
  ];
  return (
    <nav style={{
      position:"fixed", bottom:24, left:"50%", transform:"translateX(-50%)",
      width:"calc(100% - 48px)", maxWidth:342,
      background:C.ink, borderRadius:40,
      display:"flex", padding:"10px 8px",
      zIndex:50,
      boxShadow:"0 8px 32px rgba(38,34,30,0.22), 0 2px 8px rgba(38,34,30,0.12)",
    }}>
      {tabs.map(({ id, label, Icon }) => {
        const on = tab === id;
        return (
          <button key={id} onClick={() => set(id)} style={{
            flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:3,
            background: on ? "rgba(255,255,255,0.12)" : "transparent",
            border:"none", cursor:"pointer",
            padding:"8px 0", borderRadius:32,
            transition:"background 0.2s",
          }}>
            <span style={{ color: on ? C.white : "rgba(255,255,255,0.4)", display:"flex" }}><Icon s={20} w={on ? 2 : 1.5} /></span>
            <span style={{ fontSize:10, fontWeight: on ? 700 : 400, color: on ? C.white : "rgba(255,255,255,0.4)", letterSpacing:0.3 }}>{label}</span>
          </button>
        );
      })}
    </nav>
  );
}

function EditField({ label, value, onChange, large }) {
  const [on, setOn] = useState(false);
  const [draft, setDraft] = useState(value);
  if (!on && draft !== value) setDraft(value);
  const done = () => { onChange(draft); setOn(false); };
  return (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding: large ? "15px 0" : "12px 0" }}>
      <span style={{ fontSize:12, color:C.inkLight, minWidth:100, flexShrink:0 }}>{label}</span>
      {on
        ? <input autoFocus value={draft} onChange={e=>setDraft(e.target.value)} onBlur={done} onKeyDown={e=>e.key==="Enter"&&done()} style={{ flex:1, textAlign:"right", border:"none", outline:"none", background:"transparent", fontFamily:"inherit", fontSize: large?28:14, fontWeight: large?700:500, color:C.terra, letterSpacing: large?-1:0, padding:0 }} />
        : <div style={{ display:"flex", alignItems:"center", gap:7, justifyContent:"flex-end" }}>
            <span style={{ fontSize: large?28:14, fontWeight: large?700:500, color: large?C.terra:C.ink, letterSpacing: large?-1:0 }}>{value}</span>
            <button onClick={()=>{setDraft(value);setOn(true);}} style={{ background:"none", border:"none", cursor:"pointer", color:C.inkLight, padding:1, display:"flex" }}><Ic.Pencil s={12} /></button>
          </div>
      }
    </div>
  );
}

// ─── SCAN SCREEN ───────────────────────────────────────────────────────────────
function ScanScreen({ set, email, onSent }) {
  const [phase, setPhase] = useState("vf"); // vf | analyzing | review
  const [preview, setPreview] = useState(null);
  const [file, setFile]   = useState(null);
  const [ex, setEx]       = useState(null);
  const [status, setStatus] = useState("idle"); // idle sending success error
  const [err, setErr]     = useState("");
  const ref = useRef();

  const pick = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    setFile(f);
    const r = new FileReader(); r.onload = ev => setPreview(ev.target.result); r.readAsDataURL(f);
    setPhase("analyzing");
    setEx(await analyzeWithAI(f));
    setPhase("review");
    setStatus("idle");
  };

  const reset = () => { setPhase("vf"); setPreview(null); setFile(null); setEx(null); setStatus("idle"); if(ref.current) ref.current.value=""; };

  const send = async () => {
    if (!email) { setStatus("error"); setErr("Configurez l'email dans Compte."); return; }
    setStatus("sending");
    try {
      const fn = file ? buildFilename(ex, file) : "facture.jpg";
      await sendToComptable({ file, filename:fn, extraction:ex, email });
      onSent({ ...ex, filename:fn, preview, _ts:Date.now() });
      setStatus("success");
      setTimeout(reset, 2600);
    } catch(e) { setStatus("error"); setErr(e.message||"Erreur réseau"); }
  };

  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100vh", fontFamily:"inherit" }}>
      <input ref={ref} type="file" accept="image/*,application/pdf" capture="environment" style={{ display:"none" }} onChange={pick} />

      {/* ── VIEWFINDER ── */}
      {phase === "vf" && (
        <div style={{ flex:1, background:"#0f0d0b", position:"relative", overflow:"hidden" }}>
          {/* Controls — au-dessus de la pill nav */}
          <div style={{
            position:"absolute", bottom:112, left:0, right:0,
            display:"flex", alignItems:"center",
          }}>
            <div style={{ flex:1 }} />
            {/* Shutter — style iOS */}
            <button onClick={()=>ref.current.click()} aria-label="Photographier" style={{
              width:72, height:72, borderRadius:"50%",
              background:"transparent", border:"3px solid rgba(255,255,255,0.9)",
              cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", padding:0,
              flexShrink:0,
            }}>
              <div style={{ width:60, height:60, borderRadius:"50%", background:"rgba(255,255,255,0.95)" }} />
            </button>
            {/* Galerie */}
            <div style={{ flex:1, display:"flex", justifyContent:"center" }}>
              <button onClick={()=>ref.current.click()} style={{
                width:50, height:50, borderRadius:12,
                background:"rgba(255,255,255,0.12)", border:"1.5px solid rgba(255,255,255,0.2)",
                cursor:"pointer", color:"rgba(255,255,255,0.75)",
                display:"flex", alignItems:"center", justifyContent:"center",
              }}><Ic.Image s={22} /></button>
            </div>
          </div>
        </div>
      )}

      {/* ── ANALYZING ── */}
      {phase === "analyzing" && (
        <div style={{ flex:1, background:"#0f0d0b", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:16, position:"relative" }}>
          {preview && <img src={preview} alt="" style={{ position:"absolute", inset:0, width:"100%", height:"100%", objectFit:"cover", opacity:0.15 }} />}
          <Dots />
          <p style={{ fontSize:12, color:C.terra, letterSpacing:2, textTransform:"uppercase", fontWeight:500, margin:0 }}>Lecture du justificatif</p>
        </div>
      )}

      {/* ── REVIEW ── */}
      {phase === "review" && ex && (
        <div style={{ flex:1, overflowY:"auto", background:C.cream, paddingBottom:20 }}>
          {/* header */}
          <div style={{ background:C.white, padding:"16px 20px", display:"flex", alignItems:"center", gap:12, borderBottom:`1px solid ${C.sep}` }}>
            <button onClick={reset} style={{ background:"none", border:"none", cursor:"pointer", color:C.inkMid, padding:0, display:"flex" }}><Ic.Back s={20} /></button>
            <span style={{ fontSize:17, fontWeight:700, color:C.ink, letterSpacing:-0.4 }}>Vérifier &amp; envoyer</span>
          </div>

          {/* object — most prominent */}
          <div style={{ background:C.white, padding:"20px 16px 4px", borderRadius:12, margin:"0 16px" }}>
            <p style={{ fontSize:11, color:C.inkLight, textTransform:"uppercase", letterSpacing:1.2, fontWeight:600, margin:"0 0 2px" }}>Ce que vous avez acheté</p>
            <EditField label="" value={ex.object} onChange={v=>setEx(e=>({...e,object:v}))} large />
          </div>

          {/* details */}
          <div style={{ background:C.white, padding:"0 16px", marginTop:8, borderRadius:12, margin:"8px 16px 0" }}>
            {[["Fournisseur","vendor"],["Date","date"],["Catégorie","cat"]].map(([l,k],i,a)=>(
              <div key={k}>
                <EditField label={l} value={ex[k]} onChange={v=>setEx(e=>({...e,[k]:v}))} />
                {i<a.length-1 && <div style={{ height:"0.5px", background:C.sep }} />}
              </div>
            ))}
          </div>

          {/* amounts */}
          <div style={{ background:C.white, padding:"0 16px", borderRadius:12, margin:"8px 16px 0" }}>
            {[["Montant HT","ht"],["TVA 20%","tva"]].map(([l,k],i)=>(
              <div key={k}>
                <EditField label={l} value={ex[k]} onChange={v=>setEx(e=>({...e,[k]:v}))} />
                {i===0 && <div style={{ height:"0.5px", background:C.sep }} />}
              </div>
            ))}
            <div style={{ height:"0.5px", background:C.sep }} />
            <EditField label="Total TTC" value={ex.ttc} onChange={v=>setEx(e=>({...e,ttc:v}))} large />
          </div>

          {/* file */}
          {preview && (
            <div style={{ background:C.white, margin:"8px 16px 0", borderRadius:12, padding:"13px 16px", display:"flex", alignItems:"center", gap:12 }}>
              <img src={preview} alt="" style={{ width:44, height:44, borderRadius:6, objectFit:"cover", flexShrink:0 }} />
              <div style={{ flex:1, minWidth:0 }}>
                <p style={{ fontSize:12, fontWeight:500, color:C.ink, margin:0, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{file ? buildFilename(ex,file) : "justificatif.jpg"}</p>
                <p style={{ fontSize:11, color:C.inkLight, margin:"2px 0 0" }}>{file ? `${Math.round(file.size/1024)} Ko · en pièce jointe` : "en pièce jointe"}</p>
              </div>
              <Ic.Clip s={13} />
            </div>
          )}

          {/* recipient */}
          <p style={{ padding:"11px 16px 0", fontSize:12, color:C.inkLight, margin:0 }}>
            {email ? <>Destination · <strong style={{ color:C.ink }}>{email}</strong></> : <span style={{ color:C.terra }}>Aucun email — configurez dans Compte</span>}
          </p>

          {/* CTA */}
          <div style={{ padding:"14px 16px 0" }}>
            {status === "idle" && (
              <button onClick={send} style={{ width:"100%", padding:"16px 0", border:"none", borderRadius:12, background:C.ink, color:C.white, fontSize:15, fontWeight:700, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:9, letterSpacing:-0.2 }}>
                <Ic.Send s={15} /> Envoyer à mon comptable
              </button>
            )}
            {status === "sending" && (
              <div style={{ padding:"16px 0", background:C.terraBg, display:"flex", alignItems:"center", justifyContent:"center", gap:10, fontSize:14, color:C.terra, fontWeight:500 }}>
                <Dots /> Transmission en cours…
              </div>
            )}
            {status === "success" && (
              <div style={{ padding:"16px 0", background:C.greenBg, display:"flex", alignItems:"center", justifyContent:"center", gap:9, fontSize:14, color:C.green, fontWeight:600 }}>
                <Ic.Check s={16} /> Justificatif transmis.
              </div>
            )}
            {status === "error" && (
              <div>
                <p style={{ fontSize:13, color:C.red, margin:"0 0 10px" }}>{err}</p>
                <button onClick={send} style={{ width:"100%", padding:"15px 0", border:"none", borderRadius:12, background:C.ink, color:C.white, fontSize:14, fontWeight:700, cursor:"pointer" }}>Réessayer</button>
              </div>
            )}
            {status === "idle" && (
              <button onClick={reset} style={{ width:"100%", marginTop:10, padding:"11px 0", border:"none", borderRadius:12, background:"transparent", fontSize:13, color:C.inkLight, cursor:"pointer" }}>Reprendre</button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── HISTORIQUE SCREEN ────────────────────────────────────────────────────────
function ArchiveScreen({ set, history, onDelete }) {
  const [detail, setDetail] = useState(null);

  // Build list of months from history + always include current month
  const now = new Date();
  const monthKey = inv => {
    const d = new Date(inv._ts);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
  };
  const monthLabel = key => {
    const [y, m] = key.split("-");
    const d = new Date(parseInt(y), parseInt(m)-1, 1);
    const label = d.toLocaleDateString("fr-FR", { month:"long", year:"numeric" });
    return label.charAt(0).toUpperCase() + label.slice(1);
  };
  const currentKey = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}`;
  const allKeys = [...new Set([currentKey, ...history.map(monthKey)])].sort((a,b)=>b.localeCompare(a));
  const [selectedKey, setSelectedKey] = useState(currentKey);
  const selIdx = allKeys.indexOf(selectedKey);

  const monthInvoices = history.filter(i => monthKey(i) === selectedKey);
  const total = monthInvoices.reduce((s,i) => s + (parseFloat(String(i.ttc).replace(/[^\d,.-]/g,"").replace(",",".")) || 0), 0);
  const groups = groupByDate(monthInvoices);

  return (
    <div style={{ display:"flex", flexDirection:"column", minHeight:"100vh", background:C.cream, overflowY:"auto", paddingBottom:110 }}>
      {/* Header with month nav */}
      <div style={{ padding:"52px 20px 20px" }}>
        {/* Month selector */}
        <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:16 }}>
          <button disabled={selIdx >= allKeys.length-1} onClick={()=>setSelectedKey(allKeys[selIdx+1])}
            style={{ background:"none", border:"none", cursor: selIdx >= allKeys.length-1 ? "default":"pointer", color: selIdx >= allKeys.length-1 ? C.inkLight : C.ink, padding:0, display:"flex", opacity: selIdx >= allKeys.length-1 ? 0.3 : 1 }}>
            <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <span style={{ fontSize:15, fontWeight:700, color:C.ink, flex:1, textAlign:"center", letterSpacing:-0.3 }}>{monthLabel(selectedKey)}</span>
          <button disabled={selIdx <= 0} onClick={()=>setSelectedKey(allKeys[selIdx-1])}
            style={{ background:"none", border:"none", cursor: selIdx <= 0 ? "default":"pointer", color: selIdx <= 0 ? C.inkLight : C.ink, padding:0, display:"flex", opacity: selIdx <= 0 ? 0.3 : 1 }}>
            <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
        </div>
        {/* Total */}
        <div style={{ display:"flex", alignItems:"baseline", gap:6 }}>
          <span style={{ fontSize:48, fontWeight:800, color:C.ink, letterSpacing:-2.5, lineHeight:1 }}>{total.toLocaleString("fr-FR",{minimumFractionDigits:2})}</span>
          <span style={{ fontSize:22, fontWeight:500, color:C.inkMid }}>€</span>
        </div>
        <p style={{ fontSize:13, color:C.inkLight, margin:"6px 0 0" }}>{monthInvoices.length} justificatif{monthInvoices.length!==1?"s":""} transmis</p>
      </div>

      {monthInvoices.length === 0 && (
        <p style={{ padding:"0 20px 48px", fontSize:13, color:C.inkLight, lineHeight:1.7, margin:0 }}>
          Aucun justificatif ce mois-ci.
        </p>
      )}

      {Object.entries(groups).map(([label, items]) => (
        <div key={label} style={{ padding:"0 20px 16px" }}>
          <p style={{ fontSize:11, fontWeight:600, color:C.inkLight, textTransform:"uppercase", letterSpacing:0.3, margin:"0 0 8px" }}>{label}</p>
          <div style={{ background:C.white, borderRadius:12, overflow:"hidden" }}>
            {items.map((inv, i) => (
              <div key={inv.id} onClick={()=>setDetail(inv)}
                style={{ display:"flex", alignItems:"flex-start", gap:14, padding:"14px 16px", borderBottom: i < items.length-1 ? `0.5px solid ${C.sep}` : "none", cursor:"pointer" }}>
                <div style={{ flex:1, minWidth:0 }}>
                  <p style={{ fontSize:15, fontWeight:600, color:C.ink, margin:0, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{inv.object || inv.vendor}</p>
                  <p style={{ fontSize:12, color:C.inkLight, margin:"3px 0 0" }}>{inv.vendor} · {inv.date}</p>
                </div>
                <div style={{ textAlign:"right", flexShrink:0 }}>
                  <p style={{ fontSize:16, fontWeight:700, color:C.terra, margin:0, letterSpacing:-0.3 }}>{inv.ttc}</p>
                  <p style={{ fontSize:10, color:C.green, margin:"3px 0 0", display:"flex", alignItems:"center", gap:3, justifyContent:"flex-end" }}><Ic.Check s={9} /> transmis</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* Detail sheet */}
      {detail && (
        <div style={{ position:"fixed", inset:0, background:"rgba(38,34,30,0.5)", zIndex:200, display:"flex", alignItems:"flex-end", justifyContent:"center" }} onClick={()=>setDetail(null)}>
          <div onClick={e=>e.stopPropagation()} style={{ background:C.white, width:"100%", maxWidth:390, borderRadius:"12px 12px 0 0", paddingBottom:40, maxHeight:"90vh", overflowY:"auto" }}>
            <div style={{ width:32, height:3, background:C.sep, margin:"14px auto 0", borderRadius:2 }} />

            {detail.preview
              ? <img src={detail.preview} alt="" style={{ width:"100%", maxHeight:200, objectFit:"cover", display:"block", marginTop:14 }} />
              : <div style={{ height:80, background:C.cream, marginTop:14, display:"flex", alignItems:"center", justifyContent:"center", fontSize:32 }}>🧾</div>
            }

            <div style={{ padding:"4px 20px 0" }}>
              {/* big object */}
              <p style={{ fontSize:22, fontWeight:800, color:C.ink, letterSpacing:-0.5, margin:"16px 0 4px" }}>{detail.object || detail.vendor}</p>
              <p style={{ fontSize:13, color:C.inkLight, margin:"0 0 16px" }}>{detail.vendor} · {detail.date}</p>

              <div style={{ borderTop:`1px solid ${C.sep}` }}>
                {[["Catégorie",detail.cat],["Montant HT",detail.ht],["TVA",detail.tva]].map(([k,v])=>(
                  <div key={k} style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline", padding:"12px 0", borderBottom:`0.5px solid ${C.sep}` }}>
                    <span style={{ fontSize:12, color:C.inkLight }}>{k}</span>
                    <span style={{ fontSize:14, fontWeight:500, color:C.ink }}>{v}</span>
                  </div>
                ))}
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"14px 0" }}>
                  <span style={{ fontSize:13, color:C.inkMid, fontWeight:500 }}>Total TTC</span>
                  <span style={{ fontSize:26, fontWeight:800, color:C.terra, letterSpacing:-0.8 }}>{detail.ttc}</span>
                </div>
              </div>

              {detail.filename && (
                <p style={{ fontSize:11, color:C.inkLight, display:"flex", alignItems:"center", gap:6, margin:"0 0 16px" }}>
                  <Ic.Clip s={11} /> {detail.filename}
                </p>
              )}

              <button onClick={()=>{onDelete(detail.id);setDetail(null);}} style={{ width:"100%", padding:"14px 0", border:`1px solid ${C.sep}`, borderRadius:12, background:"transparent", fontSize:13, fontWeight:500, cursor:"pointer", color:C.red, display:"flex", alignItems:"center", justifyContent:"center", gap:7, marginBottom:4 }}>
                <Ic.Trash s={14} /> Supprimer de l'archive
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── ACCOUNT SCREEN ────────────────────────────────────────────────────────────
function AccountScreen({ set, email, onSave }) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [draft, setDraft] = useState(email);
  const [saved, setSaved] = useState(false);

  const openSheet = () => { setDraft(email); setSheetOpen(true); setSaved(false); };
  const closeSheet = () => { setSheetOpen(false); setSaved(false); };
  const save = () => { onSave(draft.trim()); setSaved(true); setTimeout(() => { setSheetOpen(false); setSaved(false); }, 1400); };

  const Row = ({ label, sub, right, sep=true }) => (
    <div style={{ paddingTop:14, paddingBottom:14, borderBottom: sep ? `0.5px solid ${C.sep}` : "none", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
      <div>
        <p style={{ fontSize:14, color:C.ink, margin:0 }}>{label}</p>
        {sub && <p style={{ fontSize:11, color:C.inkLight, margin:"2px 0 0" }}>{sub}</p>}
      </div>
      {right}
    </div>
  );

  return (
    <div style={{ display:"flex", flexDirection:"column", minHeight:"100vh", background:C.cream, overflowY:"auto", paddingBottom:110 }}>
      <div style={{ padding:"52px 20px 20px" }}>
        <p style={{ fontSize:28, fontWeight:800, color:C.ink, letterSpacing:-0.8, margin:0 }}>Mon compte</p>
      </div>

      <div style={{ padding:"0 20px" }}>
        <p style={{ fontSize:11, fontWeight:600, color:C.inkLight, textTransform:"uppercase", letterSpacing:0.3, margin:"0 0 10px" }}>Comptable</p>
        <div style={{ background:C.white, borderRadius:12, padding:"0 16px" }}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", paddingTop:14, paddingBottom:14 }}>
            <div style={{ flex:1, minWidth:0, marginRight:12 }}>
              <p style={{ fontSize:13, color:C.inkLight, margin:"0 0 3px" }}>Email</p>
              <p style={{ fontSize:14, fontWeight:500, color:C.ink, margin:0, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>
                {email || <span style={{ color:C.inkLight }}>Non configuré</span>}
              </p>
            </div>
            <button onClick={openSheet} style={{ flexShrink:0, padding:"7px 14px", borderRadius:8, border:`1px solid ${C.sep}`, background:C.cream, fontSize:13, fontWeight:500, color:C.ink, cursor:"pointer", fontFamily:"inherit" }}>
              Modifier
            </button>
          </div>
        </div>

        <p style={{ fontSize:11, fontWeight:600, color:C.inkLight, textTransform:"uppercase", letterSpacing:0.3, margin:"24px 0 10px" }}>Application</p>
        <div style={{ background:C.white, padding:"0 16px", borderRadius:12 }}>
          <Row label="Version" right={<span style={{ fontSize:13, color:C.inkLight }}>1.0.0</span>} />
          <Row label="Stack" right={<span style={{ fontSize:11, color:C.inkLight }}>React · Claude Vision · SendGrid</span>} sep={false} />
        </div>
      </div>

      {/* Bottom sheet */}
      {sheetOpen && (
        <div style={{ position:"fixed", inset:0, background:"rgba(38,34,30,0.5)", zIndex:200, display:"flex", alignItems:"flex-end", justifyContent:"center" }} onClick={closeSheet}>
          <div onClick={e=>e.stopPropagation()} style={{ background:C.white, width:"100%", maxWidth:390, borderRadius:"16px 16px 0 0", padding:"0 0 40px" }}>
            <div style={{ width:32, height:3, background:C.sep, margin:"14px auto 20px", borderRadius:2 }} />

            <div style={{ padding:"0 20px" }}>
              <p style={{ fontSize:17, fontWeight:700, color:C.ink, letterSpacing:-0.4, margin:"0 0 4px" }}>Email du comptable</p>
              <p style={{ fontSize:13, color:C.inkLight, margin:"0 0 20px" }}>Chaque justificatif lui sera transmis immédiatement après scan.</p>

              <input
                autoFocus
                type="email"
                value={draft}
                onChange={e => setDraft(e.target.value)}
                onKeyDown={e => e.key === "Enter" && save()}
                placeholder="comptable@cabinet.fr"
                style={{
                  width:"100%", boxSizing:"border-box",
                  border:`1.5px solid ${C.sep}`, borderRadius:10,
                  padding:"13px 14px", fontSize:15, color:C.ink,
                  background:C.cream, fontFamily:"inherit", outline:"none",
                  marginBottom:14,
                }}
              />

              {saved
                ? <div style={{ padding:"15px 0", borderRadius:12, background:C.greenBg, display:"flex", alignItems:"center", justifyContent:"center", gap:8, fontSize:14, color:C.green, fontWeight:600 }}>
                    <Ic.Check s={15} /> Enregistré
                  </div>
                : <button onClick={save} style={{ width:"100%", padding:"15px 0", border:"none", borderRadius:12, background:C.ink, color:C.white, fontSize:15, fontWeight:700, cursor:"pointer", fontFamily:"inherit" }}>
                    Enregistrer
                  </button>
              }

              <button onClick={closeSheet} style={{ width:"100%", marginTop:10, padding:"12px 0", border:"none", background:"transparent", fontSize:13, color:C.inkLight, cursor:"pointer", fontFamily:"inherit" }}>
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── ROOT ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [tab, setTab]     = useState("scan");
  const [email, setEmail] = useState(() => localStorage.getItem("fp_email") || "");
  const [history, setHist] = useState(() => loadHistory());

  const onSent = inv => setHist(h => {
    const next = [{ ...inv, id: ++_id }, ...h];
    saveHistory(next);
    return next;
  });
  const onDel = id => setHist(h => {
    const next = h.filter(i => i.id !== id);
    saveHistory(next);
    return next;
  });
  const onSaveEmail = val => {
    setEmail(val);
    localStorage.setItem("fp_email", val);
  };

  return (
    <>
      <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
      <div style={{ fontFamily:"'IBM Plex Sans', system-ui, sans-serif", maxWidth:390, margin:"0 auto", background:C.cream, minHeight:"100vh" }}>
        {tab === "scan"    && <ScanScreen    set={setTab} email={email} onSent={onSent} />}
        {tab === "archive" && <ArchiveScreen set={setTab} history={history} onDelete={onDel} />}
        {tab === "account" && <AccountScreen set={setTab} email={email} onSave={onSaveEmail} />}
        <Nav tab={tab} set={setTab} />
      </div>
    </>
  );
}
