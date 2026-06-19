import { useState, useRef, useEffect } from "react";

const SYSTEM_PROMPT = `# EMAIL BUILDER — Instrucciones del Agente

Sos un asistente especializado en construir emails HTML listos para enviar por Sendy + Amazon SES. Tu nombre es **Email Builder**.

## Tu comportamiento

Cuando el usuario inicie una conversación, seguís este flujo paso a paso. No adelantes pasos, no pidas todo junto. Guiá al usuario de a un paso por vez, de forma clara y amigable.

---

## PASO 1 — Bienvenida y elección de estilo

Presentate brevemente y mostrá los 3 estilos disponibles:

\`\`\`
👋 Hola! Soy tu Email Builder para Sendy.

¿Qué estilo de email querés crear?

1️⃣  MINIMALISTA — Solo texto + logo opcional + CTA. Máxima entregabilidad, peso mínimo.
2️⃣  CON IMAGEN HERO — Imagen destacada arriba, texto y CTA. Impacto visual inmediato.
3️⃣  CON VIDEO — Texto + thumbnail clicable de video (YouTube/Vimeo). Ideal para contenido audiovisual.

Escribí 1, 2 o 3 para elegir.
\`\`\`

---

## PASO 2 — Recopilar contenido según el estilo elegido

### Si eligió estilo 1 (Minimalista):
Pedí en este orden, de a uno:
1. Asunto del email
2. Texto completo del email (decile que pegue el texto plano, sin formato)
3. ¿Tiene logo? Si sí, pedí la URL de la imagen
4. ¿Quiere botón CTA? Si sí, pedí texto del botón y URL destino

### Si eligió estilo 2 (Con imagen hero):
Pedí en este orden, de a uno:
1. Asunto del email
2. Texto completo del email
3. URL de la imagen hero (recomendado: 600×300px mínimo, JPG o PNG)
4. ¿Tiene logo? Si sí, pedí la URL
5. ¿Quiere botón CTA? Si sí, pedí texto del botón y URL destino

### Si eligió estilo 3 (Con video):
Pedí en este orden, de a uno:
1. Asunto del email
2. Texto completo del email
3. URL de la imagen thumbnail del video
4. URL del video (YouTube o Vimeo)
5. ¿Tiene logo? Si sí, pedí la URL
6. ¿Quiere botón CTA? Si sí, pedí texto del botón y URL destino

---

## PASO 3 — Confirmación antes de generar

Antes de generar, mostrá un resumen de lo que vas a construir:

\`\`\`
✅ Perfecto, tengo todo. Voy a generar:

• Estilo: [nombre del estilo]
• Asunto: [asunto]
• Logo: [sí con URL / no]
• Imagen hero: [URL / no aplica]
• Video: [URL / no aplica]
• CTA: ["texto del botón" → URL / no]

¿Arrancamos? (sí / corregir algo)
\`\`\`

---

## PASO 4 — Generación del HTML

Una vez confirmado, generá el email HTML siguiendo estas instrucciones técnicas al pie de la letra:

### Instrucciones técnicas obligatorias:

**Estructura:**
- Email HTML real basado en tablas, NO una landing page
- Contenedor de 600px de ancho aproximado
- Diseño responsive básico con meta viewport y media queries mínimas y seguras

**Código limpio — NUNCA incluir:**
- JavaScript
- Formularios embebidos
- iframes o embeds
- Video embebido
- Animaciones complejas
- Librerías externas
- Trackers, píxeles custom innecesarios
- Comentarios en exceso
- CSS redundante o inflado
- Archivos externos no esenciales

**Compatibilidad:**
- Compatible con Gmail, Outlook y Apple Mail
- Estilos inline donde sea necesario
- Evitar técnicas que rompen en Outlook (no usar CSS box model avanzado, no usar flexbox, no usar grid)
- Tipografías seguras: Arial, Georgia, Verdana, con fallback definido

**Buenas prácticas:**
- Alt text en todas las imágenes
- El email debe ser legible aunque las imágenes no carguen
- Jerarquía clara: encabezado → cuerpo → CTA → cierre
- Buen espaciado y texto legible

**Para estilo 2 (imagen hero):**
- Imagen al tope del contenedor, 100% del ancho del contenedor (max 600px), con alt text

**Para estilo 3 (video thumbnail):**
- Imagen del thumbnail con un ícono de play superpuesto (▶), todo dentro de un \`<a>\` que linkea al video
- No usar video embebido ni JavaScript

---

## PASO 5 — Entrega del resultado

Entregá el resultado en este orden exacto:

### 📋 Estructura elegida
[Breve explicación de 3-5 líneas sobre la estructura y decisiones técnicas tomadas]

---

### 💻 HTML completo

\`\`\`html
[HTML completo desde <!DOCTYPE hasta </html>]
\`\`\`

---

### ✅ Checklist de deliverability

- ✓ Sin JavaScript
- ✓ Sin iframes ni embeds
- ✓ Sin librerías externas
- ✓ Estilos inline para compatibilidad
- ✓ Alt text en imágenes
- ✓ Tipografías seguras con fallback
- ✓ Compatible con Outlook (estructura de tablas)
- ✓ Compatible con Gmail y Apple Mail
- ✓ Peso razonable, código limpio
- ✓ Listo para Sendy + Amazon SES

---

## PASO 6 — Cierre

Después de entregar el resultado, preguntá:

\`\`\`
¿Querés ajustar algo del HTML, o empezamos un nuevo email?
\`\`\`

Si pide ajustes, aplicalos y volvé a entregar el HTML completo corregido.
Si quiere un nuevo email, volvé al PASO 1.

---

## Reglas generales de comportamiento

- Siempre guiá de a un paso. No adelantes preguntas.
- Sé directo y claro. No uses lenguaje corporativo ni exagerado.
- Si el usuario pega texto con formato raro, usalo igual y ordenalo bien en el HTML.
- Si falta algún dato importante, pedilo antes de generar.
- El HTML que generés debe estar siempre completo y listo para copiar y pegar en Sendy sin modificaciones.`;

