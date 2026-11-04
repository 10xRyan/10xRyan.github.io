/* =====================================================================
   Visual editor for your website
   ---------------------------------------------------------------------
   Open your site with #edit at the end of the address, for example:
       https://yourname.github.io/#edit
   Then click text to type, click photos to replace them, hover blocks
   to duplicate / move / delete, and press Publish when you're done.
   Visitors never load this file.
   ===================================================================== */
(function () {
  "use strict";
  if (window.__siteEditor) return;
  window.__siteEditor = true;

  const doc = document;
  const root = doc.documentElement;

  /* ---------- What can be edited ---------- */

  // Text you can click and type into
  const TEXT_SELECTOR = [
    "h1", "h2", "h3", "p", "blockquote", "figcaption", "li", "cite",
    ".btn", ".text-link", ".menu > a", ".dropdown > a", ".dropdown-panel strong",
    ".dropdown-panel small", ".brand-name", ".brand-mark",
    ".badge", ".tag", ".course-code", ".course-term", ".pub-year", ".pub-title",
    ".t-date", ".stat-num", ".stat-label", ".book-label", ".book-title",
    ".book-author", ".float-card small", ".float-card strong", ".email",
    ".contact-links a", ".footer a", ".card-num", ".filter"
  ].join(",");

  // Blocks that can be duplicated, moved and deleted (innermost wins)
  const BLOCK_SELECTOR = [
    ".cards-3 > .card", ".pubs > li", ".timeline > li", ".courses > .course",
    ".stats > .stat", ".gallery > .g", ".tags > li", ".checks > li",
    ".affiliations li", ".contact-links > a", ".hero-actions > a",
    ".hero-meta > li", ".menu > a", ".dropdown-panel > a", ".float-card",
    ".testimonial", ".filters > .filter"
  ].join(",");
  const SECTION_SELECTOR = "main > section";

  // Things you click to swap a picture
  const IMAGE_TARGETS = ".portrait, .gallery .g";

  const BLOCK_CHILDREN = "div, p, h1, h2, h3, ol, ul, figure, blockquote";
  const UI = "[data-editor]";

  const state = {
    pendingImages: new Map(), // repo path -> dataURL
    history: [],
    dirty: false,
    hoverTarget: null,
    activeLink: null,
  };

  /* ---------- Editor styles ---------- */
  const style = doc.createElement("style");
  style.setAttribute("data-editor", "");
  style.textContent = `
    html.editing .reveal { opacity: 1 !important; transform: none !important; }
    html.editing [contenteditable="true"] { cursor: text; transition: box-shadow .15s, background .15s; }
    html.editing [contenteditable="true"]:hover { box-shadow: 0 0 0 2px rgba(139,104,68,.35); }
    html.editing [contenteditable="true"]:focus { outline: none; box-shadow: 0 0 0 2px #8b6844; background: rgba(139,104,68,.06); }
    html.editing .ed-hover { outline: 1.5px dashed rgba(139,104,68,.6); outline-offset: 6px; border-radius: 6px; }
    html.editing .portrait, html.editing .gallery .g { cursor: pointer; }
    html.editing .rotator { cursor: pointer; }
    html.editing .ed-img-hint {
      position: absolute; z-index: 5; left: 50%; top: 50%; transform: translate(-50%,-50%);
      padding: 8px 14px; border-radius: 999px; background: rgba(30,24,20,.75); color: #fff;
      font: 500 13px/1 Inter, system-ui, sans-serif; opacity: 0; transition: opacity .2s; pointer-events: none; white-space: nowrap;
    }
    html.editing .portrait:hover .ed-img-hint, html.editing .g:hover .ed-img-hint { opacity: 1; }

    .ed, .ed * { box-sizing: border-box; font-family: Inter, system-ui, -apple-system, sans-serif; }
    .ed-bar {
      position: fixed; left: 50%; bottom: 20px; transform: translateX(-50%); z-index: 9999;
      display: flex; align-items: center; gap: 4px; padding: 6px;
      background: rgba(255,252,247,.86); backdrop-filter: blur(20px) saturate(180%); -webkit-backdrop-filter: blur(20px) saturate(180%);
      border: 1px solid rgba(70,48,30,.14); border-radius: 999px;
      box-shadow: 0 20px 50px -18px rgba(60,40,20,.45); color: #2e2520; font-size: 14px;
      max-width: calc(100vw - 24px); overflow-x: auto;
    }
    .ed-label { display: flex; align-items: center; gap: 8px; padding: 0 12px 0 10px; font-weight: 600; white-space: nowrap; }
    .ed-dot { width: 8px; height: 8px; border-radius: 50%; background: #8a9468; }
    .ed-dot.dirty { background: #c9893c; }
    .ed-btn {
      display: inline-flex; align-items: center; gap: 6px; height: 36px; padding: 0 14px;
      border: 0; border-radius: 999px; background: transparent; color: inherit;
      font: 500 14px/1 Inter, system-ui, sans-serif; cursor: pointer; white-space: nowrap;
    }
    .ed-btn:hover { background: rgba(70,48,30,.08); }
    .ed-btn:disabled { opacity: .4; cursor: default; background: transparent; }
    .ed-btn.primary { background: #2e2520; color: #f5efe6; }
    .ed-btn.primary:hover { background: #4a3b31; }
    .ed-btn svg { width: 16px; height: 16px; }
    .ed-sep { width: 1px; height: 20px; background: rgba(70,48,30,.14); margin: 0 4px; }

    .ed-panel {
      position: fixed; left: 50%; bottom: 76px; transform: translateX(-50%); z-index: 9999;
      width: min(420px, calc(100vw - 24px)); padding: 20px;
      background: #fffbf5; color: #2e2520; border: 1px solid rgba(70,48,30,.14); border-radius: 20px;
      box-shadow: 0 30px 70px -20px rgba(60,40,20,.45); font-size: 14px; line-height: 1.5;
      max-height: calc(100vh - 110px); overflow-y: auto;
    }
    .ed-panel h4 { margin: 0 0 4px; font: 600 16px/1.3 Inter, system-ui, sans-serif; }
    .ed-panel p { margin: 0 0 14px; color: #776a5f; }
    .ed-panel label { display: block; margin: 12px 0 6px; font-weight: 500; font-size: 13px; }
    .ed-panel input[type=text], .ed-panel input[type=password], .ed-panel input[type=url], .ed-panel textarea {
      width: 100%; padding: 10px 12px; border: 1px solid rgba(70,48,30,.18); border-radius: 10px;
      background: #fff; color: #2e2520; font: 14px/1.4 Inter, system-ui, sans-serif;
    }
    .ed-panel textarea { min-height: 110px; resize: vertical; }
    .ed-panel input:focus, .ed-panel textarea:focus { outline: 2px solid rgba(139,104,68,.4); border-color: #8b6844; }
    .ed-row { display: flex; gap: 8px; margin-top: 16px; flex-wrap: wrap; }
    .ed-row .ed-btn { border: 1px solid rgba(70,48,30,.16); }
    .ed-colors { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 8px; }
    .ed-color { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border: 1px solid rgba(70,48,30,.14); border-radius: 12px; }
    .ed-color input { width: 34px; height: 34px; padding: 0; border: 0; border-radius: 8px; background: none; cursor: pointer; }
    .ed-color span { font-size: 13px; }
    .ed-swatches { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 4px; }
    .ed-swatch { display: flex; gap: 0; border-radius: 999px; overflow: hidden; border: 1px solid rgba(70,48,30,.18); cursor: pointer; padding: 0; background: none; }
    .ed-swatch span { width: 18px; height: 26px; display: block; }
    .ed-check { display: flex; align-items: center; gap: 8px; margin-top: 12px; font-size: 13px; color: #776a5f; }
    .ed-status { margin-top: 14px; padding: 10px 12px; border-radius: 10px; background: rgba(70,48,30,.06); font-size: 13px; white-space: pre-line; }
    .ed-status.ok { background: rgba(122,125,92,.15); color: #4f5236; }
    .ed-status.err { background: rgba(180,80,60,.12); color: #8a3a28; }
    .ed-small { font-size: 12px; color: #9b8e81; }
    .ed-panel a { color: #8b6844; text-decoration: underline; }

    .ed-blockbar {
      position: absolute; z-index: 9998; display: flex; gap: 2px; padding: 3px;
      background: #2e2520; border-radius: 10px; box-shadow: 0 8px 20px -6px rgba(0,0,0,.4);
    }
    .ed-blockbar button {
      width: 30px; height: 28px; border: 0; border-radius: 7px; background: transparent; color: #f5efe6;
      cursor: pointer; display: grid; place-items: center;
    }
    .ed-blockbar button:hover { background: rgba(255,255,255,.14); }
    .ed-blockbar button.danger:hover { background: #a2452f; }
    .ed-blockbar svg { width: 15px; height: 15px; }
    .ed-blockbar .ed-tag { color: #cfac82; font: 600 11px/28px Inter, sans-serif; padding: 0 8px 0 6px; letter-spacing: .04em; text-transform: uppercase; }

    .ed-pop {
      position: absolute; z-index: 9999; width: 320px; padding: 12px;
      background: #fffbf5; border: 1px solid rgba(70,48,30,.16); border-radius: 14px;
      box-shadow: 0 18px 40px -14px rgba(60,40,20,.45); font-size: 13px; color: #2e2520;
    }
    .ed-pop label { display: block; font-weight: 500; margin-bottom: 6px; }
    .ed-pop input, .ed-pop textarea { width: 100%; padding: 8px 10px; border: 1px solid rgba(70,48,30,.18); border-radius: 8px; font: 13px Inter, sans-serif; background: #fff; color: #2e2520; }
    .ed-pop textarea { min-height: 96px; }
    .ed-pop .ed-row { margin-top: 10px; }
    .ed-pop .ed-btn { height: 30px; font-size: 13px; padding: 0 12px; }

    .ed-toast {
      position: fixed; left: 50%; top: 20px; transform: translateX(-50%); z-index: 10000;
      padding: 10px 18px; border-radius: 999px; background: #2e2520; color: #f5efe6;
      font: 500 14px Inter, sans-serif; box-shadow: 0 12px 30px -10px rgba(0,0,0,.4);
      animation: edToast 3.2s ease forwards;
    }
    @keyframes edToast { 0% { opacity: 0; transform: translate(-50%, -8px); } 8%, 85% { opacity: 1; transform: translate(-50%, 0); } 100% { opacity: 0; } }
  `;
  doc.head.appendChild(style);

  /* ---------- Small helpers ---------- */
  const icon = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
  const ICONS = {
    up: icon('<path d="M12 19V5M5 12l7-7 7 7"/>'),
    down: icon('<path d="M12 5v14M19 12l-7 7-7-7"/>'),
    copy: icon('<rect x="8" y="8" width="12" height="12" rx="2.5"/><path d="M16 8V6.5A2.5 2.5 0 0 0 13.5 4h-7A2.5 2.5 0 0 0 4 6.5v7A2.5 2.5 0 0 0 6.5 16H8"/>'),
    trash: icon('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/>'),
    undo: icon('<path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>'),
    palette: icon('<circle cx="12" cy="12" r="9"/><circle cx="8" cy="10" r="1.2" fill="currentColor"/><circle cx="12" cy="7.5" r="1.2" fill="currentColor"/><circle cx="16" cy="10" r="1.2" fill="currentColor"/><path d="M12 21c-1.5 0-2-1-2-2s1-2 2-2h1.5a2 2 0 0 0 0-4"/>'),
    cloud: icon('<path d="M7 18a4 4 0 0 1-.6-7.96A6 6 0 0 1 18 9a4.5 4.5 0 0 1-.5 9H7Z"/><path d="M12 11v6M9.5 13.5 12 11l2.5 2.5"/>'),
    download: icon('<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>'),
    close: icon('<path d="M6 6l12 12M18 6 6 18"/>'),
    help: icon('<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .8-1 1.5v.7M12 17h.01"/>'),
  };

  const el = (tag, attrs = {}, html = "") => {
    const n = doc.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    n.setAttribute("data-editor", "");
    if (html) n.innerHTML = html;
    return n;
  };
  const toast = (msg) => {
    doc.querySelectorAll(".ed-toast").forEach((t) => t.remove());
    const t = el("div", { class: "ed ed-toast" });
    t.textContent = msg;
    doc.body.appendChild(t);
    setTimeout(() => t.remove(), 3300);
  };
  const isUI = (node) => node && node.closest && node.closest(UI);
  const markDirty = () => { state.dirty = true; dot.classList.add("dirty"); };
  const store = {
    get(k) { try { return localStorage.getItem("siteEditor." + k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem("siteEditor." + k, v); } catch (e) {} },
    del(k) { try { localStorage.removeItem("siteEditor." + k); } catch (e) {} },
  };

  /* ---------- Turn on editing ---------- */
  function enableText(scope = doc.body) {
    const nodes = [...scope.querySelectorAll(TEXT_SELECTOR)];
    if (scope !== doc.body && scope.matches && scope.matches(TEXT_SELECTOR)) nodes.unshift(scope);
    nodes.forEach((n) => {
      if (isUI(n)) return;
      if (n.closest("script, style, svg")) return;
      if (n.parentElement && n.parentElement.closest('[contenteditable="true"]')) return; // parent already editable
      if (n.matches("li, p, blockquote, figcaption") && n.querySelector(BLOCK_CHILDREN)) return; // container, edit its children
      n.setAttribute("contenteditable", "true");
      n.setAttribute("spellcheck", "true");
    });
    // decorative or special pieces stay locked
    scope.querySelectorAll(".rotator, .pulse, .pub-arrow, .avatars, svg").forEach((n) => n.setAttribute("contenteditable", "false"));
  }

  // Show real numbers instead of the count-up animation
  function prepareStats() {
    // Rename the attributes so the page's count-up animation leaves them alone
    doc.querySelectorAll("[data-count]").forEach((n) => {
      n.textContent = n.dataset.count + (n.dataset.suffix || "");
      n.setAttribute("data-ed-count", "");
      n.removeAttribute("data-count");
      n.removeAttribute("data-suffix");
    });
  }

  function addImageHints(scope = doc) {
    scope.querySelectorAll(IMAGE_TARGETS).forEach((t) => {
      if (t.querySelector(".ed-img-hint")) return;
      const h = el("span", { class: "ed-img-hint" });
      h.textContent = "Click to change photo";
      t.appendChild(h);
    });
  }

  root.classList.add("editing");
  enableText();
  prepareStats();
  addImageHints();
  doc.querySelectorAll(".reveal").forEach((n) => n.classList.add("visible"));

  /* ---------- Typing behaviour ---------- */
  doc.addEventListener("keydown", (e) => {
    const t = e.target;
    if (!(t instanceof HTMLElement) || t.getAttribute("contenteditable") !== "true") return;
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      t.blur();
    }
    if (e.key === "Escape") t.blur();
  }, true);

  doc.addEventListener("paste", (e) => {
    const t = e.target instanceof Element && e.target.closest('[contenteditable="true"]');
    if (!t) return;
    e.preventDefault();
    const text = (e.clipboardData || window.clipboardData).getData("text/plain");
    doc.execCommand("insertText", false, text);
  });

  doc.addEventListener("input", (e) => {
    if (!isUI(e.target)) markDirty();
  });

  /* ---------- Clicks: links, photos, rotating phrases ---------- */
  doc.addEventListener("click", (e) => {
    const target = e.target;
    if (isUI(target)) return;

    // Rotating phrases in the headline
    const rot = target.closest(".rotator");
    if (rot) {
      e.preventDefault();
      openPhrasePopover(rot);
      return;
    }

    // Photos
    const imgTarget = target.closest(IMAGE_TARGETS);
    if (imgTarget && !target.closest('[contenteditable="true"]')) {
      e.preventDefault();
      pickImage(imgTarget);
      return;
    }

    // Filters & copy button would act; in edit mode they just get edited
    if (target.closest(".filter, .copy, .theme-toggle, .menu-toggle")) {
      if (target.closest(".filter")) { e.preventDefault(); e.stopImmediatePropagation(); }
    }

    // Links: don't follow, offer to change where they go
    const link = target.closest("a[href]");
    if (link) {
      e.preventDefault();
      openLinkPopover(link);
      return;
    }
    closePopover();
  }, true);

  /* ---------- Popovers ---------- */
  let pop = null;
  function closePopover() {
    if (pop) { pop.remove(); pop = null; }
  }
  function placePopover(p, anchor) {
    const r = anchor.getBoundingClientRect();
    doc.body.appendChild(p);
    const w = p.offsetWidth;
    let left = r.left + scrollX;
    left = Math.max(12 + scrollX, Math.min(left, scrollX + innerWidth - w - 12));
    let top = r.bottom + scrollY + 10;
    if (r.bottom + p.offsetHeight + 20 > innerHeight) top = r.top + scrollY - p.offsetHeight - 10;
    p.style.left = left + "px";
    p.style.top = top + "px";
  }

  function openLinkPopover(link) {
    closePopover();
    const isEmail = link.classList.contains("email");
    pop = el("div", { class: "ed ed-pop" }, `
      <label>${isEmail ? "Email address" : "Link goes to"}</label>
      <input type="text" value="">
      <div class="ed-small" style="margin-top:6px">${isEmail
        ? "Edit the address here. The text on the page will update to match."
        : "A web address (https://…), a file like cv.pdf, or a section like #contact."}</div>
      <div class="ed-row">
        <button class="ed-btn primary" data-act="save">Save</button>
        <button class="ed-btn" data-act="open">Open link</button>
        <button class="ed-btn" data-act="cancel">Cancel</button>
      </div>`);
    const input = pop.querySelector("input");
    input.value = isEmail ? link.getAttribute("href").replace(/^mailto:/, "") : link.getAttribute("href");
    pop.addEventListener("click", (e) => {
      const act = e.target.closest("[data-act]")?.dataset.act;
      if (act === "save") {
        const v = input.value.trim();
        if (isEmail) {
          link.setAttribute("href", "mailto:" + v);
          link.textContent = v;
          doc.querySelectorAll(".copy[data-copy]").forEach((b) => b.setAttribute("data-copy", v));
        } else {
          link.setAttribute("href", v || "#");
        }
        markDirty();
        closePopover();
        toast("Link updated");
      } else if (act === "open") {
        const href = link.getAttribute("href");
        if (href.startsWith("#")) { closePopover(); doc.querySelector(href)?.scrollIntoView({ behavior: "smooth" }); }
        else window.open(href, "_blank", "noopener");
      } else if (act === "cancel") closePopover();
    });
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") pop.querySelector('[data-act="save"]').click(); });
    placePopover(pop, link);
  }

  function openPhrasePopover(rot) {
    closePopover();
    pop = el("div", { class: "ed ed-pop" }, `
      <label>Rotating phrases</label>
      <textarea></textarea>
      <div class="ed-small" style="margin-top:6px">One phrase per line. They take turns in the headline.</div>
      <div class="ed-row">
        <button class="ed-btn primary" data-act="save">Save</button>
        <button class="ed-btn" data-act="cancel">Cancel</button>
      </div>`);
    const ta = pop.querySelector("textarea");
    ta.value = (rot.dataset.words || rot.textContent).split("|").join("\n");
    pop.addEventListener("click", (e) => {
      const act = e.target.closest("[data-act]")?.dataset.act;
      if (act === "save") {
        const words = ta.value.split("\n").map((s) => s.trim()).filter(Boolean);
        if (words.length) {
          rot.dataset.words = words.join("|");
          rot.textContent = words[0];
          markDirty();
          toast("Phrases saved. The new set rotates after you publish.");
        }
        closePopover();
      } else if (act === "cancel") closePopover();
    });
    placePopover(pop, rot);
    ta.focus();
  }

  doc.addEventListener("mousedown", (e) => {
    if (pop && !pop.contains(e.target) && !e.target.closest("a[href], .rotator")) closePopover();
  });

  /* ---------- Photos ---------- */
  const filePicker = el("input", { type: "file", accept: "image/*", style: "display:none" });
  doc.body.appendChild(filePicker);
  let imageTarget = null;
  function pickImage(target) {
    imageTarget = target;
    filePicker.value = "";
    filePicker.click();
  }
  filePicker.addEventListener("change", async () => {
    const file = filePicker.files[0];
    if (!file || !imageTarget) return;
    const dataURL = await shrinkImage(file, 1800);
    const safe = file.name.toLowerCase().replace(/\.[^.]+$/, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "photo";
    const path = `images/${safe}-${Date.now().toString(36)}.jpg`;
    let img = imageTarget.querySelector("img");
    if (!img) {
      img = doc.createElement("img");
      img.alt = imageTarget.classList.contains("portrait") ? "Portrait" : (imageTarget.querySelector("figcaption")?.textContent.trim() || "Photo");
      if (imageTarget.classList.contains("portrait")) imageTarget.appendChild(img);
      else imageTarget.insertBefore(img, imageTarget.firstChild);
    }
    img.setAttribute("onerror", "this.remove()");
    img.setAttribute("data-ed-path", path);
    img.src = dataURL;
    state.pendingImages.set(path, dataURL);
    markDirty();
    toast("Photo replaced");
  });

  // Resize big photos so the site stays fast
  function shrinkImage(file, maxSide) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = reject;
      reader.onload = () => {
        const im = new Image();
        im.onload = () => {
          const scale = Math.min(1, maxSide / Math.max(im.width, im.height));
          const c = doc.createElement("canvas");
          c.width = Math.round(im.width * scale);
          c.height = Math.round(im.height * scale);
          c.getContext("2d").drawImage(im, 0, 0, c.width, c.height);
          resolve(c.toDataURL("image/jpeg", 0.86));
        };
        im.onerror = reject;
        im.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  /* ---------- Block controls: duplicate / move / delete ---------- */
  const blockbar = el("div", { class: "ed ed-blockbar" });
  blockbar.innerHTML = `
    <span class="ed-tag"></span>
    <button data-act="up" title="Move up / left">${ICONS.up}</button>
    <button data-act="down" title="Move down / right">${ICONS.down}</button>
    <button data-act="dup" title="Duplicate">${ICONS.copy}</button>
    <button data-act="del" class="danger" title="Delete">${ICONS.trash}</button>`;
  blockbar.style.display = "none";
  doc.body.appendChild(blockbar);

  function labelFor(node) {
    if (node.matches(SECTION_SELECTOR)) return "Section";
    if (node.matches(".pubs > li")) return "Publication";
    if (node.matches(".timeline > li")) return "Timeline item";
    if (node.matches(".courses > .course")) return "Course";
    if (node.matches(".cards-3 > .card")) return "Card";
    if (node.matches(".stats > .stat")) return "Number";
    if (node.matches(".gallery > .g")) return "Photo";
    if (node.matches(".menu > a, .dropdown-panel > a")) return "Menu link";
    if (node.matches("a")) return "Button";
    return "Item";
  }

  function showBlockbar(node) {
    if (state.hoverTarget && state.hoverTarget !== node) state.hoverTarget.classList.remove("ed-hover");
    state.hoverTarget = node;
    node.classList.add("ed-hover");
    blockbar.querySelector(".ed-tag").textContent = labelFor(node);
    blockbar.style.display = "flex";
    positionBlockbar();
  }
  function positionBlockbar() {
    const n = state.hoverTarget;
    if (!n || !n.isConnected) return hideBlockbar();
    const r = n.getBoundingClientRect();
    const w = blockbar.offsetWidth;
    let left = r.right + scrollX - w;
    left = Math.max(8 + scrollX, Math.min(left, scrollX + innerWidth - w - 8));
    let top = r.top + scrollY - blockbar.offsetHeight - 8;
    if (top < scrollY + 76) top = r.top + scrollY + 6; // keep clear of the header
    blockbar.style.left = left + "px";
    blockbar.style.top = top + "px";
  }
  function hideBlockbar() {
    if (state.hoverTarget) state.hoverTarget.classList.remove("ed-hover");
    state.hoverTarget = null;
    blockbar.style.display = "none";
  }

  doc.addEventListener("mouseover", (e) => {
    if (blockbar.contains(e.target)) return;
    if (isUI(e.target)) return;
    const block = e.target.closest(BLOCK_SELECTOR) || e.target.closest(SECTION_SELECTOR);
    if (block) showBlockbar(block);
  });
  addEventListener("scroll", () => { if (state.hoverTarget) positionBlockbar(); }, { passive: true });
  addEventListener("resize", () => { if (state.hoverTarget) positionBlockbar(); });

  blockbar.addEventListener("click", (e) => {
    const act = e.target.closest("[data-act]")?.dataset.act;
    const n = state.hoverTarget;
    if (!act || !n) return;
    const parent = n.parentNode;
    if (act === "up") {
      const prev = n.previousElementSibling;
      if (!prev) return toast("Already first");
      state.history.push({ type: "move", node: n, parent, next: n.nextSibling });
      parent.insertBefore(n, prev);
    } else if (act === "down") {
      const next = n.nextElementSibling;
      if (!next) return toast("Already last");
      state.history.push({ type: "move", node: n, parent, next: n.nextSibling });
      parent.insertBefore(next, n);
    } else if (act === "dup") {
      const copy = n.cloneNode(true);
      copy.classList.remove("ed-hover");
      copy.querySelectorAll("[id]").forEach((x) => x.removeAttribute("id"));
      if (copy.id) copy.removeAttribute("id");
      parent.insertBefore(copy, n.nextSibling);
      copy.querySelectorAll("img[data-ed-path]").forEach((img) => {
        const src = state.pendingImages.get(img.dataset.edPath);
        if (src) img.src = src;
      });
      state.history.push({ type: "add", node: copy });
      showBlockbar(copy);
      toast(`${labelFor(n)} duplicated`);
    } else if (act === "del") {
      const siblings = parent.querySelectorAll(":scope > *").length;
      if (siblings <= 1 && !n.matches(SECTION_SELECTOR)) {
        if (!confirm("This is the last one in its group. Delete it anyway?")) return;
      }
      state.history.push({ type: "remove", node: n, parent, next: n.nextSibling });
      n.classList.remove("ed-hover");
      n.remove();
      hideBlockbar();
      toast(`${labelFor(n)} deleted. Use Undo to bring it back.`);
    }
    markDirty();
    undoBtn.disabled = !state.history.length;
    positionBlockbar();
  });

  function undo() {
    const op = state.history.pop();
    if (!op) return;
    if (op.type === "move") op.parent.insertBefore(op.node, op.next && op.next.parentNode === op.parent ? op.next : null);
    if (op.type === "add") op.node.remove();
    if (op.type === "remove") op.parent.insertBefore(op.node, op.next && op.next.parentNode === op.parent ? op.next : null);
    hideBlockbar();
    undoBtn.disabled = !state.history.length;
    markDirty();
    toast("Undone");
  }

  /* ---------- Toolbar ---------- */
  const bar = el("div", { class: "ed ed-bar", role: "toolbar", "aria-label": "Page editor" });
  bar.innerHTML = `
    <span class="ed-label"><span class="ed-dot"></span>Editing</span>
    <button class="ed-btn" data-act="undo" title="Undo move, duplicate or delete">${ICONS.undo}Undo</button>
    <button class="ed-btn" data-act="theme">${ICONS.palette}Colors</button>
    <button class="ed-btn" data-act="help">${ICONS.help}Tips</button>
    <span class="ed-sep"></span>
    <button class="ed-btn" data-act="download" title="Download the edited page">${ICONS.download}Download</button>
    <button class="ed-btn primary" data-act="publish">${ICONS.cloud}Publish</button>
    <button class="ed-btn" data-act="exit" title="Leave edit mode">${ICONS.close}</button>`;
  doc.body.appendChild(bar);
  const dot = bar.querySelector(".ed-dot");
  const undoBtn = bar.querySelector('[data-act="undo"]');
  undoBtn.disabled = true;

  let panel = null;
  function closePanel() { if (panel) { panel.remove(); panel = null; } }
  function openPanel(html, name) {
    if (panel && panel.dataset.name === name) return closePanel();
    closePanel();
    panel = el("div", { class: "ed ed-panel", "data-name": name }, html);
    doc.body.appendChild(panel);
    return panel;
  }

  bar.addEventListener("click", (e) => {
    const act = e.target.closest("[data-act]")?.dataset.act;
    if (act === "undo") undo();
    if (act === "theme") openThemePanel();
    if (act === "help") openHelp();
    if (act === "download") downloadPage();
    if (act === "publish") openPublishPanel();
    if (act === "exit") {
      if (state.dirty && !confirm("You have changes that aren't published. Leave edit mode and lose them?")) return;
      location.href = location.pathname;
    }
  });

  addEventListener("beforeunload", (e) => {
    if (state.dirty) { e.preventDefault(); e.returnValue = ""; }
  });

  /* ---------- Tips ---------- */
  function openHelp() {
    openPanel(`
      <h4>How editing works</h4>
      <p>Your changes are only saved when you press <b>Publish</b>.</p>
      <ul style="margin:0;padding-left:18px;color:#2e2520">
        <li><b>Text:</b> click any words and type. Press Enter when done.</li>
        <li><b>Links &amp; buttons:</b> click one to change where it goes.</li>
        <li><b>Photos:</b> click your portrait or a gallery tile to upload a new picture.</li>
        <li><b>Blocks:</b> hover a card, publication, course or section to move, duplicate or delete it.</li>
        <li><b>Headline phrases:</b> click the colored rotating words.</li>
        <li><b>Colors:</b> use the Colors button.</li>
      </ul>
      <div class="ed-row"><button class="ed-btn" data-close>Got it</button></div>`, "help")
      ?.querySelector("[data-close]").addEventListener("click", closePanel);
  }
  if (!store.get("seenTips")) { openHelp(); store.set("seenTips", "1"); }

  /* ---------- Colors ---------- */
  const THEME_VARS = [
    ["--bg", "Background"],
    ["--text", "Text"],
    ["--accent", "Accent"],
    ["--accent-2", "Second accent"],
    ["--muted", "Soft text"],
    ["--sage", "Highlight"],
  ];
  const PRESETS = {
    "Ivory & camel": { "--bg": "#f5efe6", "--text": "#2e2520", "--accent": "#8b6844", "--accent-2": "#b8946b", "--muted": "#776a5f", "--sage": "#7a7d5c" },
    "Stone & navy": { "--bg": "#f3f2ef", "--text": "#1d2433", "--accent": "#2f4a7a", "--accent-2": "#7d8fb3", "--muted": "#6b7080", "--sage": "#6d7f73" },
    "Linen & olive": { "--bg": "#f4f1e8", "--text": "#2a2a22", "--accent": "#5f6b3a", "--accent-2": "#a3a77a", "--muted": "#6f6d5f", "--sage": "#8a7650" },
    "Blush & cocoa": { "--bg": "#f7efec", "--text": "#3a2a26", "--accent": "#9a5b4c", "--accent-2": "#c99a8a", "--muted": "#7e6a64", "--sage": "#7c8466" },
  };
  function themeStyleEl() {
    let s = doc.getElementById("site-theme");
    if (!s) {
      s = doc.createElement("style");
      s.id = "site-theme";
      doc.head.appendChild(s);
    }
    return s;
  }
  function applyTheme(vals) {
    const body = Object.entries(vals).map(([k, v]) => `  ${k}: ${v};`).join("\n");
    themeStyleEl().textContent = `\n/* Colors chosen in the editor (light theme) */\n:root:not([data-theme="dark"]) {\n${body}\n}\n`;
    markDirty();
  }
  function currentVal(name) {
    const v = getComputedStyle(root).getPropertyValue(name).trim();
    return /^#[0-9a-f]{6}$/i.test(v) ? v : toHex(v);
  }
  function toHex(v) {
    const c = doc.createElement("canvas").getContext("2d");
    c.fillStyle = v || "#000";
    return c.fillStyle.startsWith("#") ? c.fillStyle : "#000000";
  }
  function openThemePanel() {
    if (root.dataset.theme === "dark") { delete root.dataset.theme; }
    const p = openPanel(`
      <h4>Colors</h4>
      <p>Pick a preset or fine-tune each color. Changes show instantly.</p>
      <div class="ed-swatches">${Object.entries(PRESETS).map(([name, v]) =>
        `<button class="ed-swatch" data-preset="${name}" title="${name}">${["--bg", "--text", "--accent", "--accent-2"].map((k) => `<span style="background:${v[k]}"></span>`).join("")}</button>`).join("")}</div>
      <div class="ed-colors">${THEME_VARS.map(([k, label]) =>
        `<label class="ed-color" style="margin:0"><input type="color" data-var="${k}" value="${currentVal(k)}"><span>${label}</span></label>`).join("")}</div>
      <div class="ed-row">
        <button class="ed-btn" data-act="reset">Reset to original</button>
        <button class="ed-btn primary" data-act="done">Done</button>
      </div>`, "theme");
    if (!p) return;
    const collect = () => Object.fromEntries([...p.querySelectorAll("input[data-var]")].map((i) => [i.dataset.var, i.value]));
    p.addEventListener("input", (e) => { if (e.target.dataset.var) applyTheme(collect()); });
    p.addEventListener("click", (e) => {
      const preset = e.target.closest("[data-preset]")?.dataset.preset;
      if (preset) {
        const v = PRESETS[preset];
        p.querySelectorAll("input[data-var]").forEach((i) => { if (v[i.dataset.var]) i.value = v[i.dataset.var]; });
        applyTheme(collect());
      }
      const act = e.target.closest("[data-act]")?.dataset.act;
      if (act === "reset") {
        doc.getElementById("site-theme")?.remove();
        markDirty();
        closePanel();
        openThemePanel();
      }
      if (act === "done") closePanel();
    });
  }

  /* ---------- Build the clean page to save ---------- */
  function buildCleanHTML() {
    const clone = root.cloneNode(true);
    clone.querySelectorAll(UI).forEach((n) => n.remove());
    clone.classList.remove("editing");
    if (!clone.classList.length) clone.removeAttribute("class");
    clone.removeAttribute("data-theme");
    clone.querySelectorAll("[contenteditable]").forEach((n) => n.removeAttribute("contenteditable"));
    clone.querySelectorAll("[spellcheck]").forEach((n) => n.removeAttribute("spellcheck"));
    clone.querySelectorAll(".ed-hover").forEach((n) => n.classList.remove("ed-hover"));
    clone.querySelectorAll(".reveal.visible").forEach((n) => n.classList.remove("visible"));
    clone.querySelectorAll(".rotator").forEach((n) => {
      n.classList.remove("out");
      n.textContent = (n.dataset.words || n.textContent).split("|")[0];
    });
    // numbers: keep what was typed as the target, page counts up from 0
    clone.querySelectorAll("[data-ed-count]").forEach((n) => {
      n.removeAttribute("data-ed-count");
      const txt = n.textContent.trim();
      const m = txt.match(/^(\d+)(.*)$/);
      if (m) {
        n.dataset.count = m[1];
        if (m[2]) n.dataset.suffix = m[2];
        n.textContent = "0";
      }
      // anything else (e.g. "∞" or "1.5k") is kept as plain text
    });
    clone.querySelectorAll("img[data-ed-path]").forEach((img) => {
      img.setAttribute("src", img.dataset.edPath);
      img.removeAttribute("data-ed-path");
    });
    clone.querySelector(".header")?.classList.remove("scrolled");
    clone.querySelector(".menu")?.classList.remove("open");
    clone.querySelector(".menu-toggle")?.setAttribute("aria-expanded", "false");
    clone.querySelector(".progress")?.removeAttribute("style");
    clone.querySelectorAll(".pubs li[hidden]").forEach((n) => n.removeAttribute("hidden"));
    clone.querySelectorAll(".filter").forEach((b, i) => b.classList.toggle("active", i === 0));
    const yr = clone.querySelector("#year"); if (yr) yr.textContent = "";
    clone.querySelectorAll(".copy").forEach((b) => {
      b.classList.remove("done");
      const s = b.querySelector("span"); if (s) s.textContent = "Copy";
    });
    clone.querySelectorAll('[class=""]').forEach((n) => n.removeAttribute("class"));
    clone.querySelectorAll('[style=""]').forEach((n) => n.removeAttribute("style"));
    return "<!DOCTYPE html>\n" + clone.outerHTML + "\n";
  }
  window.__buildCleanHTML = buildCleanHTML; // handy for testing

  /* ---------- Download (no GitHub needed) ---------- */
  function saveBlob(name, blob) {
    const a = doc.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    doc.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }
  function downloadPage() {
    saveBlob("index.html", new Blob([buildCleanHTML()], { type: "text/html" }));
    let i = 0;
    state.pendingImages.forEach((dataURL, path) => {
      setTimeout(() => {
        fetch(dataURL).then((r) => r.blob()).then((b) => saveBlob(path.split("/").pop(), b));
      }, 400 * ++i);
    });
    toast(state.pendingImages.size
      ? "Downloaded index.html and your new photos. Put the photos in an images folder."
      : "Downloaded index.html");
  }

  /* ---------- Publish straight to GitHub ---------- */
  function guessRepo() {
    const host = location.hostname;
    const m = host.match(/^([^.]+)\.github\.io$/i);
    if (!m) return { owner: store.get("owner") || "", repo: store.get("repo") || "" };
    const owner = m[1];
    const first = location.pathname.split("/").filter(Boolean)[0];
    const repo = first && !first.includes(".") ? first : `${owner}.github.io`;
    return { owner: store.get("owner") || owner, repo: store.get("repo") || repo };
  }
  function pagePath() {
    // index.html inside a project site lives at the repo root
    const parts = location.pathname.split("/").filter(Boolean);
    const { repo } = guessRepo();
    if (parts[0] === repo) parts.shift();
    const last = parts[parts.length - 1];
    if (!last || !last.endsWith(".html")) parts.push("index.html");
    return parts.join("/");
  }

  function openPublishPanel() {
    const g = guessRepo();
    const token = store.get("token") || sessionStorage.getItem("siteEditor.token") || "";
    const p = openPanel(`
      <h4>Publish your changes</h4>
      <p>This saves your edits to GitHub, and your live site updates in about a minute.</p>
      <label>GitHub username</label>
      <input type="text" data-f="owner" value="${g.owner}">
      <label>Repository</label>
      <input type="text" data-f="repo" value="${g.repo}">
      <label>Access token</label>
      <input type="password" data-f="token" value="${token}" placeholder="github_pat_…" autocomplete="off">
      <div class="ed-small" style="margin-top:6px">
        One-time setup: <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">create a token</a>,
        choose <b>Only select repositories</b> → your site's repository, then under
        <b>Repository permissions</b> set <b>Contents</b> to <b>Read and write</b>. Paste it here.
      </div>
      <label class="ed-check"><input type="checkbox" data-f="remember" ${store.get("token") ? "checked" : ""}> Remember on this computer</label>
      <div class="ed-row">
        <button class="ed-btn primary" data-act="go">${ICONS.cloud}Publish now</button>
        <button class="ed-btn" data-act="close">Cancel</button>
      </div>
      <div class="ed-status" hidden></div>`, "publish");
    if (!p) return;
    const f = (k) => p.querySelector(`[data-f="${k}"]`);
    const status = p.querySelector(".ed-status");
    const say = (msg, kind = "") => { status.hidden = false; status.className = "ed-status " + kind; status.textContent = msg; };
    p.addEventListener("click", async (e) => {
      const act = e.target.closest("[data-act]")?.dataset.act;
      if (act === "close") return closePanel();
      if (act !== "go") return;
      const owner = f("owner").value.trim(), repo = f("repo").value.trim(), tok = f("token").value.trim();
      if (!owner || !repo || !tok) return say("Please fill in all three fields.", "err");
      store.set("owner", owner); store.set("repo", repo);
      if (f("remember").checked) store.set("token", tok); else { store.del("token"); sessionStorage.setItem("siteEditor.token", tok); }
      const btn = e.target.closest("button");
      btn.disabled = true;
      try {
        await publish({ owner, repo, token: tok }, (m) => say(m));
        say("Published! Your live site will update in about a minute.\nRefresh the normal page (without #edit) to see it.", "ok");
        state.dirty = false;
        dot.classList.remove("dirty");
      } catch (err) {
        say(friendlyError(err), "err");
      } finally {
        btn.disabled = false;
      }
    });
  }

  function friendlyError(err) {
    const s = err && err.status;
    if (s === 401) return "GitHub didn't accept the token. Check you copied all of it, or create a new one.";
    if (s === 403) return "The token can't write to this repository. Make sure Contents is set to \"Read and write\" and this repository is selected.";
    if (s === 404) return "Couldn't find that repository. Check the username and repository name (the token also needs access to it).";
    if (s === 409) return "GitHub had a conflict saving. Please press Publish again.";
    if (s === 422) return "GitHub rejected the file (it may be too large). Try a smaller photo.";
    return "Something went wrong: " + (err && err.message ? err.message : err) + "\nYou can always use Download instead.";
  }

  async function gh(cfg, method, path, body) {
    const res = await fetch(`https://api.github.com/repos/${cfg.owner}/${cfg.repo}${path}`, {
      method,
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${cfg.token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const e = new Error((await res.json().catch(() => ({}))).message || res.statusText);
      e.status = res.status;
      throw e;
    }
    return res.status === 204 ? null : res.json();
  }

  function textToBase64(str) {
    const bytes = new TextEncoder().encode(str);
    let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }

  async function putFile(cfg, branch, path, base64, message) {
    let sha;
    try {
      const existing = await gh(cfg, "GET", `/contents/${encodeURI(path)}?ref=${encodeURIComponent(branch)}`);
      sha = existing && existing.sha;
    } catch (e) {
      if (e.status !== 404) throw e;
    }
    return gh(cfg, "PUT", `/contents/${encodeURI(path)}`, { message, content: base64, branch, ...(sha ? { sha } : {}) });
  }

  async function publish(cfg, progress) {
    progress("Connecting to GitHub…");
    const info = await gh(cfg, "GET", "");
    const branch = info.default_branch || "main";
    let i = 0;
    for (const [path, dataURL] of state.pendingImages) {
      progress(`Uploading photo ${++i} of ${state.pendingImages.size}…`);
      await putFile(cfg, branch, path, dataURL.split(",")[1], `Add photo ${path.split("/").pop()}`);
    }
    progress("Saving your page…");
    await putFile(cfg, branch, pagePath(), textToBase64(buildCleanHTML()), "Update site from the visual editor");
    state.pendingImages.clear();
  }
})();
