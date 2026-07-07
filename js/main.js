/* ============ MYGLORD MUSS — CINEMATIC PORTFOLIO ============ */

gsap.registerPlugin(ScrollTrigger);

/* ---------- API HELPERS (no-op gracefully on static hosting) ---------- */
const api = {
  async get(path) {
    try { const r = await fetch(path); return r.ok ? r.json() : null; } catch { return null; }
  },
  async post(path, body) {
    try {
      const r = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      return { ok: r.ok, data: await r.json().catch(() => ({})) };
    } catch { return { ok: false, data: {} }; }
  },
  track(event, meta) {
    try {
      navigator.sendBeacon(
        "/api/track",
        new Blob([JSON.stringify({ event, meta })], { type: "application/json" })
      );
    } catch { /* static hosting — ignore */ }
  },
};

/* ---------- CMS CONTENT HYDRATION ---------- */
async function hydrateContent() {
  const c = await api.get("/api/content");
  if (!c) return;
  const sub = document.getElementById("heroSubtitle");
  if (c.heroSubtitle) sub.textContent = c.heroSubtitle;
  const statEls = document.querySelectorAll(".stat");
  (c.stats || []).forEach((s, i) => {
    const el = statEls[i];
    if (!el) return;
    const num = el.querySelector(".stat__num");
    num.dataset.count = s.value;
    num.dataset.decimals = s.decimals || 0;
    num.dataset.prefix = s.prefix || "";
    num.dataset.suffix = s.suffix || "";
    el.querySelector(".stat__label").textContent = s.label;
  });
  const pillarEls = document.querySelectorAll(".pillar");
  (c.pillars || []).forEach((p, i) => {
    const el = pillarEls[i];
    if (!el) return;
    el.querySelector(".pillar__title").innerHTML = p.title.replace(/\n/g, "<br/>");
    el.querySelector(".pillar__desc").textContent = p.desc;
  });
  const cardEls = document.querySelectorAll(".card");
  (c.projects || []).forEach((p, i) => {
    const el = cardEls[i];
    if (!el) return;
    el.querySelector(".card__title").textContent = p.title;
    el.querySelector(".card__pitch").textContent = p.pitch;
  });
  if (c.finaleSub) document.querySelector(".finale__sub").textContent = c.finaleSub;
}

/* ---------- FORMS ---------- */
function initForms() {
  const contactForm = document.getElementById("contactForm");
  const contactStatus = document.getElementById("contactStatus");
  contactForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = document.getElementById("cfName").value.trim();
    const email = document.getElementById("cfEmail").value.trim();
    const message = document.getElementById("cfMessage").value.trim();
    if (!name || !email || !message) {
      contactStatus.textContent = "PLEASE FILL IN ALL FIELDS";
      contactStatus.className = "form-status err";
      return;
    }
    contactStatus.textContent = "SENDING…";
    contactStatus.className = "form-status";
    const res = await api.post("/api/contact", { name, email, message });
    if (res.ok) {
      contactStatus.textContent = "MESSAGE SENT — I'LL GET BACK TO YOU SOON";
      contactStatus.className = "form-status ok";
      contactForm.reset();
    } else {
      contactStatus.textContent = "COULDN'T SEND — EMAIL ME AT MUSSGRAPH@GMAIL.COM";
      contactStatus.className = "form-status err";
    }
  });

  const subscribeForm = document.getElementById("subscribeForm");
  const subscribeStatus = document.getElementById("subscribeStatus");
  subscribeForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = document.getElementById("subEmail").value.trim();
    const res = await api.post("/api/subscribe", { email });
    if (res.ok) {
      subscribeStatus.textContent = "YOU'RE IN — WATCH YOUR INBOX";
      subscribeStatus.className = "form-status ok";
      subscribeForm.reset();
    } else {
      subscribeStatus.textContent = "PLEASE ENTER A VALID EMAIL";
      subscribeStatus.className = "form-status err";
    }
  });
}