function parseMarkdown(text) {
  const lines = text.split("\n");
  const result = [];
  let i = 0;
  let inCodeBlock = false;
  let codeLines = [];
  let codeLang = "";

  while (i < lines.length) {
    const line = lines[i];

    if (line.startsWith("```")) {
      if (!inCodeBlock) {
        inCodeBlock = true;
        codeLang = line.slice(3).trim();
        codeLines = [];
      } else {
        inCodeBlock = false;
        result.push({ type: "code", lang: codeLang, content: codeLines.join("\n") });
        codeLines = [];
        codeLang = "";
      }
      i++;
      continue;
    }

    if (inCodeBlock) {
      codeLines.push(line);
      i++;
      continue;
    }

    if (line.startsWith("### ")) {
      result.push({ type: "h3", content: line.slice(4) });
    } else if (line.startsWith("## ")) {
      result.push({ type: "h2", content: line.slice(3) });
    } else if (line.startsWith("# ")) {
      result.push({ type: "h1", content: line.slice(2) });
    } else if (line.startsWith("---")) {
      result.push({ type: "hr" });
    } else if (line.trim() === "") {
      result.push({ type: "br" });
    } else {
      result.push({ type: "p", content: line });
    }
    i++;
  }

  return result;
}

function renderInline(text) {
  // Bold
  text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  // Italic
  text = text.replace(/\*(.+?)\*/g, '<em>$1</em>');
  // Inline code
  text = text.replace(/`(.+?)`/g, '<code style="background:#1e293b;padding:1px 6px;border-radius:4px;font-size:0.85em;color:#7dd3fc">$1</code>');
  // Links
  text = text.replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" style="color:#38bdf8;text-decoration:underline">$1</a>');
  // Bullets
  text = text.replace(/^[-•]\s+/, '• ');
  // Checkmarks
  text = text.replace(/^✓\s+/, '✓ ');
  return text;
}

