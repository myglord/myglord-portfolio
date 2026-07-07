/* ============ MM ADMIN DASHBOARD ============ */

let TOKEN = sessionStorage.getItem("mm_admin_token") || "";

const $ = (sel) => document.querySelector(sel);

async function apiCall(path, method = "GET", body) {
  const res = await fetch(path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401 && path !== "/api/admin/login") { logout(); throw new Error("unauthorized"); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function fmtWhen(iso) {
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

/* ---------- auth ---------- */
function showDash() {
  $("#loginView").classList.add("hidden");
  $("#dashView").classList.remove("hidden");
  loadOverview();
}
function logout() {
  TOKEN = "";
  sessionStorage.removeItem("mm_admin_token");
  $("#dashView").classList.add("hidden");
  $("#loginView").classList.remove("hidden");
}

$("#loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    const { token } = await apiCall("/api/admin/login", "POST", { password: $("#loginPassword").value });
    TOKEN = token;
    sessionStorage.setItem("mm_admin_token", token);
    showDash();
  } catch {
    $("#loginStatus").textContent = "WRONG PASSWORD";
  }
});
$("#logoutBtn").addEventListener("click", logout);

/* ---------- tabs ---------- */
const loaders = {
  overview: loadOverview,
  messages: loadMessages,
  subscribers: loadSubscribers,
  broadcast: loadBroadcast,
  content: loadContent,
};
document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t === tab));
    document.querySelectorAll(".panel").forEach((p) => p.classList.add("hidden"));
    $(`#panel-${tab.dataset.tab}`).classList.remove("hidden");
    loaders[tab.dataset.tab]();
  });
});

/* ---------- overview ---------- */
async function loadOverview() {
  const o = await apiCall("/api/admin/overview");
  $("#overviewCards").innerHTML = `
    <div class="kcard"><div class="kcard__num">${o.totals.events}</div><div class="kcard__lbl">TOTAL EVENTS</div></div>
    <div class="kcard"><div class="kcard__num">${o.counts.pageview || 0}</div><div class="kcard__lbl">PAGE VIEWS</div></div>
    <div class="kcard"><div class="kcard__num">${o.totals.subscribers}</div><div class="kcard__lbl">SUBSCRIBERS</div></div>
    <div class="kcard"><div class="kcard__num">${o.totals.messages}</div><div class="kcard__lbl">CONTACT MESSAGES</div></div>`;
  $("#eventCards").innerHTML = Object.entries(o.counts)
    .sort((a, b) => b[1] - a[1])
    .map(([ev, n]) => `<div class="kcard"><div class="kcard__num">${n}</div><div class="kcard__lbl">${esc(ev.toUpperCase())}</div></div>`)
    .join("") || '<p class="empty">No activity yet.</p>';
  $("#activityTable tbody").innerHTML = o.recent
    .map((a) => `<tr><td class="dim">${fmtWhen(a.at)}</td><td>${esc(a.event)}</td><td class="dim">${esc(JSON.stringify(a.meta))}</td></tr>`)
    .join("") || '<tr><td colspan="3" class="empty">No activity yet.</td></tr>';
}

/* ---------- messages ---------- */
async function loadMessages() {
  const msgs = await apiCall("/api/admin/messages");
  $("#messagesList").innerHTML = msgs.length
    ? msgs.map((m) => `
      <div class="msg">
        <div class="msg__head">
          <span class="msg__from">${esc(m.name)} — <a href="mailto:${esc(m.email)}">${esc(m.email)}</a></span>
          <span class="msg__when">${fmtWhen(m.at)}</span>
        </div>
        <p class="msg__body">${esc(m.message)}</p>
      </div>`).join("")
    : '<p class="empty">No messages yet.</p>';
}

/* ---------- subscribers ---------- */
async function loadSubscribers() {
  const subs = await apiCall("/api/admin/subscribers");
  $("#subsTable tbody").innerHTML = subs.length
    ? subs.map((s) => `
      <tr>
        <td>${esc(s.email)}</td>
        <td class="dim">${fmtWhen(s.at)}</td>
        <td><button class="del" data-email="${esc(s.email)}">REMOVE</button></td>
      </tr>`).join("")
    : '<tr><td colspan="3" class="empty">No subscribers yet.</td></tr>';
  document.querySelectorAll("#subsTable .del").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await apiCall(`/api/admin/subscribers/${encodeURIComponent(btn.dataset.email)}`, "DELETE");
      loadSubscribers();
    });
  });
}

