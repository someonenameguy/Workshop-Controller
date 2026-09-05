/**
 * Steam Workshop Downloader Controller - Frontend Application Logic
 */

class WorkshopApp {
  constructor() {
    this.currentTab = "mods";
    this.installedMods = [];
    this.queueItems = [];
    this.workers = [];
    this.settings = {};
    this.refactorCandidates = [];
    this.profiles = [];
    this.activeProfileId = "default";
    this.editingProfileId = null;
    this.ws = null;
    this.deleteTarget = null;
    this.deleteTargetProfileId = null;
    this.modalAction = null;
    this.isShuttingDown = false;
  }

  async init() {
    this.bindEvents();
    await this.loadProfiles();
    await this.loadSettings();
    await this.loadSystemStatus();
    await this.loadMods(false);
    this.initWebSocket();
  }

  // ================= Event Bindings =================
  bindEvents() {
    // Tab switching
    document.querySelectorAll(".nav-tab").forEach(btn => {
      btn.addEventListener("click", () => this.switchTab(btn.dataset.tab));
    });

    // Top action: open folder
    document.getElementById("btn-open-mods-folder").addEventListener("click", () => {
      this.openFolder();
    });

    // Header profile switcher
    const headerProfileSelect = document.getElementById("header-profile-select");
    if (headerProfileSelect) {
      headerProfileSelect.addEventListener("change", (e) => {
        this.switchProfile(e.target.value);
      });
    }

    // Mods tab
    document.getElementById("mods-search-input").addEventListener("input", () => this.renderMods());
    document.getElementById("mods-filter-select").addEventListener("change", () => this.renderMods());
    const modsTagSelect = document.getElementById("mods-tag-select");
    if (modsTagSelect) {
      modsTagSelect.addEventListener("change", () => this.renderMods());
    }
    const modsGrid = document.getElementById("mods-grid");
    if (modsGrid) {
      modsGrid.addEventListener("click", (e) => {
        const tagEl = e.target.closest(".mod-tag");
        if (tagEl && tagEl.dataset.tag) {
          this.filterByTag(tagEl.dataset.tag);
        }
      });
    }
    document.getElementById("btn-check-updates").addEventListener("click", () => this.checkUpdates());
    document.getElementById("btn-update-all").addEventListener("click", () => this.updateAllOutdated());
    document.getElementById("btn-banner-update").addEventListener("click", () => this.updateAllOutdated());

    // Queue tab
    document.getElementById("btn-start-download").addEventListener("click", () => this.startDownload());
    document.getElementById("btn-clear-input").addEventListener("click", () => {
      document.getElementById("download-text-input").value = "";
    });
    document.getElementById("btn-cancel-all").addEventListener("click", () => this.cancelAllDownloads());

    // Refactor tab
    document.getElementById("btn-scan-refactor").addEventListener("click", () => this.scanRefactor());
    document.getElementById("btn-adopt-all").addEventListener("click", () => this.executeAdoptAll());

    // Settings tab - Profile Management
    const btnAddProfile = document.getElementById("btn-add-profile");
    if (btnAddProfile) {
      btnAddProfile.addEventListener("click", () => this.openAddProfile());
    }
    const btnSaveProfile = document.getElementById("btn-save-profile");
    if (btnSaveProfile) {
      btnSaveProfile.addEventListener("click", () => this.saveProfile());
    }
    const btnCancelProfile = document.getElementById("btn-cancel-profile");
    if (btnCancelProfile) {
      btnCancelProfile.addEventListener("click", () => this.closeProfileForm());
    }
    document.querySelectorAll(".profile-preset-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const nameInput = document.getElementById("profile-form-name");
        const appIdInput = document.getElementById("profile-form-appid");
        if (nameInput) nameInput.value = btn.dataset.game;
        if (appIdInput) appIdInput.value = btn.dataset.appid;
      });
    });

    // Settings tab - General
    const slider = document.getElementById("setting-workers-slider");
    slider.addEventListener("input", (e) => {
      document.getElementById("workers-count-label").textContent = e.target.value;
    });

    document.querySelectorAll(".preset-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        document.getElementById("setting-app-id").value = btn.dataset.appid;
        document.getElementById("setting-game-name").value = btn.dataset.game;
      });
    });

    document.getElementById("btn-reset-folder").addEventListener("click", () => {
      document.getElementById("setting-download-path").value = "";
    });

    document.getElementById("btn-save-settings").addEventListener("click", () => this.saveSettings());

    // Logs tab
    document.getElementById("btn-clear-logs").addEventListener("click", () => {
      document.getElementById("logs-container").innerHTML = "";
    });

    // Stop App buttons
    const btnStopApp = document.getElementById("btn-stop-app");
    if (btnStopApp) {
      btnStopApp.addEventListener("click", () => this.promptStopApp());
    }
    const btnSettingsStop = document.getElementById("btn-settings-stop");
    if (btnSettingsStop) {
      btnSettingsStop.addEventListener("click", () => this.promptStopApp());
    }

    // Modal
    document.getElementById("modal-btn-cancel").addEventListener("click", () => this.closeModal());
    document.getElementById("modal-btn-confirm").addEventListener("click", () => this.handleModalConfirm());
  }

  // ================= Navigation =================
  switchTab(tabName) {
    this.currentTab = tabName;
    document.querySelectorAll(".nav-tab").forEach(tab => {
      tab.classList.toggle("active", tab.dataset.tab === tabName);
    });
    document.querySelectorAll(".tab-content").forEach(content => {
      content.classList.toggle("active", content.id === `tab-${tabName}`);
    });

    if (tabName === "mods" && this.installedMods.length === 0) {
      this.loadMods(false);
    }
  }

  // ================= WebSocket Connection =================
  initWebSocket() {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/api/ws`;

    this.ws = new WebSocket(wsUrl);

    this.ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        this.handleWsEvent(payload);
      } catch (e) {
        console.error("WS Parse error:", e);
      }
    };

    this.ws.onclose = () => {
      if (this.isShuttingDown) return;
      // Reconnect after 2 seconds
      setTimeout(() => this.initWebSocket(), 2000);
    };

    // Keepalive ping every 15 seconds
    setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send("ping");
      }
    }, 15000);
  }

  handleWsEvent(payload) {
    const { type, data } = payload;
    if (type === "init") {
      this.queueItems = data.queue || [];
      this.workers = data.workers || [];
      this.renderQueue();
      this.renderWorkers();
      if (data.logs) {
        data.logs.forEach(l => this.appendLog(l));
      }
    } else if (type === "queue_updated") {
      this.queueItems = data || [];
      this.renderQueue();
      // If items completed, refresh mods list
      const hasCompleted = this.queueItems.some(i => i.status === "completed");
      if (hasCompleted) {
        this.loadMods(false);
      }
    } else if (type === "workers_updated") {
      this.workers = data || [];
      this.renderWorkers();
    } else if (type === "log") {
      this.appendLog(data);
    } else if (type === "shutdown") {
      this.showShutdownOverlay(data?.message);
    }
  }

  appendLog(logData) {
    const container = document.getElementById("logs-container");
    const line = document.createElement("div");
    line.className = `log-line ${logData.level || "info"}`;
    line.innerHTML = `<span class="log-time">[${logData.time}]</span> ${this.escapeHtml(logData.message)}`;
    container.appendChild(line);

    if (document.getElementById("chk-autoscroll").checked) {
      container.scrollTop = container.scrollHeight;
    }
  }

  // ================= System & Settings =================
  async loadSystemStatus() {
    try {
      const res = await fetch("/api/system/status");
      const data = await res.json();

      const dot = document.querySelector(".status-dot");
      const text = document.getElementById("steamcmd-status-text");
      if (data.steamcmd_ready) {
        dot.className = "status-dot dot-ready";
        text.textContent = "SteamCMD Ready";
      } else {
        dot.className = "status-dot dot-idle";
        text.textContent = "SteamCMD Auto-Setup";
      }

      document.getElementById("game-badge").textContent = `${data.game_name} (${data.app_id})`;
      document.getElementById("resolved-folder-hint").textContent = `Current folder: ${data.download_path}`;
    } catch (e) {
      console.error("System status error:", e);
    }
  }

  async loadSettings() {
    try {
      const res = await fetch("/api/settings");
      const data = await res.json();
      this.settings = data.settings;

      document.getElementById("setting-download-path").value = this.settings.download_path || "";
      document.getElementById("setting-workers-slider").value = this.settings.max_parallel_workers || 3;
      document.getElementById("workers-count-label").textContent = this.settings.max_parallel_workers || 3;
      document.getElementById("setting-app-id").value = this.settings.app_id || 294100;
      document.getElementById("setting-game-name").value = this.settings.game_name || "RimWorld";
      document.getElementById("setting-steam-user").value = this.settings.steam_user || "anonymous";
      document.getElementById("setting-steam-pass").value = this.settings.steam_pass || "";
      document.getElementById("setting-auto-backup").checked = this.settings.auto_backup !== false;
      document.getElementById("setting-auto-browser").checked = this.settings.auto_open_browser !== false;
      document.getElementById("setting-custom-steamcmd").value = this.settings.steamcmd_custom_path || "";
    } catch (e) {
      console.error("Failed to load settings:", e);
    }
  }

  async saveSettings() {
    const btn = document.getElementById("btn-save-settings");
    const origHtml = btn ? btn.innerHTML : "";
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = `<span class="btn-spinner"></span> Saving Settings...`;
    }

    const payload = {
      download_path: document.getElementById("setting-download-path").value.trim(),
      max_parallel_workers: parseInt(document.getElementById("setting-workers-slider").value, 10),
      app_id: parseInt(document.getElementById("setting-app-id").value, 10),
      game_name: document.getElementById("setting-game-name").value.trim(),
      steam_user: document.getElementById("setting-steam-user").value.trim() || "anonymous",
      steam_pass: document.getElementById("setting-steam-pass").value,
      auto_backup: document.getElementById("setting-auto-backup").checked,
      auto_open_browser: document.getElementById("setting-auto-browser").checked,
      steamcmd_custom_path: document.getElementById("setting-custom-steamcmd").value.trim(),
    };

    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      this.settings = data.settings;

      const indicator = document.getElementById("settings-saved-indicator");
      if (indicator) {
        indicator.style.display = "inline";
        setTimeout(() => { indicator.style.display = "none"; }, 2500);
      }

      this.showToast("Settings saved successfully!", "success");
      await this.loadSystemStatus();
      await this.loadProfiles();
    } catch (e) {
      this.showToast(`Error saving settings: ${e.message}`, "error");
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = origHtml || "💾 Save Settings";
      }
    }
  }

  // ================= Mods Management =================
  updateBannerState() {
    const outdated = this.installedMods.filter(m => m.update_available);
    const banner = document.getElementById("updates-banner");
    const updateAllBtn = document.getElementById("btn-update-all");

    if (outdated.length > 0) {
      if (banner) banner.style.display = "flex";
      if (updateAllBtn) updateAllBtn.style.display = "inline-flex";
      const countEl = document.getElementById("outdated-count-text");
      if (countEl) countEl.textContent = outdated.length;
      const titleEl = document.getElementById("updates-banner-title");
      if (titleEl) titleEl.textContent = `${outdated.length} Mod Update(s) Available!`;
      const descEl = document.getElementById("updates-banner-desc");
      if (descEl) {
        descEl.textContent = `Newer versions found on Steam Workshop: ${outdated.map(m => m.name).slice(0, 3).join(", ")}${outdated.length > 3 ? "..." : ""}`;
      }
    } else {
      if (banner) banner.style.display = "none";
      if (updateAllBtn) updateAllBtn.style.display = "none";
    }
  }

  populateTagFilter() {
    const tagSelect = document.getElementById("mods-tag-select");
    if (!tagSelect) return;

    const currentVal = tagSelect.value;
    const tagCounts = new Map();

    for (const mod of this.installedMods) {
      if (Array.isArray(mod.tags)) {
        for (const tag of mod.tags) {
          if (!tag) continue;
          const trimmed = String(tag).trim();
          if (trimmed) {
            tagCounts.set(trimmed, (tagCounts.get(trimmed) || 0) + 1);
          }
        }
      }
    }

    const isVersion = (t) => /^\d+(\.\d+)+$/.test(t.trim());
    const sortedTags = Array.from(tagCounts.keys()).sort((a, b) => {
      const isVA = isVersion(a);
      const isVB = isVersion(b);
      if (isVA && isVB) {
        const pA = a.split(".").map(Number);
        const pB = b.split(".").map(Number);
        for (let i = 0; i < Math.max(pA.length, pB.length); i++) {
          const vA = pA[i] ?? 0;
          const vB = pB[i] ?? 0;
          if (vA !== vB) return vB - vA;
        }
        return 0;
      }
      if (isVA) return -1;
      if (isVB) return 1;
      return a.localeCompare(b, undefined, { sensitivity: "base" });
    });

    let html = `<option value="">🏷️ All Tags</option>`;
    for (const tag of sortedTags) {
      const count = tagCounts.get(tag);
      html += `<option value="${this.escapeHtml(tag)}">${this.escapeHtml(tag)} (${count})</option>`;
    }
    tagSelect.innerHTML = html;

    if (currentVal && tagCounts.has(currentVal)) {
      tagSelect.value = currentVal;
    } else {
      tagSelect.value = "";
    }
  }

  filterByTag(tag) {
    const tagSelect = document.getElementById("mods-tag-select");
    if (tagSelect) {
      tagSelect.value = tag;
      this.renderMods();
    }
  }

  async loadMods(checkUpdates = false) {
    const grid = document.getElementById("mods-grid");
    grid.innerHTML = `
      <div class="loading-state">
        <div class="spinner"></div>
        <p>${checkUpdates ? "Querying Steam Workshop for updates..." : "Scanning installed mods..."}</p>
      </div>
    `;

    try {
      const endpoint = checkUpdates ? "/api/mods/check-updates" : "/api/mods";
      const method = checkUpdates ? "POST" : "GET";
      const res = await fetch(endpoint, { method });
      const data = await res.json();

      this.installedMods = data.mods || [];
      const badge = document.getElementById("mods-count-badge");
      if (badge) badge.textContent = this.installedMods.length;

      this.updateBannerState();
      this.populateTagFilter();
      this.renderMods();
    } catch (e) {
      grid.innerHTML = `<div class="empty-state">Failed to load mods: ${e.message}</div>`;
    }
  }

  renderMods() {
    const grid = document.getElementById("mods-grid");
    const search = document.getElementById("mods-search-input").value.toLowerCase().trim();
    const filter = document.getElementById("mods-filter-select").value;
    const tagSelect = document.getElementById("mods-tag-select");
    const selectedTag = tagSelect ? tagSelect.value : "";

    const filtered = this.installedMods.filter(mod => {
      // Filter dropdown
      if (filter === "updates" && !mod.update_available) return false;
      if (filter === "steam" && mod.is_non_steam) return false;
      if (filter === "non-steam" && !mod.is_non_steam) return false;

      // Tag filter
      if (selectedTag && (!mod.tags || !mod.tags.includes(selectedTag))) {
        return false;
      }

      // Search term
      if (search) {
        const titleMatch = (mod.name || "").toLowerCase().includes(search);
        const idMatch = (mod.mod_id || "").toLowerCase().includes(search);
        const authorMatch = (mod.author || "").toLowerCase().includes(search);
        const pkgMatch = (mod.package_id || "").toLowerCase().includes(search);
        const tagsMatch = (mod.tags || []).some(t => String(t).toLowerCase().includes(search));
        return titleMatch || idMatch || authorMatch || pkgMatch || tagsMatch;
      }
      return true;
    });

    if (filtered.length === 0) {
      grid.innerHTML = `<div class="empty-state">No mods found matching current filter.</div>`;
      return;
    }

    grid.innerHTML = filtered.map(mod => {
      // Thumbnail resolution with onerror fallback
      const imgFallback = `onerror="this.onerror=null; this.parentElement.innerHTML='<div class=\\'mod-thumbnail-placeholder\\'>📦</div>';"`;
      let thumbHtml = `<div class="mod-thumbnail-placeholder">📦</div>`;
      if (mod.preview_url) {
        thumbHtml = `<img src="${this.escapeHtml(mod.preview_url)}" alt="${this.escapeHtml(mod.name)}" loading="lazy" ${imgFallback}>`;
      } else if (mod.preview_image_path) {
        thumbHtml = `<img src="/api/local-preview?path=${encodeURIComponent(mod.preview_image_path)}" alt="${this.escapeHtml(mod.name)}" loading="lazy" ${imgFallback}>`;
      }

      const sizeMb = (mod.size_bytes / (1024 * 1024)).toFixed(1);
      const updateBadge = mod.update_available
        ? `<div class="mod-update-badge">UPDATE AVAILABLE</div>`
        : "";

      return `
        <div class="mod-card ${mod.update_available ? "has-update" : ""}">
          <div class="mod-thumbnail">
            ${thumbHtml}
            ${updateBadge}
          </div>
          <div class="mod-body">
            <h4 class="mod-title">${this.escapeHtml(mod.name)}</h4>
            <div class="mod-meta">
              <div class="mod-meta-row">
                <span>Workshop ID:</span>
                <strong>${this.escapeHtml(mod.mod_id)}</strong>
              </div>
              ${mod.author ? `
                <div class="mod-meta-row">
                  <span>Author:</span>
                  <span>${this.escapeHtml(mod.author)}</span>
                </div>
              ` : ""}
              <div class="mod-meta-row">
                <span>Size:</span>
                <span>${sizeMb} MB</span>
              </div>
            </div>
            ${mod.tags && mod.tags.length > 0 ? `
              <div class="mod-tags-container">
                ${mod.tags.slice(0, 4).map(t => `<span class="mod-tag" data-tag="${this.escapeHtml(t)}" onclick="app.filterByTag('${this.escapeHtml(t)}')">${this.escapeHtml(t)}</span>`).join("")}
              </div>
            ` : ""}
            <div class="mod-footer">
              ${mod.update_available && !mod.is_non_steam ? `
                <button class="btn btn-warning btn-sm" onclick="app.updateSingleMod('${mod.mod_id}', this)">
                  ⬆️ Update
                </button>
              ` : ""}
              <button class="btn btn-secondary btn-sm" onclick="app.openFolder('${encodeURIComponent(mod.folder_path)}')">
                📁 Folder
              </button>
              ${!mod.is_non_steam ? `
                <a href="https://steamcommunity.com/sharedfiles/filedetails/?id=${mod.mod_id}" target="_blank" class="btn btn-outline btn-sm">
                  🌐 Steam
                </a>
              ` : ""}
              <button class="btn btn-danger btn-sm" style="margin-left:auto;" onclick="app.promptDelete('${encodeURIComponent(mod.folder_path)}', '${this.escapeHtml(mod.name)}')">
                🗑️
              </button>
            </div>
          </div>
        </div>
      `;
    }).join("");
  }

  async checkUpdates() {
    const btn = document.getElementById("btn-check-updates");
    const origHtml = btn ? btn.innerHTML : "";
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = `<span class="btn-spinner"></span> Checking Updates...`;
    }
    this.showToast("Querying Steam Workshop for updates...", "info");

    try {
      await this.loadMods(true);
      const outdated = this.installedMods.filter(m => m.update_available);
      if (outdated.length === 0) {
        this.showToast("All your mods are completely up to date!", "success");
      } else {
        this.showToast(`Found ${outdated.length} mod(s) with updates available!`, "warning");
      }
    } catch (e) {
      this.showToast(`Check updates failed: ${e.message}`, "error");
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = origHtml || "🔄 Check for Updates";
      }
    }
  }

  async updateAllOutdated() {
    const btn1 = document.getElementById("btn-update-all");
    const btn2 = document.getElementById("btn-banner-update");
    const orig1 = btn1 ? btn1.innerHTML : "";
    const orig2 = btn2 ? btn2.innerHTML : "";

    if (btn1) {
      btn1.disabled = true;
      btn1.innerHTML = `<span class="btn-spinner"></span> Enqueueing...`;
    }
    if (btn2) {
      btn2.disabled = true;
      btn2.innerHTML = `<span class="btn-spinner"></span> Enqueueing...`;
    }

    try {
      const res = await fetch("/api/mods/update-outdated", { method: "POST" });
      const data = await res.json();
      if (data.enqueued > 0) {
        this.showToast(`Enqueued ${data.enqueued} outdated mod(s) for update!`, "success");
        this.switchTab("queue");
      } else {
        this.showToast("No outdated mods to update.", "info");
      }
    } catch (e) {
      this.showToast(`Error: ${e.message}`, "error");
    } finally {
      if (btn1) {
        btn1.disabled = false;
        btn1.innerHTML = orig1 || `⬆️ Update All Outdated (<span id="outdated-count-text">0</span>)`;
      }
      if (btn2) {
        btn2.disabled = false;
        btn2.innerHTML = orig2 || "Update Now";
      }
    }
  }

  async updateSingleMod(modId, btnElement = null) {
    let origHtml = "";
    if (btnElement) {
      origHtml = btnElement.innerHTML;
      btnElement.disabled = true;
      btnElement.innerHTML = `<span class="btn-spinner"></span> Enqueueing...`;
    }
    try {
      const res = await fetch("/api/mods/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input_text: modId }),
      });
      const data = await res.json();
      this.showToast(`Enqueued mod ${modId} for download.`, "success");
      this.switchTab("queue");
    } catch (e) {
      this.showToast(`Failed: ${e.message}`, "error");
    } finally {
      if (btnElement) {
        btnElement.disabled = false;
        btnElement.innerHTML = origHtml || "⬆️ Update";
      }
    }
  }

  // ================= Downloads & Queue =================
  async startDownload() {
    const input = document.getElementById("download-text-input").value.trim();
    if (!input) {
      this.showToast("Please enter Workshop URLs or Mod IDs first.", "warning");
      return;
    }

    const btn = document.getElementById("btn-start-download");
    const origHtml = btn ? btn.innerHTML : "";
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = `<span class="btn-spinner"></span> Adding to Queue...`;
    }
    this.showToast("Analyzing input and adding to queue...", "info");
    this.switchTab("queue");

    try {
      const res = await fetch("/api/mods/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input_text: input }),
      });
      const data = await res.json();

      if (data.enqueued_count > 0) {
        this.showToast(`Enqueued ${data.enqueued_count} mod(s) for download!`, "success");
        document.getElementById("download-text-input").value = "";
      } else {
        this.showToast("No new mods enqueued (they may already be in queue).", "info");
      }
    } catch (e) {
      this.showToast(`Error: ${e.message}`, "error");
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = origHtml || "⬇️ Download Mods";
      }
    }
  }

  async cancelDownload(modId, btnElement = null) {
    let origHtml = "";
    if (btnElement) {
      origHtml = btnElement.innerHTML;
      btnElement.disabled = true;
      btnElement.innerHTML = `<span class="btn-spinner"></span>`;
    }
    try {
      await fetch("/api/mods/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mod_id: modId }),
      });
      this.showToast(`Cancelled ${modId}`, "info");
    } catch (e) {
      this.showToast(`Error: ${e.message}`, "error");
    } finally {
      if (btnElement) {
        btnElement.disabled = false;
        btnElement.innerHTML = origHtml || "Cancel";
      }
    }
  }

  async cancelAllDownloads() {
    const btn = document.getElementById("btn-cancel-all");
    const origHtml = btn ? btn.innerHTML : "";
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = `<span class="btn-spinner"></span> Cancelling...`;
    }
    try {
      await fetch("/api/mods/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cancel_all: true }),
      });
      this.showToast("All active downloads cancelled.", "info");
    } catch (e) {
      this.showToast(`Error: ${e.message}`, "error");
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = origHtml || "🛑 Cancel All";
      }
    }
  }

  renderWorkers() {
    const container = document.getElementById("workers-cards");
    if (!this.workers || this.workers.length === 0) {
      container.innerHTML = `<div class="empty-state">No workers active.</div>`;
      return;
    }

    container.innerHTML = this.workers.map(w => {
      const isBusy = w.status !== "idle";
      const statusClass = isBusy ? "status-downloading" : "status-idle";
      const statusText = isBusy ? "Active (Downloading)" : "Idle (Ready)";
      const jobText = w.current_mod_title
        ? `Mod: ${this.escapeHtml(w.current_mod_title)}`
        : "Waiting for jobs...";

      return `
        <div class="worker-card ${isBusy ? "active" : ""}">
          <div class="worker-header">
            <span>⚡ Worker ${w.worker_id + 1}</span>
            <span class="worker-status-badge ${statusClass}">${statusText}</span>
          </div>
          <div class="worker-current-job">${jobText}</div>
        </div>
      `;
    }).join("");
  }

  renderQueue() {
    const tbody = document.getElementById("queue-table-body");
    const badge = document.getElementById("queue-count-badge");
    const summary = document.getElementById("queue-summary-text");

    const activeOrPending = this.queueItems.filter(i => ["queued", "downloading", "installing"].includes(i.status));
    badge.textContent = activeOrPending.length;
    badge.style.display = activeOrPending.length > 0 ? "inline-block" : "none";
    summary.textContent = `${activeOrPending.length} active/pending, ${this.queueItems.length} total`;

    if (this.queueItems.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="5" class="empty-state">No downloads in queue. Paste URLs above to start!</td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = this.queueItems.map(item => {
      let statusBadge = `<span class="badge">${item.status}</span>`;
      if (item.status === "downloading") statusBadge = `<span class="badge badge-accent">Downloading</span>`;
      else if (item.status === "completed") statusBadge = `<span class="badge" style="background-color: var(--accent-green); color:#000;">Completed</span>`;
      else if (item.status === "failed") statusBadge = `<span class="badge" style="background-color: var(--accent-red);">Failed</span>`;
      else if (item.status === "cancelled") statusBadge = `<span class="badge">Cancelled</span>`;

      const workerText = item.worker_id !== null ? `Worker ${item.worker_id + 1}` : "-";

      return `
        <tr>
          <td>
            <strong>${this.escapeHtml(item.title)}</strong><br>
            <small style="color:var(--text-muted);">ID: ${item.mod_id}</small>
          </td>
          <td>${workerText}</td>
          <td>
            ${statusBadge}<br>
            <small style="color:var(--text-secondary);">${this.escapeHtml(item.message)}</small>
          </td>
          <td style="min-width: 140px;">
            <div class="progress-bar-bg">
              <div class="progress-bar-fill" style="width: ${item.progress}%;"></div>
            </div>
            <small style="color:var(--text-muted);">${item.progress}%</small>
          </td>
          <td>
            ${["queued", "downloading"].includes(item.status) ? `
              <button class="btn btn-outline btn-sm" onclick="app.cancelDownload('${item.mod_id}', this)">Cancel</button>
            ` : "-"}
          </td>
        </tr>
      `;
    }).join("");
  }

  // ================= Refactor Healer =================
  async scanRefactor() {
    const scanBtn = document.getElementById("btn-scan-refactor");
    const origScanHtml = scanBtn ? scanBtn.innerHTML : "";
    if (scanBtn) {
      scanBtn.disabled = true;
      scanBtn.innerHTML = `<span class="btn-spinner"></span> Scanning...`;
    }
    this.showToast("Scanning directory for loose mods...", "info");

    const folderInput = document.getElementById("refactor-folder-input").value.trim();
    const container = document.getElementById("refactor-results");
    const adoptBtn = document.getElementById("btn-adopt-all");
    if (adoptBtn) {
      adoptBtn.style.display = "none";
    }

    const progressContainer = document.getElementById("refactor-progress-container");
    if (progressContainer) {
      progressContainer.style.display = "none";
    }

    container.innerHTML = `
      <div class="loading-state">
        <div class="spinner"></div>
        <p>Analyzing folders and discovering Workshop IDs...</p>
      </div>
    `;

    try {
      const res = await fetch("/api/refactor/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target_path: folderInput || null }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(err.detail || `Scan failed with status ${res.status}`);
      }
      const data = await res.json();
      this.refactorCandidates = data.candidates || [];

      // Count all candidates where c.can_refactor && (c.needs_refactor || !c.has_published_file_id || c.folder_name !== c.proposed_folder_name)
      const candidatesToRefactor = this.refactorCandidates.filter(
        c => c.can_refactor && (c.needs_refactor || !c.has_published_file_id || c.folder_name !== c.proposed_folder_name)
      );
      const count = candidatesToRefactor.length;

      if (adoptBtn) {
        if (count > 0) {
          adoptBtn.style.display = "inline-flex";
          adoptBtn.disabled = false;
          adoptBtn.innerHTML = `✨ Refactor & Adopt All (<span id="adopt-count-text">${count}</span>)`;
        } else {
          adoptBtn.style.display = "none";
        }
      }

      this.renderRefactorResults();
    } catch (e) {
      container.innerHTML = `<div class="empty-state">Scan error: ${e.message}</div>`;
      if (adoptBtn) {
        adoptBtn.style.display = "none";
      }
    } finally {
      if (scanBtn) {
        scanBtn.disabled = false;
        scanBtn.innerHTML = origScanHtml || `🔍 Scan Folder`;
      }
    }
  }

  renderRefactorResults() {
    const container = document.getElementById("refactor-results");
    if (!this.refactorCandidates || this.refactorCandidates.length === 0) {
      container.innerHTML = `<div class="empty-state">No loose mod folders found in target directory.</div>`;
      return;
    }

    container.innerHTML = this.refactorCandidates.map((c, index) => {
      const needsId = !c.has_published_file_id;
      const needsRename = Boolean(c.proposed_folder_name && c.folder_name !== c.proposed_folder_name);
      const canRefactor = Boolean(c.can_refactor);
      const needsAction = canRefactor && (c.needs_refactor || needsId || needsRename);

      let badgeText = "✓ Up to date";
      let badgeClass = "badge-status-uptodate";

      if (canRefactor) {
        if (needsId && needsRename) {
          badgeText = "Needs ID & Rename";
          badgeClass = "badge-status-id-rename";
        } else if (needsRename) {
          badgeText = "Needs Rename";
          badgeClass = "badge-status-rename";
        } else if (needsId) {
          badgeText = "Needs ID";
          badgeClass = "badge-status-id";
        } else {
          badgeText = "✓ Up to date";
          badgeClass = "badge-status-uptodate";
        }
      } else if (!c.detected_mod_id) {
        badgeText = "No Workshop ID";
        badgeClass = "badge-status-neutral";
      } else {
        badgeText = "Unverified";
        badgeClass = "badge-status-warning";
      }

      return `
        <div class="refactor-item-card" id="refactor-card-${index}" data-folder="${this.escapeHtml(c.folder_path)}">
          <div class="refactor-item-info">
            <div class="refactor-item-header">
              <span class="refactor-item-title">${this.escapeHtml(c.title || c.folder_name)}</span>
              <span class="refactor-badge ${badgeClass}" id="refactor-badge-${index}">${badgeText}</span>
            </div>
            <div class="refactor-folder-row" id="refactor-folder-row-${index}">
              <span class="refactor-label">Folder:</span>
              ${needsRename ? `
                <code class="folder-old">${this.escapeHtml(c.folder_name)}</code>
                <span class="refactor-arrow">➔</span>
                <code class="folder-new">${this.escapeHtml(c.proposed_folder_name)}</code>
              ` : `
                <code>${this.escapeHtml(c.folder_name)}</code>
              `}
              ${c.detected_mod_id ? `
                <span class="refactor-sep">•</span>
                <span class="refactor-id">ID: <strong>${this.escapeHtml(c.detected_mod_id)}</strong></span>
              ` : ""}
            </div>
            <div class="refactor-item-status ${canRefactor ? (needsAction ? "status-need-heal" : "status-ok") : "status-need-heal"}" id="refactor-status-${index}">
              ${this.escapeHtml(c.status_message)}
            </div>
          </div>
          <div class="refactor-item-actions" id="refactor-actions-${index}">
            ${needsAction ? `
              <button class="btn btn-primary btn-sm btn-refactor-single" id="btn-refactor-single-${index}" onclick="app.executeSingleRefactor(${index}, this)">
                ✨ Refactor & Rename
              </button>
            ` : ""}
          </div>
        </div>
      `;
    }).join("");
  }

  async executeSingleRefactor(target, btnOrModId, forceTitle, btnElem) {
    let folderPath = "";
    let detectedModId = "";
    let title = "";
    let btnElement = null;
    let cardIndex = -1;

    if (typeof target === "number") {
      cardIndex = target;
      const c = this.refactorCandidates[target];
      if (!c) return;
      folderPath = c.folder_path;
      detectedModId = c.detected_mod_id || "";
      title = c.title || "";
      btnElement = (btnOrModId && btnOrModId.nodeType) ? btnOrModId : document.getElementById(`btn-refactor-single-${target}`);
    } else if (typeof target === "string") {
      folderPath = decodeURIComponent(target);
      detectedModId = typeof btnOrModId === "string" ? btnOrModId : "";
      title = forceTitle || "";
      btnElement = (btnElem && btnElem.nodeType) ? btnElem : null;
      const idx = this.refactorCandidates.findIndex(
        item => item.folder_path === folderPath || encodeURIComponent(item.folder_path) === target
      );
      if (idx !== -1) {
        cardIndex = idx;
        const c = this.refactorCandidates[idx];
        if (!detectedModId) detectedModId = c.detected_mod_id || "";
        if (!title) title = c.title || "";
        if (!btnElement) btnElement = document.getElementById(`btn-refactor-single-${idx}`);
      }
    }

    if (!folderPath) return;

    let originalBtnHtml = "";
    if (btnElement) {
      originalBtnHtml = btnElement.innerHTML;
      btnElement.disabled = true;
      btnElement.innerHTML = `<span class="btn-spinner"></span> Renaming...`;
    }

    const card = cardIndex >= 0 ? document.getElementById(`refactor-card-${cardIndex}`) : null;
    const statusElem = cardIndex >= 0 ? document.getElementById(`refactor-status-${cardIndex}`) : null;
    if (card) {
      card.classList.remove("is-success", "is-error");
      card.classList.add("is-processing");
    }
    if (statusElem) {
      statusElem.innerHTML = `<span class="btn-spinner"></span> Renaming & adopting...`;
    }

    try {
      const res = await fetch("/api/refactor/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: [{
            folder_path: folderPath,
            mod_id: detectedModId,
            rename_folder: true,
            force_title: title || undefined,
          }],
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(errData.detail || `Server returned ${res.status}: ${res.statusText}`);
      }

      const data = await res.json();
      if (data.results && data.results[0] && data.results[0].status === "error") {
        throw new Error(data.results[0].error || "Failed to refactor mod");
      }

      this.showToast("Mod successfully refactored and updated!", "success");
      if (card) {
        card.classList.remove("is-processing");
        card.classList.add("is-success");
      }
      await this.scanRefactor();
      await this.loadMods(false);
    } catch (e) {
      this.showToast(`Refactor error: ${e.message}`, "error");
      if (card) {
        card.classList.remove("is-processing");
        card.classList.add("is-error");
      }
      if (statusElem) {
        statusElem.className = "refactor-item-status status-need-heal";
        statusElem.textContent = `Refactor error: ${e.message}`;
      }
      if (btnElement) {
        btnElement.innerHTML = originalBtnHtml || `✨ Refactor & Rename`;
        btnElement.disabled = false;
      }
    } finally {
      if (card) {
        card.classList.remove("is-processing");
      }
    }
  }

  async executeAdoptAll() {
    const toAdopt = this.refactorCandidates.filter(
      c => c.can_refactor && (c.needs_refactor || !c.has_published_file_id || c.folder_name !== c.proposed_folder_name)
    );

    if (toAdopt.length === 0) return;

    const total = toAdopt.length;
    const adoptBtn = document.getElementById("btn-adopt-all");
    const scanBtn = document.getElementById("btn-scan-refactor");
    const originalAdoptHtml = adoptBtn ? adoptBtn.innerHTML : "";

    if (adoptBtn) {
      adoptBtn.disabled = true;
      adoptBtn.innerHTML = `<span class="btn-spinner"></span> Refactoring (1/${total})...`;
    }
    if (scanBtn) {
      scanBtn.disabled = true;
    }

    this.showToast(`Starting refactor of ${total} mods...`, "info");

    const progressContainer = document.getElementById("refactor-progress-container");
    const progressStatus = document.getElementById("refactor-progress-status");
    const progressPercent = document.getElementById("refactor-progress-percent");
    const progressFill = document.getElementById("refactor-progress-fill");

    if (progressContainer) {
      progressContainer.style.display = "block";
    }
    if (progressPercent) progressPercent.textContent = "0%";
    if (progressFill) progressFill.style.width = "0%";

    let successCount = 0;
    let errorCount = 0;

    try {
      for (let i = 0; i < total; i++) {
        const c = toAdopt[i];
        const modTitle = c.title || c.folder_name;

        // Update adopt button text
        if (adoptBtn) {
          adoptBtn.innerHTML = `<span class="btn-spinner"></span> Refactoring (${i + 1}/${total})...`;
        }

        // Update progress bar
        if (progressStatus) {
          progressStatus.textContent = `Refactoring ${i + 1} of ${total}: ${modTitle}...`;
        }
        const currentPct = Math.round((i / total) * 100);
        if (progressPercent) progressPercent.textContent = `${currentPct}%`;
        if (progressFill) progressFill.style.width = `${currentPct}%`;

        // Find candidate index in this.refactorCandidates
        const cardIndex = this.refactorCandidates.indexOf(c);
        const card = cardIndex >= 0 ? document.getElementById(`refactor-card-${cardIndex}`) : null;
        const statusElem = cardIndex >= 0 ? document.getElementById(`refactor-status-${cardIndex}`) : null;
        const singleBtn = cardIndex >= 0 ? document.getElementById(`btn-refactor-single-${cardIndex}`) : null;

        if (card) {
          card.classList.remove("is-success", "is-error");
          card.classList.add("is-processing");
          card.scrollIntoView({ behavior: "smooth", block: "nearest" });
        }
        if (statusElem) {
          statusElem.innerHTML = `<span class="btn-spinner"></span> Refactoring & adopting...`;
        }
        if (singleBtn) {
          singleBtn.disabled = true;
          singleBtn.innerHTML = `<span class="btn-spinner"></span> Renaming...`;
        }

        try {
          const res = await fetch("/api/refactor/execute", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              items: [{
                folder_path: c.folder_path,
                mod_id: c.detected_mod_id || "",
                rename_folder: true,
                force_title: c.title,
              }],
            }),
          });

          if (!res.ok) {
            const errData = await res.json().catch(() => ({ detail: res.statusText }));
            throw new Error(errData.detail || `Server status ${res.status}`);
          }

          const data = await res.json();
          const itemResult = (data.results && data.results[0]) || {};

          if (itemResult.status === "error") {
            throw new Error(itemResult.error || "Failed to refactor");
          }

          successCount++;
          // Update candidate memory data
          c.can_refactor = true;
          c.needs_refactor = false;
          c.has_published_file_id = true;
          if (itemResult.new_folder_name) {
            c.folder_name = itemResult.new_folder_name;
            c.proposed_folder_name = itemResult.new_folder_name;
          }
          if (itemResult.new_folder_path) {
            c.folder_path = itemResult.new_folder_path;
          }
          c.status_message = "Refactored & adopted successfully.";

          // Update card DOM live
          if (card) {
            card.classList.remove("is-processing");
            card.classList.add("is-success");
          }
          const badge = cardIndex >= 0 ? document.getElementById(`refactor-badge-${cardIndex}`) : null;
          if (badge) {
            badge.className = "refactor-badge badge-status-uptodate";
            badge.textContent = "✓ Up to date";
          }
          const folderRow = cardIndex >= 0 ? document.getElementById(`refactor-folder-row-${cardIndex}`) : null;
          if (folderRow) {
            folderRow.innerHTML = `
              <span class="refactor-label">Folder:</span>
              <code>${this.escapeHtml(c.folder_name)}</code>
              ${c.detected_mod_id ? `
                <span class="refactor-sep">•</span>
                <span class="refactor-id">ID: <strong>${this.escapeHtml(c.detected_mod_id)}</strong></span>
              ` : ""}
            `;
          }
          if (statusElem) {
            statusElem.className = "refactor-item-status status-ok";
            statusElem.textContent = "✓ Refactored & adopted successfully.";
          }
          if (singleBtn) {
            singleBtn.remove();
          }
        } catch (err) {
          errorCount++;
          if (card) {
            card.classList.remove("is-processing");
            card.classList.add("is-error");
          }
          if (statusElem) {
            statusElem.className = "refactor-item-status status-need-heal";
            statusElem.textContent = `Refactor error: ${err.message}`;
          }
          if (singleBtn) {
            singleBtn.disabled = false;
            singleBtn.innerHTML = `✨ Refactor & Rename`;
          }
        }

        // Update progress bar
        const donePct = Math.round(((i + 1) / total) * 100);
        if (progressPercent) progressPercent.textContent = `${donePct}%`;
        if (progressFill) progressFill.style.width = `${donePct}%`;
      }

      if (progressStatus) {
        progressStatus.textContent = `Completed refactoring ${successCount} of ${total} mod(s)!`;
      }

      this.showToast(`Successfully refactored ${successCount} mods!`, "success");
      if (errorCount > 0) {
        this.showToast(`${errorCount} mod(s) encountered errors during refactoring.`, "warning");
      }

      // Allow user to see 100% completion before refresh
      await new Promise(resolve => setTimeout(resolve, 1000));
      await this.scanRefactor();
      await this.loadMods(false);
    } catch (e) {
      this.showToast(`Refactor error: ${e.message}`, "error");
    } finally {
      if (adoptBtn) {
        adoptBtn.disabled = false;
        adoptBtn.innerHTML = originalAdoptHtml || `✨ Refactor & Adopt All`;
      }
      if (scanBtn) {
        scanBtn.disabled = false;
      }
    }
  }

  // ================= Deletion, Stop & Explorer =================
  promptDelete(folderPath, modName) {
    this.modalAction = "delete";
    this.deleteTarget = decodeURIComponent(folderPath);
    document.getElementById("modal-title").textContent = "Delete Mod";
    document.getElementById("modal-message").textContent =
      `Are you sure you want to permanently delete "${modName}" from your mods folder?`;
    const confirmBtn = document.getElementById("modal-btn-confirm");
    if (confirmBtn) {
      confirmBtn.disabled = false;
      confirmBtn.innerHTML = "Delete";
    }
    const cancelBtn = document.getElementById("modal-btn-cancel");
    if (cancelBtn) {
      cancelBtn.disabled = false;
    }
    document.getElementById("confirm-modal").style.display = "flex";
  }

  promptStopApp() {
    this.modalAction = "shutdown";
    this.deleteTarget = null;
    document.getElementById("modal-title").textContent = "Stop Application";
    document.getElementById("modal-message").textContent =
      "Are you sure you want to shut down RimWorld Workshop Controller? Any active downloads will be stopped and the background server will exit.";
    const confirmBtn = document.getElementById("modal-btn-confirm");
    if (confirmBtn) {
      confirmBtn.disabled = false;
      confirmBtn.innerHTML = "🛑 Stop & Exit";
    }
    const cancelBtn = document.getElementById("modal-btn-cancel");
    if (cancelBtn) {
      cancelBtn.disabled = false;
    }
    document.getElementById("confirm-modal").style.display = "flex";
  }

  closeModal() {
    document.getElementById("confirm-modal").style.display = "none";
    this.modalAction = null;
    this.deleteTarget = null;
    this.deleteTargetProfileId = null;
  }

  async handleModalConfirm() {
    if (this.modalAction === "shutdown") {
      await this.confirmStopApp();
    } else if (this.modalAction === "delete_profile") {
      await this.deleteProfile(this.deleteTargetProfileId);
    } else {
      await this.confirmDelete();
    }
  }

  async confirmStopApp() {
    this.isShuttingDown = true;
    const confirmBtn = document.getElementById("modal-btn-confirm");
    const cancelBtn = document.getElementById("modal-btn-cancel");

    if (confirmBtn) {
      confirmBtn.disabled = true;
      confirmBtn.innerHTML = `<span class="btn-spinner"></span> Stopping...`;
    }
    if (cancelBtn) {
      cancelBtn.disabled = true;
    }

    try {
      await fetch("/api/system/shutdown", {
        method: "POST",
      });
    } catch (e) {
      // Server may shut down before responding, which is expected
      console.log("Shutdown initiated:", e);
    } finally {
      this.closeModal();
      this.showShutdownOverlay("The RimWorld Workshop Controller server has stopped.");
    }
  }

  showShutdownOverlay(message) {
    this.isShuttingDown = true;
    const overlay = document.getElementById("shutdown-overlay");
    if (overlay) {
      if (message) {
        const msgEl = overlay.querySelector(".shutdown-message");
        if (msgEl) msgEl.textContent = message;
      }
      overlay.style.display = "flex";
    }
  }

  async confirmDelete() {
    if (!this.deleteTarget) return;
    const confirmBtn = document.getElementById("modal-btn-confirm");
    const cancelBtn = document.getElementById("modal-btn-cancel");
    const originalHtml = confirmBtn ? confirmBtn.innerHTML : "Delete";

    if (confirmBtn) {
      confirmBtn.disabled = true;
      confirmBtn.innerHTML = `<span class="btn-spinner"></span> Deleting...`;
    }
    if (cancelBtn) {
      cancelBtn.disabled = true;
    }

    try {
      await fetch("/api/mods/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folder_path: this.deleteTarget }),
      });
      this.showToast("Mod deleted successfully.", "success");
      this.closeModal();

      // Immediately remove the deleted mod from this.installedMods locally
      this.installedMods = this.installedMods.filter(m => m.folder_path !== this.deleteTarget);
      const countBadge = document.getElementById("mods-count-badge");
      if (countBadge) countBadge.textContent = this.installedMods.length;
      this.updateBannerState();
      this.populateTagFilter();
      this.renderMods();

      await this.loadMods(false);
    } catch (e) {
      this.showToast(`Delete failed: ${e.message}`, "error");
    } finally {
      if (confirmBtn) {
        confirmBtn.disabled = false;
        confirmBtn.innerHTML = originalHtml || "Delete";
      }
      if (cancelBtn) {
        cancelBtn.disabled = false;
      }
    }
  }

  // ================= Profile Management =================
  async loadProfiles() {
    try {
      const res = await fetch("/api/profiles");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      this.profiles = data.profiles || [];
      this.activeProfileId = data.active_profile_id || (this.profiles[0] ? this.profiles[0].id : "default");

      this.renderHeaderProfiles();
      this.renderProfilesList();

      const activeProf = data.active_profile || this.profiles.find(p => p.id === this.activeProfileId);
      if (activeProf) {
        const badge = document.getElementById("game-badge");
        if (badge) {
          badge.textContent = `${activeProf.name} (${activeProf.app_id})`;
        }
      }
    } catch (e) {
      console.error("Failed to load profiles:", e);
    }
  }

  renderHeaderProfiles() {
    const select = document.getElementById("header-profile-select");
    if (!select) return;

    select.innerHTML = this.profiles.map(p => {
      const isSelected = p.id === this.activeProfileId ? "selected" : "";
      return `<option value="${this.escapeHtml(p.id)}" ${isSelected}>${this.escapeHtml(p.name)} (${p.app_id})</option>`;
    }).join("");
    select.value = this.activeProfileId;
  }

  renderProfilesList() {
    const container = document.getElementById("profiles-list-container");
    if (!container) return;

    if (this.profiles.length === 0) {
      container.innerHTML = `<div class="empty-state">No profiles configured.</div>`;
      return;
    }

    const onlyOne = this.profiles.length <= 1;

    container.innerHTML = this.profiles.map(profile => {
      const isActive = profile.id === this.activeProfileId;
      const folderDisplay = profile.folder_path ? this.escapeHtml(profile.folder_path) : "Default (mods folder)";

      return `
        <div class="profile-item-card ${isActive ? "active-profile" : ""}" data-profile-id="${this.escapeHtml(profile.id)}">
          <div class="profile-item-info">
            <div class="profile-item-header">
              <span class="profile-item-name">${this.escapeHtml(profile.name)}</span>
              <span class="profile-item-appid">${profile.app_id}</span>
              ${isActive ? `<span class="profile-active-badge">✓ Active Profile</span>` : ""}
            </div>
            <div class="profile-item-path">
              <span class="profile-path-label">Target Folder:</span>
              <code class="profile-path-code">${folderDisplay}</code>
            </div>
            ${profile.steam_user && profile.steam_user !== "anonymous" ? `
              <div class="profile-item-user">
                <span class="profile-user-label">Steam User:</span>
                <code>${this.escapeHtml(profile.steam_user)}</code>
              </div>
            ` : ""}
          </div>
          <div class="profile-item-actions">
            ${!isActive ? `
              <button type="button" class="btn btn-outline btn-sm" onclick="app.switchProfile('${this.escapeHtml(profile.id)}')">
                Switch to this
              </button>
            ` : ""}
            <button type="button" class="btn btn-secondary btn-sm" onclick="app.openEditProfile('${this.escapeHtml(profile.id)}')">
              ✏️ Edit
            </button>
            <button type="button" class="btn btn-danger btn-sm" ${onlyOne ? "disabled title=\"Cannot delete the only remaining profile\"" : ""} onclick="app.promptDeleteProfile('${this.escapeHtml(profile.id)}', '${this.escapeHtml(profile.name)}')">
              🗑️
            </button>
          </div>
        </div>
      `;
    }).join("");
  }

  async switchProfile(profileId) {
    if (!profileId || profileId === this.activeProfileId) return;

    this.showToast("Switching profile...", "info");
    try {
      const res = await fetch("/api/profiles/switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile_id: profileId }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Failed to switch profile");
      }

      const data = await res.json();
      const activeProfile = data.active_profile;
      this.activeProfileId = activeProfile.id;

      // Update UI indicators
      const badge = document.getElementById("game-badge");
      if (badge) {
        badge.textContent = `${activeProfile.name} (${activeProfile.app_id})`;
      }
      const hint = document.getElementById("resolved-folder-hint");
      if (hint && data.resolved_download_path) {
        hint.textContent = `Current folder: ${data.resolved_download_path}`;
      }

      this.renderHeaderProfiles();
      this.renderProfilesList();

      await this.loadSettings();
      await this.loadSystemStatus();

      this.showToast(`Switched profile to ${activeProfile.name}!`, "success");

      // Reload mods for the newly active profile
      await this.loadMods(false);
    } catch (e) {
      this.showToast(`Switch profile failed: ${e.message}`, "error");
      this.renderHeaderProfiles();
    }
  }

  openAddProfile() {
    this.editingProfileId = null;
    const formContainer = document.getElementById("profile-form-container");
    if (!formContainer) return;

    document.getElementById("profile-form-id").value = "";
    document.getElementById("profile-form-name").value = "";
    document.getElementById("profile-form-appid").value = "";
    document.getElementById("profile-form-path").value = "";
    document.getElementById("profile-form-user").value = "anonymous";
    document.getElementById("profile-form-heading").textContent = "➕ Add New Game Profile";
    document.getElementById("btn-save-profile").textContent = "💾 Save Profile";

    formContainer.style.display = "block";
    formContainer.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  openEditProfile(profileId) {
    const prof = this.profiles.find(p => p.id === profileId);
    if (!prof) return;

    this.editingProfileId = prof.id;
    const formContainer = document.getElementById("profile-form-container");
    if (!formContainer) return;

    document.getElementById("profile-form-id").value = prof.id;
    document.getElementById("profile-form-name").value = prof.name || "";
    document.getElementById("profile-form-appid").value = prof.app_id || "";
    document.getElementById("profile-form-path").value = prof.folder_path || "";
    document.getElementById("profile-form-user").value = prof.steam_user || "anonymous";
    document.getElementById("profile-form-heading").textContent = `✏️ Edit Profile: ${prof.name}`;
    document.getElementById("btn-save-profile").textContent = "💾 Save Profile";

    formContainer.style.display = "block";
    formContainer.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  closeProfileForm() {
    const formContainer = document.getElementById("profile-form-container");
    if (formContainer) {
      formContainer.style.display = "none";
    }
    this.editingProfileId = null;
  }

  async saveProfile() {
    const formId = document.getElementById("profile-form-id").value.trim();
    const name = document.getElementById("profile-form-name").value.trim();
    const appIdStr = document.getElementById("profile-form-appid").value.trim();
    const folderPath = document.getElementById("profile-form-path").value.trim();
    const steamUser = document.getElementById("profile-form-user").value.trim() || "anonymous";

    if (!name) {
      this.showToast("Please enter a Profile Name.", "warning");
      document.getElementById("profile-form-name").focus();
      return;
    }

    const appId = parseInt(appIdStr, 10);
    if (isNaN(appId) || appId <= 0) {
      this.showToast("Please enter a valid Steam App ID.", "warning");
      document.getElementById("profile-form-appid").focus();
      return;
    }

    const profileData = {
      id: formId || `prof_${Math.random().toString(36).substring(2, 9)}`,
      name: name,
      app_id: appId,
      folder_path: folderPath,
      steam_user: steamUser,
    };

    const btn = document.getElementById("btn-save-profile");
    const origHtml = btn ? btn.innerHTML : "";
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = `<span class="btn-spinner"></span> Saving...`;
    }

    try {
      const res = await fetch("/api/profiles/add-or-update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile: profileData }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Failed to save profile");
      }

      this.showToast(`Profile "${name}" saved successfully!`, "success");
      this.closeProfileForm();
      await this.loadProfiles();

      if (profileData.id === this.activeProfileId) {
        await this.loadSettings();
        await this.loadSystemStatus();
        await this.loadMods(false);
      }
    } catch (e) {
      this.showToast(`Save profile error: ${e.message}`, "error");
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = origHtml || "💾 Save Profile";
      }
    }
  }

  promptDeleteProfile(profileId, profileName) {
    if (this.profiles.length <= 1) {
      this.showToast("Cannot delete the only remaining profile.", "warning");
      return;
    }

    this.modalAction = "delete_profile";
    this.deleteTargetProfileId = profileId;
    document.getElementById("modal-title").textContent = "Delete Profile";
    document.getElementById("modal-message").textContent =
      `Are you sure you want to delete profile "${profileName}"? Installed mods on disk will NOT be deleted.`;
    const confirmBtn = document.getElementById("modal-btn-confirm");
    if (confirmBtn) {
      confirmBtn.disabled = false;
      confirmBtn.innerHTML = "🗑️ Delete Profile";
    }
    const cancelBtn = document.getElementById("modal-btn-cancel");
    if (cancelBtn) {
      cancelBtn.disabled = false;
    }
    document.getElementById("confirm-modal").style.display = "flex";
  }

  async deleteProfile(profileId) {
    const id = profileId || this.deleteTargetProfileId;
    if (!id) return;

    const confirmBtn = document.getElementById("modal-btn-confirm");
    const cancelBtn = document.getElementById("modal-btn-cancel");
    const originalHtml = confirmBtn ? confirmBtn.innerHTML : "Delete";

    if (confirmBtn) {
      confirmBtn.disabled = true;
      confirmBtn.innerHTML = `<span class="btn-spinner"></span> Deleting...`;
    }
    if (cancelBtn) {
      cancelBtn.disabled = true;
    }

    try {
      const res = await fetch("/api/profiles/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile_id: id }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Failed to delete profile");
      }

      this.showToast("Profile deleted.", "info");
      this.closeModal();

      await this.loadProfiles();
      await this.loadSettings();
      await this.loadSystemStatus();
      await this.loadMods(false);
    } catch (e) {
      this.showToast(`Delete profile failed: ${e.message}`, "error");
    } finally {
      if (confirmBtn) {
        confirmBtn.disabled = false;
        confirmBtn.innerHTML = originalHtml || "Delete";
      }
      if (cancelBtn) {
        cancelBtn.disabled = false;
      }
    }
  }

  async openFolder(folderPath = null) {
    this.showToast("Opening folder in system file manager...", "info");
    try {
      await fetch("/api/mods/open-folder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folder_path: folderPath ? decodeURIComponent(folderPath) : null }),
      });
    } catch (e) {
      console.error("Open folder error:", e);
    }
  }

  // ================= Utility =================
  showToast(message, type = "info") {
    const container = document.getElementById("toast-container");
    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => {
      toast.remove();
    }, 4000);
  }

  escapeHtml(str) {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
}

// Instantiate and start app on page load
const app = new WorkshopApp();
window.app = app;
window.addEventListener("DOMContentLoaded", () => app.init());