function CodeBlock({ content, lang }) {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div style={{ position: "relative", margin: "12px 0" }}>
      <div style={{
        background: "#0f172a",
        border: "1px solid #1e293b",
        borderRadius: "8px",
        overflow: "hidden"
      }}>
        {lang && (
          <div style={{
            padding: "6px 14px",
            background: "#1e293b",
            fontSize: "11px",
            color: "#64748b",
            fontFamily: "monospace",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center"
          }}>
            <span>{lang}</span>
            <button
              onClick={copy}
              style={{
                background: "none",
                border: "none",
                color: copied ? "#4ade80" : "#64748b",
                cursor: "pointer",
                fontSize: "11px",
                padding: "2px 6px",
                borderRadius: "4px",
                transition: "color 0.2s"
              }}
            >
              {copied ? "✓ copiado" : "copiar"}
            </button>
          </div>
        )}
        <pre style={{
          margin: 0,
          padding: "14px 16px",
          overflowX: "auto",
          fontSize: "12.5px",
          lineHeight: "1.6",
          color: "#e2e8f0",
          fontFamily: "'Fira Code', 'Cascadia Code', 'Courier New', monospace",
          maxHeight: lang === "html" ? "360px" : "none",
          whiteSpace: "pre-wrap",
          wordBreak: "break-all"
        }}>
          {content}
        </pre>
        {lang === "html" && (
          <div style={{
            borderTop: "1px solid #1e293b",
            padding: "8px 14px",
            display: "flex",
            gap: "8px"
          }}>
            <button
              onClick={copy}
              style={{
                background: "#1d4ed8",
                border: "none",
                color: "white",
                cursor: "pointer",
                fontSize: "12px",
                padding: "6px 14px",
                borderRadius: "6px",
                fontWeight: "600",
                transition: "background 0.2s"
              }}
            >
              {copied ? "✓ Copiado!" : "📋 Copiar HTML"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function MessageBubble({ msg }) {
  if (msg.role === "user") {
    return (
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "12px" }}>
        <div style={{
          background: "#1d4ed8",
          color: "white",
          padding: "10px 16px",
          borderRadius: "18px 18px 4px 18px",
          maxWidth: "75%",
          fontSize: "14px",
          lineHeight: "1.5",
          whiteSpace: "pre-wrap"
        }}>
          {msg.content}
        </div>
      </div>
    );
  }

  const blocks = parseMarkdown(msg.content);

  return (
    <div style={{ display: "flex", justifyContent: "flex-start", marginBottom: "16px" }}>
      <div style={{
        background: "#1e293b",
        border: "1px solid #334155",
        padding: "14px 18px",
        borderRadius: "4px 18px 18px 18px",
        maxWidth: "85%",
        fontSize: "14px",
        lineHeight: "1.6",
        color: "#e2e8f0"
      }}>
        {blocks.map((block, i) => {
          if (block.type === "code") return <CodeBlock key={i} content={block.content} lang={block.lang} />;
          if (block.type === "hr") return <hr key={i} style={{ border: "none", borderTop: "1px solid #334155", margin: "10px 0" }} />;
          if (block.type === "br") return <div key={i} style={{ height: "6px" }} />;
          if (block.type === "h1") return <div key={i} style={{ fontSize: "17px", fontWeight: "700", color: "#f1f5f9", marginBottom: "4px" }} dangerouslySetInnerHTML={{ __html: renderInline(block.content) }} />;
          if (block.type === "h2") return <div key={i} style={{ fontSize: "15px", fontWeight: "700", color: "#cbd5e1", marginBottom: "3px" }} dangerouslySetInnerHTML={{ __html: renderInline(block.content) }} />;
          if (block.type === "h3") return <div key={i} style={{ fontSize: "13px", fontWeight: "600", color: "#94a3b8", marginBottom: "2px" }} dangerouslySetInnerHTML={{ __html: renderInline(block.content) }} />;
          return <div key={i} style={{ marginBottom: "2px" }} dangerouslySetInnerHTML={{ __html: renderInline(block.content) }} />;
        })}
      </div>
    </div>
  );
}

export default function EmailBuilder() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [started, setStarted] = useState(false);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const callClaude = async (history) => {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4000,
        system: SYSTEM_PROMPT,
        messages: history
      })
    });
    const data = await response.json();
    return data.content?.map(b => b.text || "").join("") || "Error al obtener respuesta.";
  };

  const start = async () => {
    setStarted(true);
    setLoading(true);
    const reply = await callClaude([{ role: "user", content: "Hola" }]);
    setMessages([
      { role: "user", content: "Hola" },
      { role: "assistant", content: reply }
    ]);
    setLoading(false);
    inputRef.current?.focus();
  };

  const send = async () => {
    if (!input.trim() || loading) return;
    const userMsg = { role: "user", content: input.trim() };
    const newHistory = [...messages, userMsg];
    setMessages(newHistory);
    setInput("");
    setLoading(false);
    setLoading(true);
    const reply = await callClaude(newHistory);
    setMessages([...newHistory, { role: "assistant", content: reply }]);
    setLoading(false);
    inputRef.current?.focus();
  };

  const handleKey = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  const reset = () => {
    setMessages([]);
    setStarted(false);
    setInput("");
  };

  return (
    <div style={{
      minHeight: "100vh",
      background: "#020817",
      display: "flex",
      flexDirection: "column",
      fontFamily: "'Segoe UI', system-ui, sans-serif",
      color: "#e2e8f0"
    }}>
      {/* Header */}
      <div style={{
        padding: "14px 20px",
        borderBottom: "1px solid #1e293b",
        display: "flex",
        alignItems: "center",
        gap: "12px",
        background: "#0f172a"
      }}>
        <div style={{
          width: "36px", height: "36px",
          background: "linear-gradient(135deg, #1d4ed8, #7c3aed)",
          borderRadius: "10px",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: "18px"
        }}>✉️</div>
        <div>
          <div style={{ fontWeight: "700", fontSize: "15px", color: "#f1f5f9" }}>Email Builder</div>
          <div style={{ fontSize: "11px", color: "#64748b" }}>Sendy + Amazon SES · HTML listo para enviar</div>
        </div>
        {started && (
          <button onClick={reset} style={{
            marginLeft: "auto",
            background: "none",
            border: "1px solid #334155",
            color: "#64748b",
            cursor: "pointer",
            fontSize: "12px",
            padding: "4px 12px",
            borderRadius: "6px"
          }}>
            ↺ Reiniciar
          </button>
        )}
      </div>

      {/* Messages */}
      <div style={{
        flex: 1,
        overflowY: "auto",
        padding: "20px 16px",
        maxWidth: "760px",
        width: "100%",
        margin: "0 auto",
        boxSizing: "border-box"
      }}>
        {!started ? (
          <div style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            height: "60vh",
            gap: "20px",
            textAlign: "center"
          }}>
            <div style={{ fontSize: "48px" }}>✉️</div>
            <div>
              <div style={{ fontSize: "22px", fontWeight: "700", color: "#f1f5f9", marginBottom: "8px" }}>
                Email Builder para Sendy
              </div>
              <div style={{ fontSize: "14px", color: "#64748b", maxWidth: "360px" }}>
                Generá emails HTML listos para enviar por Sendy + Amazon SES. Minimalistas, con imagen hero o con video.
              </div>
            </div>
            <button
              onClick={start}
              style={{
                background: "linear-gradient(135deg, #1d4ed8, #7c3aed)",
                border: "none",
                color: "white",
                cursor: "pointer",
                fontSize: "15px",
                fontWeight: "600",
                padding: "12px 28px",
                borderRadius: "10px",
                transition: "opacity 0.2s"
              }}
            >
              Empezar →
            </button>
          </div>
        ) : (
          <>
            {messages.map((msg, i) => (
              <MessageBubble key={i} msg={msg} />
            ))}
            {loading && (
              <div style={{ display: "flex", justifyContent: "flex-start", marginBottom: "12px" }}>
                <div style={{
                  background: "#1e293b",
                  border: "1px solid #334155",
                  padding: "12px 18px",
                  borderRadius: "4px 18px 18px 18px",
                  fontSize: "20px",
                  letterSpacing: "4px"
                }}>
                  <span style={{ animation: "pulse 1s infinite" }}>···</span>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </>
        )}
      </div>

      {/* Input */}
      {started && (
        <div style={{
          padding: "12px 16px",
          borderTop: "1px solid #1e293b",
          background: "#0f172a",
          maxWidth: "760px",
          width: "100%",
          margin: "0 auto",
          boxSizing: "border-box"
        }}>
          <div style={{ display: "flex", gap: "8px", alignItems: "flex-end" }}>
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKey}
              disabled={loading}
              placeholder="Escribí tu respuesta… (Enter para enviar)"
              rows={1}
              style={{
                flex: 1,
                background: "#1e293b",
                border: "1px solid #334155",
                borderRadius: "10px",
                color: "#e2e8f0",
                fontSize: "14px",
                padding: "10px 14px",
                resize: "none",
                outline: "none",
                fontFamily: "inherit",
                lineHeight: "1.5",
                maxHeight: "120px",
                overflowY: "auto"
              }}
              onInput={e => {
                e.target.style.height = "auto";
                e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
              }}
            />
            <button
              onClick={send}
              disabled={loading || !input.trim()}
              style={{
                background: loading || !input.trim() ? "#1e293b" : "linear-gradient(135deg, #1d4ed8, #7c3aed)",
                border: "none",
                color: loading || !input.trim() ? "#475569" : "white",
                cursor: loading || !input.trim() ? "not-allowed" : "pointer",
                fontSize: "18px",
                width: "42px",
                height: "42px",
                borderRadius: "10px",
                transition: "all 0.2s",
                flexShrink: 0
              }}
            >
              ↑
            </button>
          </div>
          <div style={{ fontSize: "11px", color: "#334155", marginTop: "6px", textAlign: "center" }}>
            Shift+Enter para nueva línea
          </div>
        </div>
      )}
    </div>
  );
}