/* ---------- broadcast ---------- */
async function loadBroadcast() {
  const o = await apiCall("/api/admin/overview");
  $("#smtpHint").innerHTML = o.smtpConfigured
    ? `Email is configured. Broadcasts go to all ${o.totals.subscribers} subscriber(s); contact messages are forwarded to <b>${esc(o.contactTo)}</b>.`
    : `⚠️ Email is <b>not configured yet</b>. Add <code>GMAIL_USER</code> and <code>GMAIL_APP_PASSWORD</code> to the <code>.env</code> file and restart the server. Until then, broadcasts can't be sent (messages are still stored).`;
  const past = await apiCall("/api/admin/broadcasts");
  $("#broadcastsList").innerHTML = past.length
    ? past.map((b) => `
      <div class="msg">
        <div class="msg__head">
          <span class="msg__from">${esc(b.subject)}</span>
          <span class="msg__when">${fmtWhen(b.at)} — sent ${b.sent}, failed ${b.failed}</span>
        </div>
        <p class="msg__body">${esc(b.body)}</p>
      </div>`).join("")
    : '<p class="empty">No broadcasts sent yet.</p>';
}

$("#broadcastForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const st = $("#bcStatus");
  st.textContent = "SENDING…"; st.className = "status";
  try {
    const r = await apiCall("/api/admin/broadcast", "POST", {
      subject: $("#bcSubject").value.trim(),
      body: $("#bcBody").value.trim(),
    });
    st.textContent = r.note ? "NO SUBSCRIBERS YET" : `SENT TO ${r.sent} SUBSCRIBER(S)${r.failed ? `, ${r.failed} FAILED` : ""}`;
    st.className = "status ok";
    loadBroadcast();
  } catch (err) {
    st.textContent = err.message.toUpperCase();
    st.className = "status err";
  }
});

/* ---------- content editor ---------- */
let CONTENT = null;

async function loadContent() {
  CONTENT = await apiCall("/api/admin/content");
  $("#ctHeroSubtitle").value = CONTENT.heroSubtitle || "";
  $("#ctFinaleSub").value = CONTENT.finaleSub || "";
  $("#ctStats").innerHTML = CONTENT.stats.map((s, i) => `
    <div class="row row--stat">
      <input class="input" data-k="stats.${i}.value" type="number" step="any" value="${esc(s.value)}" title="Value" />
      <input class="input" data-k="stats.${i}.prefix" type="text" value="${esc(s.prefix || "")}" placeholder="$" title="Prefix" />
      <input class="input" data-k="stats.${i}.suffix" type="text" value="${esc(s.suffix || "")}" placeholder="K+" title="Suffix" />
      <input class="input" data-k="stats.${i}.decimals" type="number" min="0" max="2" value="${esc(s.decimals || 0)}" title="Decimals" />
      <input class="input" data-k="stats.${i}.label" type="text" value="${esc(s.label)}" title="Label" />
    </div>`).join("");
  $("#ctPillars").innerHTML = CONTENT.pillars.map((p, i) => `
    <div class="row row--two">
      <textarea class="input area" data-k="pillars.${i}.title" rows="2" title="Title">${esc(p.title)}</textarea>
      <textarea class="input area" data-k="pillars.${i}.desc" rows="2" title="Description">${esc(p.desc)}</textarea>
    </div>`).join("");
  $("#ctProjects").innerHTML = CONTENT.projects.map((p, i) => `
    <div class="row row--two">
      <input class="input" data-k="projects.${i}.title" type="text" value="${esc(p.title)}" title="Title" />
      <input class="input" data-k="projects.${i}.pitch" type="text" value="${esc(p.pitch)}" title="Pitch" />
    </div>`).join("");
}

$("#contentForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const st = $("#contentStatus");
  const c = JSON.parse(JSON.stringify(CONTENT));
  c.heroSubtitle = $("#ctHeroSubtitle").value;
  c.finaleSub = $("#ctFinaleSub").value;
  document.querySelectorAll("#contentForm [data-k]").forEach((input) => {
    const [arr, i, key] = input.dataset.k.split(".");
    let v = input.value;
    if (input.type === "number") v = parseFloat(v) || 0;
    c[arr][+i][key] = v;
  });
  try {
    await apiCall("/api/admin/content", "PUT", c);
    st.textContent = "SAVED — LIVE ON THE SITE NOW";
    st.className = "status ok";
    CONTENT = c;
  } catch (err) {
    st.textContent = err.message.toUpperCase();
    st.className = "status err";
  }
});

/* ---------- boot ---------- */
if (TOKEN) {
  apiCall("/api/admin/overview").then(showDash).catch(logout);
}