/* ---------- ACTIVITY TRACKING ---------- */
function initTracking() {
  api.track("pageview", { path: location.pathname, ref: document.referrer || null });
  const seen = new Set();
  const io = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      if (en.isIntersecting && !seen.has(en.target.id)) {
        seen.add(en.target.id);
        api.track("section_view", { section: en.target.id });
      }
    });
  }, { threshold: 0.25 });
  ["hero", "stats", "pillars", "work", "finale", "contact", "subscribe"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) io.observe(el);
  });
  document.querySelectorAll(".card").forEach((card) => {
    card.addEventListener("click", () =>
      api.track("project_click", { project: card.querySelector(".card__title").textContent })
    );
  });
  document.querySelectorAll(".finale__actions .btn").forEach((btn) => {
    btn.addEventListener("click", () => api.track("cta_click", { cta: btn.textContent.trim() }));
  });
}

/* ---------- LENIS SMOOTH SCROLL ---------- */
const lenis = new Lenis({
  duration: 1.15,
  smoothWheel: true,
});
window.lenis = lenis;
lenis.on("scroll", ScrollTrigger.update);
gsap.ticker.add((time) => lenis.raf(time * 1000));
gsap.ticker.lagSmoothing(0);

/* ---------- HERO FRAME SEQUENCE ---------- */
const FRAME_COUNT = window.HERO_FRAME_COUNT || 0; // set by frames.js manifest
const FRAME_PATH = (i) =>
  `assets/frames/hero/frame_${String(i + 1).padStart(4, "0")}.jpg`;

const canvas = document.getElementById("orbitCanvas");
const ctx = canvas.getContext("2d");
const images = new Array(FRAME_COUNT);
const frameState = { frame: 0 };
let loadedCount = 0;

const loaderEl = document.getElementById("loader");
const loaderFill = document.getElementById("loaderFill");
const loaderPct = document.getElementById("loaderPct");

function sizeCanvas() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = canvas.clientWidth * dpr;
  canvas.height = canvas.clientHeight * dpr;
  drawFrame(frameState.frame);
}

function drawFrame(index) {
  const img = images[Math.round(index)];
  if (!img || !img.complete || !img.naturalWidth) return;
  const cw = canvas.width;
  const ch = canvas.height;
  const scale = Math.max(cw / img.naturalWidth, ch / img.naturalHeight);
  const w = img.naturalWidth * scale;
  const h = img.naturalHeight * scale;
  ctx.clearRect(0, 0, cw, ch);
  ctx.drawImage(img, (cw - w) / 2, (ch - h) / 2, w, h);
}

function preloadFrames() {
  return new Promise((resolve) => {
    if (FRAME_COUNT === 0) {
      // No frames yet — paint a placeholder void so the site still runs
      resolve();
      return;
    }
    for (let i = 0; i < FRAME_COUNT; i++) {
      const img = new Image();
      img.src = FRAME_PATH(i);
      img.onload = img.onerror = () => {
        loadedCount++;
        const pct = Math.round((loadedCount / FRAME_COUNT) * 100);
        loaderFill.style.width = pct + "%";
        loaderPct.textContent = pct + "%";
        if (loadedCount === 1) drawFrame(0);
        if (loadedCount === FRAME_COUNT) resolve();
      };
      images[i] = img;
    }
  });
}

/* ---------- INTRO + SCROLL CHOREOGRAPHY ---------- */
function splitChars(el) {
  const text = el.textContent;
  el.textContent = "";
  return [...text].map((ch) => {
    const span = document.createElement("span");
    span.className = "char";
    span.textContent = ch;
    el.appendChild(span);
    return span;
  });
}

function initSite() {
  loaderEl.classList.add("done");
  sizeCanvas();

  const chars1 = splitChars(document.getElementById("titleLine1"));
  const chars2 = splitChars(document.getElementById("titleLine2"));
  const allChars = [...chars1, ...chars2];

  /* Intro: letters track in letter-by-letter */
  gsap.from(allChars, {
    yPercent: 120,
    opacity: 0,
    rotateX: -50,
    stagger: 0.045,
    duration: 1.1,
    ease: "power4.out",
    delay: 0.25,
  });
  gsap.from("#heroEyebrow, #heroSubtitle", {
    opacity: 0,
    y: 24,
    duration: 1,
    stagger: 0.15,
    delay: 0.9,
    ease: "power3.out",
  });

  /* Hero scrub: frame sequence tied to scroll */
  if (FRAME_COUNT > 0) {
    gsap.to(frameState, {
      frame: FRAME_COUNT - 1,
      snap: "frame",
      ease: "none",
      scrollTrigger: {
        trigger: "#hero",
        start: "top top",
        end: "bottom bottom",
        scrub: 0.35,
      },
      onUpdate: () => drawFrame(frameState.frame),
    });
  }

  /* Title drifts apart + fades as the orbit plays */
  gsap.timeline({
    scrollTrigger: {
      trigger: "#hero",
      start: "top top",
      end: "60% bottom",
      scrub: true,
    },
  })
    .to(chars1, { yPercent: -60, opacity: 0, stagger: 0.02, ease: "power1.in" }, 0)
    .to(chars2, { yPercent: 60, opacity: 0, stagger: 0.02, ease: "power1.in" }, 0.05)
    .to("#heroSubtitle, #heroEyebrow, #scrollCue", { opacity: 0, ease: "none" }, 0);

  /* Stats count-up */
  document.querySelectorAll(".stat__num").forEach((el) => {
    const target = parseFloat(el.dataset.count);
    const decimals = parseInt(el.dataset.decimals || "0", 10);
    const prefix = el.dataset.prefix || "";
    const suffix = el.dataset.suffix || "";
    const obj = { val: 0 };
    gsap.to(obj, {
      val: target,
      duration: 1.8,
      ease: "power2.out",
      scrollTrigger: { trigger: el, start: "top 85%" },
      onUpdate: () => {
        el.textContent = prefix + obj.val.toFixed(decimals) + suffix;
      },
    });
    gsap.from(el, {
      y: 40, opacity: 0, duration: 0.8, ease: "power3.out",
      scrollTrigger: { trigger: el, start: "top 88%" },
    });
  });

  /* Pillars: three offers reveal one at a time over The Builder clip */
  const pillars = gsap.utils.toArray(".pillar");
  const pillarsTl = gsap.timeline({
    scrollTrigger: {
      trigger: "#pillars",
      start: "top top",
      end: "bottom bottom",
      scrub: 0.5,
    },
  });
  pillars.forEach((p, i) => {
    pillarsTl.fromTo(
      p,
      { autoAlpha: 0, y: 90, skewY: 3 },
      { autoAlpha: 1, y: 0, skewY: 0, duration: 0.8, ease: "power2.out" },
      i * 2.4
    );
    if (i < pillars.length - 1) {
      // fully out (ends i*2.4+2.2) before the next enters at (i+1)*2.4
      pillarsTl.to(p, { autoAlpha: 0, y: -90, duration: 0.7, ease: "power2.in" }, i * 2.4 + 1.5);
    }
  });

  /* Videos play only while on screen */
  [["#pillars", "#builderVideo"], ["#work", "#closerVideo"]].forEach(([sec, vid]) => {
    const video = document.querySelector(vid);
    ScrollTrigger.create({
      trigger: sec,
      start: "top bottom",
      end: "bottom top",
      onEnter: () => video.play().catch(() => {}),
      onEnterBack: () => video.play().catch(() => {}),
      onLeave: () => video.pause(),
      onLeaveBack: () => video.pause(),
    });
  });

  /* Work heading + cards reveal */
  gsap.from(".work__heading", {
    y: 80, opacity: 0, duration: 1, ease: "power3.out",
    scrollTrigger: { trigger: ".work__heading", start: "top 80%" },
  });
  gsap.from(".card", {
    y: 100, opacity: 0, stagger: 0.15, duration: 0.9, ease: "power3.out",
    scrollTrigger: { trigger: ".work__cards", start: "top 82%" },
  });

  /* Finale kinetic title */
  gsap.from("#finaleTitle", {
    scale: 0.7, opacity: 0, duration: 1.2, ease: "power3.out",
    scrollTrigger: { trigger: "#finale", start: "top 65%" },
  });
  gsap.from(".finale__sub, .finale__actions", {
    y: 40, opacity: 0, stagger: 0.15, duration: 0.9, ease: "power3.out",
    scrollTrigger: { trigger: "#finale", start: "top 55%" },
  });

  /* Smooth in-page anchors through Lenis */
  document.querySelectorAll('a[href^="#"]').forEach((a) => {
    a.addEventListener("click", (e) => {
      e.preventDefault();
      lenis.scrollTo(a.getAttribute("href"), { duration: 2 });
    });
  });

  window.addEventListener("resize", sizeCanvas);
  ScrollTrigger.refresh();
}

Promise.all([preloadFrames(), hydrateContent()]).then(() => {
  initSite();
  initForms();
  initTracking();
});
