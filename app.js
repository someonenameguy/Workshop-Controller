/**
 * Steam Workshop Downloader Controller — Interactive Showcase & Live Demo Simulator
 * 
 * Features implemented:
 * 1. Toast Notification Engine: Rich floating feedback alerts.
 * 2. Copy to Clipboard: One-click copying with visual badge feedback and fallback.
 * 3. Quick Start Platform Tabs: Switching between Windows, Linux, Source, and Build guides.
 * 4. Interactive Web UI Simulator (#demo):
 *    - Full tab navigation (Installed Mods, Download Queue, Folder Healer, Settings, Console Logs).
 *    - Multi-Game Profile Switcher (RimWorld, Stellaris, Cities: Skylines, Project Zomboid).
 *    - Installed Mods Tab: Real-time search, tag filter, status filter, update checker with simulated progress, and 1-click batch updater.
 *    - Download Queue Tab: Input validation, dynamic worker progress animation, fluctuating download speeds, and staging verification.
 *    - Folder Healer Tab: Simulated deep folder scan, interactive comparison table, and batch metadata repair.
 *    - Console Logs Tab: Timestamped live log stream generator with auto-scroll.
 *    - Concurrency worker slider & Settings simulator.
 * 5. FAQ Accordion: Smooth interactive expand/collapse.
 * 6. Mobile Navigation Menu: Responsive toggle and drawer navigation.
 * 7. Smooth Scrolling: Seamless anchor jumps with sticky navbar offset compensation.
 */

(function () {
  'use strict';

  /* ==========================================================================
     1. TOAST NOTIFICATION ENGINE
     ========================================================================== */
  const Toast = {
    container: null,

    init() {
      this.container = document.getElementById('toast-container');
      if (!this.container) {
        this.container = document.createElement('div');
        this.container.id = 'toast-container';
        this.container.className = 'toast-container';
        document.body.appendChild(this.container);
      }
    },

    /**
     * Show a toast message
     * @param {string} message - Text or HTML to display
     * @param {'info'|'success'|'warning'|'error'} type - Style theme
     * @param {number} duration - Milliseconds before auto-dismiss
     */
    show(message, type = 'info', duration = 3200) {
      if (!this.container) this.init();

      const icons = {
        info: 'ℹ️',
        success: '✨',
        warning: '🔔',
        error: '⚠️'
      };

      const toast = document.createElement('div');
      toast.className = `toast-item toast-${type}`;
      toast.innerHTML = `
        <span class="toast-icon">${icons[type] || 'ℹ️'}</span>
        <div class="toast-message">${message}</div>
        <button class="toast-close" aria-label="Dismiss">&times;</button>
      `;

      // Dismiss on close button
      const closeBtn = toast.querySelector('.toast-close');
      if (closeBtn) {
        closeBtn.addEventListener('click', () => this.dismiss(toast));
      }

      this.container.appendChild(toast);

      // Force layout for animation
      requestAnimationFrame(() => {
        toast.classList.add('toast-visible');
      });

      // Auto dismiss
      if (duration > 0) {
        setTimeout(() => this.dismiss(toast), duration);
      }
    },

    dismiss(toast) {
      if (!toast || toast._isDismissing) return;
      toast._isDismissing = true;
      toast.classList.remove('toast-visible');
      toast.classList.add('toast-hiding');
      setTimeout(() => {
        if (toast.parentNode) {
          toast.parentNode.removeChild(toast);
        }
      }, 300);
    }
  };

  /* ==========================================================================
     2. CLIPBOARD COPY HANDLER
     ========================================================================== */
  const ClipboardManager = {
    init() {
      const copyButtons = document.querySelectorAll('.btn-copy');
      copyButtons.forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          this.handleCopy(btn);
        });
      });
    },

    async handleCopy(btn) {
      // 1. Determine text to copy
      let textToCopy = btn.getAttribute('data-clipboard');

      if (!textToCopy) {
        // Fallback: search in parent code-box or pre/code sibling
        const parentBox = btn.closest('.code-box') || btn.parentElement;
        if (parentBox) {
          const codeEl = parentBox.querySelector('code') || parentBox.querySelector('pre');
          if (codeEl) {
            textToCopy = codeEl.textContent.trim();
          }
        }
      }

      if (!textToCopy) {
        Toast.show('Nothing to copy!', 'warning');
        return;
      }

      // 2. Perform write to clipboard
      let success = false;
      if (navigator.clipboard && window.isSecureContext) {
        try {
          await navigator.clipboard.writeText(textToCopy);
          success = true;
        } catch (err) {
          console.warn('Navigator clipboard failed, attempting fallback...', err);
          success = this.fallbackCopy(textToCopy);
        }
      } else {
        success = this.fallbackCopy(textToCopy);
      }

      // 3. Visual feedback
      if (success) {
        const originalHtml = btn.innerHTML;
        btn.innerHTML = '✓ Copied!';
        btn.classList.add('copied');
        btn.disabled = true;

        Toast.show('Command copied to clipboard!', 'success', 2000);

        setTimeout(() => {
          btn.innerHTML = originalHtml;
          btn.classList.remove('copied');
          btn.disabled = false;
        }, 2000);
      } else {
        Toast.show('Failed to copy to clipboard', 'error');
      }
    },

    fallbackCopy(text) {
      try {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.top = '-9999px';
        textArea.style.left = '-9999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        const successful = document.execCommand('copy');
        document.body.removeChild(textArea);
        return successful;
      } catch (err) {
        console.error('Fallback copy error:', err);
        return false;
      }
    }
  };

  /* ==========================================================================
     3. QUICK START PLATFORM TABS
     ========================================================================== */
  const PlatformTabsManager = {
    init() {
      const tabs = document.querySelectorAll('.platform-tab');
      const contents = document.querySelectorAll('.platform-content');

      if (!tabs.length) return;

      tabs.forEach((tab) => {
        tab.addEventListener('click', () => {
          const platform = tab.getAttribute('data-platform');
          if (!platform) return;

          // Deactivate all
          tabs.forEach((t) => t.classList.remove('active'));
          contents.forEach((c) => c.classList.remove('active'));

          // Activate selected
          tab.classList.add('active');
          const targetContent = document.getElementById(`platform-${platform}`);
          if (targetContent) {
            targetContent.classList.add('active');
          }
        });
      });
    }
  };

  /* ==========================================================================
     4. INTERACTIVE DEMO SIMULATOR
     ========================================================================== */
  const DemoSimulator = {
    // Current Active Game Profile
    activeAppId: '294100',

    // Game Database Definitions
    games: {
      '294100': {
        name: 'RimWorld',
        path: 'C:\\Games\\RimWorld\\Mods',
        mods: [
          {
            id: '2009463077',
            title: 'Harmony',
            author: 'Andreas Pardeike',
            tags: ['Framework', '1.5', '1.6'],
            status: 'up-to-date',
            size: '1.2 MB',
            desc: 'A library for patching, replacing and decorating .NET and Mono methods during runtime.',
            icon: '🧩',
            steam: true
          },
          {
            id: '818773962',
            title: 'HugsLib',
            author: 'UnlimitedHugs',
            tags: ['Framework', '1.5'],
            status: 'up-to-date',
            size: '840 KB',
            desc: 'Shared foundational mod library for quick development and automated log reporting.',
            icon: '📦',
            steam: true
          },
          {
            id: '2890901001',
            title: 'Combat Extended',
            author: 'CE Team',
            tags: ['Gameplay', '1.5'],
            status: 'update-available',
            size: '48.5 MB',
            desc: 'Completely overhauls RimWorld combat, ballistics, ammunition, and armor mechanics.',
            icon: '⚔️',
            steam: true
          },
          {
            id: '2023507013',
            title: 'Vanilla Expanded Framework',
            author: 'Oskar Potocki',
            tags: ['Framework', '1.5', '1.6'],
            status: 'update-available',
            size: '24.1 MB',
            desc: 'Essential framework required by all Vanilla Expanded series mods.',
            icon: '🏛️',
            steam: true
          },
          {
            id: '735106432',
            title: 'EdB Prepare Carefully',
            author: 'edbmods',
            tags: ['Gameplay', '1.5'],
            status: 'up-to-date',
            size: '3.6 MB',
            desc: 'Customize your colonists, equipment, and starting resources before landing.',
            icon: '🧑‍🚀',
            steam: true
          },
          {
            id: '2479389928',
            title: 'RocketMan - Performance Mod',
            author: 'Madman',
            tags: ['Gameplay', '1.5', '1.6'],
            status: 'up-to-date',
            size: '2.1 MB',
            desc: 'Vastly improves late-game tick rate and framerate through caching and optimization.',
            icon: '🚀',
            steam: true
          }
        ]
      },
      '281990': {
        name: 'Stellaris',
        path: 'C:\\Games\\Stellaris\\mod',
        mods: [
          {
            id: '1805627705',
            title: 'Planetary Diversity',
            author: 'Gatekeeper',
            tags: ['Gameplay', 'Framework'],
            status: 'up-to-date',
            size: '120 MB',
            desc: 'Adds over 50 unique planet types, habitability classes, and rare worlds.',
            icon: '🪐',
            steam: true
          },
          {
            id: '1121692237',
            title: 'Gigastructural Engineering & More',
            author: 'Elowiny',
            tags: ['Gameplay'],
            status: 'update-available',
            size: '350 MB',
            desc: 'Massive megastructures, celestial weapons, and mid/late-game crises.',
            icon: '🌌',
            steam: true
          },
          {
            id: '1623423360',
            title: 'UI Overhaul Dynamic',
            author: 'Orrie',
            tags: ['Framework', '1.5'],
            status: 'up-to-date',
            size: '18 MB',
            desc: 'Clean, high-resolution modular UI scaling smoothly up to 4K resolution.',
            icon: '🖥️',
            steam: true
          },
          {
            id: '937289339',
            title: 'Real Space 3.8',
            author: 'Annatar',
            tags: ['Gameplay'],
            status: 'up-to-date',
            size: '85 MB',
            desc: 'Visual realism overhaul with hyper-realistic star systems and orbits.',
            icon: '✨',
            steam: true
          }
        ]
      },
      '255710': {
        name: 'Cities: Skylines',
        path: 'C:\\Games\\Cities_Skylines\\Files\\Mods',
        mods: [
          {
            id: '1619685021',
            title: 'Move It',
            author: 'Quboid',
            tags: ['Framework', 'Gameplay'],
            status: 'up-to-date',
            size: '2.8 MB',
            desc: 'Select, move, align, and rotate any building, network, tree, or prop.',
            icon: '🏗️',
            steam: true
          },
          {
            id: '1637663252',
            title: 'Traffic Manager: President Edition',
            author: 'Krzychu124',
            tags: ['Gameplay'],
            status: 'update-available',
            size: '14 MB',
            desc: 'Advanced intersection control, lane arrows, speed limits, and traffic AI.',
            icon: '🚦',
            steam: true
          },
          {
            id: '2040656402',
            title: 'Harmony 2.2-2 (Cities Edition)',
            author: 'boformer',
            tags: ['Framework'],
            status: 'up-to-date',
            size: '1.1 MB',
            desc: 'Dependency framework for Cities: Skylines harmony patching.',
            icon: '🧩',
            steam: true
          },
          {
            id: '2565563873',
            title: 'Network Multitool',
            author: 'macsergey',
            tags: ['Gameplay'],
            status: 'up-to-date',
            size: '3.4 MB',
            desc: 'Slopes, curves, parallel networks, and road intersection management.',
            icon: '🛣️',
            steam: true
          }
        ]
      },
      '108600': {
        name: 'Project Zomboid',
        path: 'C:\\Users\\Gamer\\Zomboid\\mods',
        mods: [
          {
            id: '2169435997',
            title: 'Mod Options',
            author: 'Chuckleberry',
            tags: ['Framework'],
            status: 'up-to-date',
            size: '1.5 MB',
            desc: 'Centralized settings menu interface for configuring community mods.',
            icon: '⚙️',
            steam: true
          },
          {
            id: '2613146550',
            title: 'True Music',
            author: 'Tsar',
            tags: ['Gameplay'],
            status: 'update-available',
            size: '92 MB',
            desc: 'Adds working cassette tapes, vinyl records, and boomboxes to the apocalypse.',
            icon: '📻',
            steam: true
          },
          {
            id: '1510950729',
            title: 'Filibuster Rhymes\' Used Cars!',
            author: 'Filibuster Rhymes',
            tags: ['Gameplay'],
            status: 'up-to-date',
            size: '145 MB',
            desc: 'Dozens of lore-friendly 1980s and 1990s civilian and emergency vehicles.',
            icon: '🚗',
            steam: true
          },
          {
            id: '2875848298',
            title: 'Common Sense',
            author: 'Braven',
            tags: ['Gameplay', '1.5'],
            status: 'up-to-date',
            size: '4.2 MB',
            desc: 'Prying open doors with crowbars, opening canned food with knives, and more.',
            icon: '🧠',
            steam: true
          }
        ]
      }
    },

    // Dynamic Download Queue
    queueItems: [
      {
        id: 'q-1',
        title: 'Vanilla Expanded Framework',
        workshopId: '2023507013',
        worker: 'Worker 1',
        status: 'downloading',
        progress: 68,
        speed: '24.6 MB/s'
      },
      {
        id: 'q-2',
        title: 'RocketMan - Performance Mod',
        workshopId: '2479389928',
        worker: 'Worker 2',
        status: 'staged',
        progress: 100,
        speed: 'Staged'
      },
      {
        id: 'q-3',
        title: 'Harmony Library',
        workshopId: '2009463077',
        worker: 'Worker 3',
        status: 'completed',
        progress: 100,
        speed: 'Deployed'
      }
    ],

    // Log lines pool
    logPool: [
      { tag: 'WorkerPool', text: 'Allocated isolated sandbox: temp_workers/worker_1' },
      { tag: 'SteamCMD', text: 'Connecting anonymously to Steam Public CDN... OK' },
      { tag: 'Download', text: 'Worker 1: fetching depot chunk 2009463077 (34.2 MB / 48.5 MB)' },
      { tag: 'ACF_Lock', text: 'Worker 2: isolated ACF manifest verified, zero lock conflicts' },
      { tag: 'BackupEngine', text: 'Archived existing mod to backups/CombatExtended_2026-09-05.zip' },
      { tag: 'ModScanner', text: 'Parsed About.xml: matched PublishedFileId 2023507013' },
      { tag: 'WorkerPool', text: 'Download completed. Atomic move from temp_workers/ to mods/ successful.' },
      { tag: 'WebSocket', text: 'Broadcasted queue update to all active browser clients (count: 1)' }
    ],
    logIndex: 0,

    init() {
      this.initTabs();
      this.initProfileSwitcher();
      this.initModsTab();
      this.initQueueTab();
      this.initHealerTab();
      this.initSettingsTab();
      this.initLogsTab();
      this.initHeaderButtons();
    },

    /* --------------------------------------------------------------------------
       4.1 Tab Switching
       -------------------------------------------------------------------------- */
    initTabs() {
      const tabs = document.querySelectorAll('.demo-tab');
      const panes = document.querySelectorAll('.demo-pane');

      tabs.forEach((tab) => {
        tab.addEventListener('click', () => {
          const targetTab = tab.getAttribute('data-tab');
          if (!targetTab) return;

          tabs.forEach((t) => t.classList.remove('active'));
          panes.forEach((p) => p.classList.remove('active'));

          tab.classList.add('active');
          const targetPane = document.getElementById(`demo-pane-${targetTab}`);
          if (targetPane) {
            targetPane.classList.add('active');
          }
        });
      });
    },

    /* --------------------------------------------------------------------------
       4.2 Profile Switcher
       -------------------------------------------------------------------------- */
    initProfileSwitcher() {
      const select = document.getElementById('demo-profile-select');

      if (!select) return;

      select.addEventListener('change', (e) => {
        const appId = e.target.value;
        this.switchGameProfile(appId);
      });

      // Also support settings preset buttons if present
      const settingsSelect = document.querySelector('#demo-pane-settings select');
      if (settingsSelect) {
        settingsSelect.addEventListener('change', (e) => {
          const match = e.target.value.match(/\((\d+)\)/);
          if (match && match[1]) {
            if (select) select.value = match[1];
            this.switchGameProfile(match[1]);
          }
        });
      }
    },

    switchGameProfile(appId) {
      if (!this.games[appId]) return;
      this.activeAppId = appId;
      const game = this.games[appId];

      // Update header badge
      const headerGame = document.getElementById('demo-header-game');
      if (headerGame) {
        headerGame.textContent = `${game.name} (AppID: ${appId})`;
      }

      // Update settings path if present
      const settingsPath = document.querySelector('#demo-pane-settings input[readonly]');
      if (settingsPath) {
        settingsPath.value = game.path;
      }

      // Re-render mods
      this.renderMods();

      Toast.show(`🎮 Switched active profile to ${game.name} (${appId})`, 'info');
      this.appendConsoleLog(`[ProfileManager] Switched active profile to ${game.name} (AppID: ${appId})`);
    },

    /* --------------------------------------------------------------------------
       4.3 Installed Mods Tab
       -------------------------------------------------------------------------- */
    initModsTab() {
      // Search input
      const searchInput = document.getElementById('demo-search-input');
      if (searchInput) {
        searchInput.addEventListener('input', () => this.filterMods());
      }

      // Status filter
      const statusSelect = document.getElementById('demo-status-select');
      if (statusSelect) {
        statusSelect.addEventListener('change', () => this.filterMods());
      }

      // Tag filter
      const tagSelect = document.getElementById('demo-tag-select');
      if (tagSelect) {
        tagSelect.addEventListener('change', () => this.filterMods());
      }

      // Check for Updates button
      const checkBtn = document.getElementById('demo-btn-check-updates');
      if (checkBtn) {
        checkBtn.addEventListener('click', () => this.checkForUpdates());
      }

      // Update All Outdated button
      const updateAllBtn = document.getElementById('demo-btn-update-all');
      if (updateAllBtn) {
        updateAllBtn.addEventListener('click', () => this.updateAllOutdated());
      }

      // Quick update banner button
      const quickUpdateBtn = document.getElementById('demo-btn-quick-update');
      if (quickUpdateBtn) {
        quickUpdateBtn.addEventListener('click', () => this.updateAllOutdated());
      }

      // Initial render
      this.renderMods();
    },

    renderMods(filteredList = null) {
      const grid = document.getElementById('demo-mods-grid');
      const badge = document.getElementById('demo-mods-badge');
      if (!grid) return;

      const currentMods = this.games[this.activeAppId].mods;
      const listToRender = filteredList || currentMods;

      if (badge) {
        badge.textContent = currentMods.length;
      }

      if (listToRender.length === 0) {
        grid.innerHTML = `
          <div class="demo-empty-state" style="grid-column: 1 / -1; padding: 40px 20px; text-align: center; color: #94a3b8;">
            <div style="font-size: 2rem; margin-bottom: 8px;">🔍</div>
            <strong>No matching mods found</strong>
            <p style="font-size: 0.85rem; margin-top: 4px;">Try loosening your search or tag filters.</p>
          </div>
        `;
        return;
      }

      grid.innerHTML = listToRender
        .map((mod) => {
          const isOutdated = mod.status === 'update-available';
          const statusBadge = isOutdated
            ? `<span class="badge badge-warning">⬆ Update Available</span>`
            : `<span class="badge badge-success">✓ Up to date</span>`;

          const tagBadges = mod.tags
            .map((t) => `<span class="mod-tag">${t}</span>`)
            .join(' ');

          return `
            <div class="demo-mod-card ${isOutdated ? 'mod-card-outdated' : ''}" data-mod-id="${mod.id}">
              <div class="mod-card-header">
                <div class="mod-icon">${mod.icon || '📦'}</div>
                <div class="mod-title-box">
                  <h4 class="mod-title">${mod.title}</h4>
                  <div class="mod-author">by <span>${mod.author}</span></div>
                </div>
                ${statusBadge}
              </div>
              
              <p class="mod-desc">${mod.desc}</p>

              <div class="mod-meta-row">
                <div class="mod-tags">${tagBadges}</div>
                <span class="mod-size">${mod.size}</span>
              </div>

              <div class="mod-footer">
                <span class="mod-id-code">ID: ${mod.id}</span>
                <div class="mod-actions">
                  ${
                    isOutdated
                      ? `<button class="btn-demo btn-demo-amber btn-xs btn-mod-update" data-id="${mod.id}">⬆ Update</button>`
                      : `<button class="btn-demo btn-demo-secondary btn-xs btn-mod-view" data-id="${mod.id}">📁 Files</button>`
                  }
                </div>
              </div>
            </div>
          `;
        })
        .join('');

      // Attach single mod update buttons
      grid.querySelectorAll('.btn-mod-update').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          const modId = e.currentTarget.getAttribute('data-id');
          this.updateSingleMod(modId);
        });
      });

      // Attach files click
      grid.querySelectorAll('.btn-mod-view').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          const modId = e.currentTarget.getAttribute('data-id');
          const mod = currentMods.find((m) => m.id === modId);
          Toast.show(`Opened files for <strong>${mod ? mod.title : modId}</strong>`, 'info');
        });
      });
    },

    filterMods() {
      const searchInput = document.getElementById('demo-search-input');
      const statusSelect = document.getElementById('demo-status-select');
      const tagSelect = document.getElementById('demo-tag-select');

      const query = (searchInput ? searchInput.value : '').toLowerCase().trim();
      const status = statusSelect ? statusSelect.value : 'all';
      const tag = tagSelect ? tagSelect.value : '';

      const currentMods = this.games[this.activeAppId].mods;

      const filtered = currentMods.filter((mod) => {
        // Search filter
        const matchesQuery =
          !query ||
          mod.title.toLowerCase().includes(query) ||
          mod.author.toLowerCase().includes(query) ||
          mod.id.includes(query) ||
          mod.tags.some((t) => t.toLowerCase().includes(query));

        // Status filter
        let matchesStatus = true;
        if (status === 'updates') {
          matchesStatus = mod.status === 'update-available';
        } else if (status === 'steam') {
          matchesStatus = mod.steam === true;
        }

        // Tag filter
        let matchesTag = true;
        if (tag) {
          matchesTag = mod.tags.includes(tag);
        }

        return matchesQuery && matchesStatus && matchesTag;
      });

      this.renderMods(filtered);
    },

    checkForUpdates() {
      const checkBtn = document.getElementById('demo-btn-check-updates');
      if (!checkBtn) return;

      const originalHtml = checkBtn.innerHTML;
      checkBtn.innerHTML = '<span class="btn-spinner"></span> Checking...';
      checkBtn.disabled = true;

      setTimeout(() => {
        checkBtn.innerHTML = originalHtml;
        checkBtn.disabled = false;

        const currentMods = this.games[this.activeAppId].mods;
        // Make at least 2 mods outdated
        if (currentMods.length >= 2) {
          currentMods[0].status = 'update-available';
          currentMods[1].status = 'update-available';
        }

        // Reveal banner
        const banner = document.getElementById('demo-updates-banner');
        if (banner) {
          banner.style.display = 'flex';
        }

        // Reveal update all button
        const updateAllBtn = document.getElementById('demo-btn-update-all');
        const outdatedCount = document.getElementById('demo-outdated-count');
        const count = currentMods.filter((m) => m.status === 'update-available').length;

        if (outdatedCount) outdatedCount.textContent = count;
        if (updateAllBtn) updateAllBtn.style.display = 'inline-flex';

        this.filterMods();

        Toast.show(`🔔 Steam Workshop check finished: ${count} updates found!`, 'warning');
        this.appendConsoleLog(`[SteamAPI] QueryFiles metadata returned: ${count} outdated mods flagged for update`);
      }, 550);
    },

    updateAllOutdated() {
      const updateAllBtn = document.getElementById('demo-btn-update-all');
      const quickUpdateBtn = document.getElementById('demo-btn-quick-update');

      if (updateAllBtn) {
        updateAllBtn.innerHTML = '<span class="btn-spinner"></span> Updating & Backing up...';
        updateAllBtn.disabled = true;
      }
      if (quickUpdateBtn) {
        quickUpdateBtn.innerHTML = '<span class="btn-spinner"></span> Backing up...';
        quickUpdateBtn.disabled = true;
      }

      setTimeout(() => {
        const currentMods = this.games[this.activeAppId].mods;
        let count = 0;
        currentMods.forEach((m) => {
          if (m.status === 'update-available') {
            m.status = 'up-to-date';
            count++;
          }
        });

        // Hide banner & update all button
        const banner = document.getElementById('demo-updates-banner');
        if (banner) banner.style.display = 'none';

        if (updateAllBtn) {
          updateAllBtn.style.display = 'none';
          updateAllBtn.innerHTML = '⬆️ Update All Outdated (<span id="demo-outdated-count">0</span>)';
          updateAllBtn.disabled = false;
        }
        if (quickUpdateBtn) {
          quickUpdateBtn.innerHTML = 'Update Now';
          quickUpdateBtn.disabled = false;
        }

        this.filterMods();

        Toast.show(`✨ ${count} mods updated! Backups saved to <code>backups/</code>`, 'success', 3500);
        this.appendConsoleLog(`[BackupEngine] Created automatic zip rollback archives in backups/`);
        this.appendConsoleLog(`[WorkerPool] Batch update completed successfully: ${count} mods up to date.`);
      }, 900);
    },

    updateSingleMod(modId) {
      const currentMods = this.games[this.activeAppId].mods;
      const mod = currentMods.find((m) => m.id === modId);
      if (!mod) return;

      mod.status = 'up-to-date';
      this.filterMods();

      // Check if any remain outdated
      const remaining = currentMods.filter((m) => m.status === 'update-available').length;
      const banner = document.getElementById('demo-updates-banner');
      const updateAllBtn = document.getElementById('demo-btn-update-all');
      const outdatedCount = document.getElementById('demo-outdated-count');

      if (outdatedCount) outdatedCount.textContent = remaining;
      if (remaining === 0) {
        if (banner) banner.style.display = 'none';
        if (updateAllBtn) updateAllBtn.style.display = 'none';
      }

      Toast.show(`✨ <strong>${mod.title}</strong> updated to latest Steam version!`, 'success');
      this.appendConsoleLog(`[WorkerPool] Updated mod ${mod.title} (${mod.id}) - backup archived.`);
    },

    /* --------------------------------------------------------------------------
       4.4 Download Queue Tab
       -------------------------------------------------------------------------- */
    initQueueTab() {
      const addBtn = document.getElementById('demo-btn-add-queue');
      const input = document.getElementById('demo-queue-input');

      if (addBtn && input) {
        addBtn.addEventListener('click', () => this.addToQueue());
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            this.addToQueue();
          }
        });
      }

      this.renderQueue();
    },

    renderQueue() {
      const list = document.getElementById('demo-queue-list');
      const badge = document.getElementById('demo-queue-badge');
      if (!list) return;

      const activeCount = this.queueItems.filter((i) => i.status === 'downloading').length;
      if (badge) badge.textContent = this.queueItems.length;

      if (this.queueItems.length === 0) {
        list.innerHTML = `
          <div class="demo-empty-state" style="padding: 30px; text-align: center; color: #94a3b8;">
            No items in download queue. Paste a Workshop URL or ID above!
          </div>
        `;
        return;
      }

      list.innerHTML = this.queueItems
        .map((item) => {
          let statusBadge = '';
          if (item.status === 'downloading') {
            statusBadge = `<span class="badge badge-cyan pulse-glow">⚡ Downloading (${item.progress}%)</span>`;
          } else if (item.status === 'staged') {
            statusBadge = `<span class="badge badge-warning">📦 Downloaded &amp; Staged</span>`;
          } else {
            statusBadge = `<span class="badge badge-success">✓ Completed &amp; Deployed</span>`;
          }

          return `
            <div class="queue-item" id="${item.id}">
              <div class="queue-item-header">
                <div class="queue-item-title-box">
                  <strong class="queue-item-title">${item.title}</strong>
                  <span class="queue-item-id">ID: ${item.workshopId}</span>
                </div>
                <div class="queue-item-meta">
                  <span class="queue-worker-tag">${item.worker}</span>
                  ${statusBadge}
                </div>
              </div>

              <div class="queue-progress-bar-bg">
                <div class="queue-progress-bar-fill" style="width: ${item.progress}%;"></div>
              </div>

              <div class="queue-item-footer">
                <span class="queue-speed-label">${item.speed}</span>
                <span class="queue-staging-path">temp_workers/${item.worker.toLowerCase().replace(' ', '_')}</span>
              </div>
            </div>
          `;
        })
        .join('');
    },

    addToQueue() {
      const input = document.getElementById('demo-queue-input');
      if (!input) return;

      const rawVal = input.value.trim();
      if (!rawVal) {
        Toast.show('Please enter a Steam Workshop ID or URL!', 'warning');
        return;
      }

      // Extract ID or use clean number
      const match = rawVal.match(/id=(\d+)/) || rawVal.match(/(\d{6,12})/);
      const workshopId = match ? match[1] : `${Math.floor(1000000000 + Math.random() * 900000000)}`;
      const title = `Workshop Item #${workshopId.slice(0, 6)}`;

      const workerNum = (this.queueItems.length % 4) + 1;
      const newItem = {
        id: `q-${Date.now()}`,
        title: title,
        workshopId: workshopId,
        worker: `Worker ${workerNum}`,
        status: 'downloading',
        progress: 0,
        speed: '18.4 MB/s'
      };

      this.queueItems.unshift(newItem);
      input.value = '';
      this.renderQueue();

      Toast.show(`⚡ Added <strong>${title}</strong> to download queue!`, 'info');
      this.appendConsoleLog(`[WorkerPool] Dispatched ${workshopId} to Worker ${workerNum} in isolated staging directory`);

      // Start animated progress
      this.simulateDownload(newItem);
    },

    simulateDownload(item) {
      const speeds = ['18.4 MB/s', '24.1 MB/s', '31.5 MB/s', '28.9 MB/s', '35.0 MB/s'];
      const speedVal = document.getElementById('demo-speed-val');

      const interval = setInterval(() => {
        if (item.progress < 100) {
          item.progress = Math.min(100, item.progress + Math.floor(Math.random() * 14 + 10));
          const randomSpeed = speeds[Math.floor(Math.random() * speeds.length)];
          item.speed = randomSpeed;
          if (speedVal) speedVal.textContent = randomSpeed;

          // Update element directly for smooth performance
          const el = document.getElementById(item.id);
          if (el) {
            const fill = el.querySelector('.queue-progress-bar-fill');
            const speedLbl = el.querySelector('.queue-speed-label');
            const badge = el.querySelector('.badge');
            if (fill) fill.style.width = `${item.progress}%`;
            if (speedLbl) speedLbl.textContent = item.speed;
            if (badge) badge.textContent = `⚡ Downloading (${item.progress}%)`;
          }
        } else {
          clearInterval(interval);
          item.status = 'staged';
          item.speed = 'Downloaded & Staged';
          this.renderQueue();

          Toast.show(`✨ <strong>${item.title}</strong> downloaded and staged!`, 'success');
          this.appendConsoleLog(`[SteamCMD] Worker ${item.worker}: Item ${item.workshopId} successfully staged in temp_workers/`);
        }
      }, 250);
    },

    /* --------------------------------------------------------------------------
       4.5 Folder Healer Tab
       -------------------------------------------------------------------------- */
    initHealerTab() {
      const scanBtn = document.getElementById('demo-btn-scan-loose');
      const repairBtn = document.getElementById('demo-btn-repair-meta');

      if (scanBtn) {
        scanBtn.addEventListener('click', () => this.scanLooseFolders());
      }
      if (repairBtn) {
        repairBtn.addEventListener('click', () => this.repairAllMetadata());
      }
    },

    scanLooseFolders() {
      const scanBtn = document.getElementById('demo-btn-scan-loose');
      const progressWrap = document.getElementById('demo-healer-progress-wrap');
      const progressFill = document.getElementById('demo-healer-progress-fill');
      const statusText = document.getElementById('demo-healer-status-text');
      const tableWrap = document.getElementById('demo-healer-table-wrap');
      const tbody = document.getElementById('demo-healer-tbody');

      if (!progressWrap || !progressFill || !statusText) return;

      // Reset state
      progressWrap.style.display = 'block';
      progressFill.style.width = '0%';
      statusText.textContent = 'Scanning directories for loose and unindexed mod folders...';
      if (scanBtn) scanBtn.disabled = true;

      const steps = [
        { percent: '25%', text: 'Inspecting folder structure and About.xml / modinfo manifests...' },
        { percent: '60%', text: 'Matching extracted mod titles against live Steam Web API...' },
        { percent: '90%', text: 'Generating repair actions for missing PublishedFileId.txt...' },
        { percent: '100%', text: 'Scan complete! 3 loose folders identified.' }
      ];

      let stepIndex = 0;
      const interval = setInterval(() => {
        if (stepIndex < steps.length) {
          progressFill.style.width = steps[stepIndex].percent;
          statusText.textContent = steps[stepIndex].text;
          stepIndex++;
        } else {
          clearInterval(interval);
          setTimeout(() => {
            progressWrap.style.display = 'none';
            if (scanBtn) scanBtn.disabled = false;

            // Populate comparison table
            if (tbody) {
              tbody.innerHTML = `
                <tr id="healer-row-1">
                  <td><code class="code-badge">2009463077</code></td>
                  <td><strong>Combat Extended</strong></td>
                  <td><span class="badge badge-cyan">2009463077</span></td>
                  <td class="action-cell">
                    <span class="badge badge-warning">Generate PublishedFileId &amp; rename</span>
                  </td>
                </tr>
                <tr id="healer-row-2">
                  <td><code class="code-badge">Mod 3606988448</code></td>
                  <td><strong>Vanilla Weapons Expanded</strong></td>
                  <td><span class="badge badge-cyan">3606988448</span></td>
                  <td class="action-cell">
                    <span class="badge badge-warning">Strip prefix &amp; repair metadata</span>
                  </td>
                </tr>
                <tr id="healer-row-3">
                  <td><code class="code-badge">HugsLib_unzip</code></td>
                  <td><strong>HugsLib</strong></td>
                  <td><span class="badge badge-cyan">818773962</span></td>
                  <td class="action-cell">
                    <span class="badge badge-warning">Clean folder name &amp; link Steam ID</span>
                  </td>
                </tr>
              `;
            }

            if (tableWrap) tableWrap.style.display = 'block';
            Toast.show('🔍 Scan complete: 3 loose mod folders detected!', 'info');
            this.appendConsoleLog(`[ModRefactorer] Found 3 loose folders requiring metadata healing and title normalization.`);
          }, 400);
        }
      }, 300);
    },

    repairAllMetadata() {
      const repairBtn = document.getElementById('demo-btn-repair-meta');
      if (!repairBtn) return;

      repairBtn.innerHTML = '<span class="btn-spinner"></span> Repairing & Renaming...';
      repairBtn.disabled = true;

      const rows = [
        { id: 'healer-row-1', successText: '✓ PublishedFileId: 2009463077 generated & renamed' },
        { id: 'healer-row-2', successText: '✓ Cleaned to "Vanilla Weapons Expanded"' },
        { id: 'healer-row-3', successText: '✓ HugsLib metadata linked and synchronized' }
      ];

      let idx = 0;
      const stepInterval = setInterval(() => {
        if (idx < rows.length) {
          const row = document.getElementById(rows[idx].id);
          if (row) {
            const cell = row.querySelector('.action-cell');
            if (cell) {
              cell.innerHTML = `<span class="badge badge-success">${rows[idx].successText}</span>`;
            }
          }
          idx++;
        } else {
          clearInterval(stepInterval);
          repairBtn.innerHTML = '✓ All Folders Healed &amp; Renamed';
          repairBtn.classList.remove('btn-demo-success');
          repairBtn.classList.add('btn-demo-secondary');

          Toast.show('✨ All 3 loose folders repaired and indexed for 1-click updates!', 'success', 3500);
          this.appendConsoleLog(`[ModRefactorer] Generated missing PublishedFileId.txt for 3 items and renamed folders cleanly.`);
        }
      }, 350);
    },

    /* --------------------------------------------------------------------------
       4.6 Settings Tab
       -------------------------------------------------------------------------- */
    initSettingsTab() {
      const slider = document.getElementById('demo-worker-slider');
      const label = document.getElementById('demo-worker-num');

      if (slider && label) {
        slider.addEventListener('input', () => {
          label.textContent = `${slider.value} Workers`;
          this.appendConsoleLog(`[Config] Parallel worker count updated to ${slider.value}`);
        });
      }
    },

    /* --------------------------------------------------------------------------
       4.7 Console Logs Tab
       -------------------------------------------------------------------------- */
    initLogsTab() {
      const term = document.getElementById('demo-console-output');
      const simBtn = document.getElementById('demo-btn-sim-log');

      // Pre-populate with initial logs
      if (term && term.children.length === 0) {
        const initialLogs = [
          { tag: 'WorkerPool', text: 'Initialized isolated staging environments in temp_workers/ (worker_1 .. worker_4)' },
          { tag: 'SteamCMD', text: 'Checking SteamCMD binary at bin/steamcmd.sh... Validated OK' },
          { tag: 'MetadataCache', text: 'Loaded 6 cached mod entries from data/workshop_cache.json' },
          { tag: 'FastAPI', text: 'Server running on http://127.0.0.1:8080 (Press CTRL+C or click Stop to quit)' },
          { tag: 'WebSocket', text: 'WebSocket listener connected on /ws/stream' }
        ];

        term.innerHTML = initialLogs.map((l) => this.formatLogLine(l.tag, l.text)).join('');
      }

      if (simBtn) {
        simBtn.addEventListener('click', () => {
          const item = this.logPool[this.logIndex % this.logPool.length];
          this.logIndex++;
          this.appendConsoleLog(`[${item.tag}] ${item.text}`);
        });
      }
    },

    formatLogLine(tag, text) {
      const now = new Date();
      const timeStr = now.toTimeString().split(' ')[0];
      return `<div class="term-line"><span class="term-time">[${timeStr}]</span> <span class="term-tag">[${tag}]</span> ${text}</div>`;
    },

    appendConsoleLog(rawMessage) {
      const term = document.getElementById('demo-console-output');
      if (!term) return;

      const now = new Date();
      const timeStr = now.toTimeString().split(' ')[0];
      const div = document.createElement('div');
      div.className = 'term-line';
      div.innerHTML = `<span class="term-time">[${timeStr}]</span> ${rawMessage}`;
      term.appendChild(div);

      // Auto scroll to bottom
      term.scrollTop = term.scrollHeight;
    },

    /* --------------------------------------------------------------------------
       4.8 Demo Header Extra Actions
       -------------------------------------------------------------------------- */
    initHeaderButtons() {
      const openFolderBtn = document.getElementById('demo-btn-open-folder');
      if (openFolderBtn) {
        openFolderBtn.addEventListener('click', () => {
          const game = this.games[this.activeAppId];
          Toast.show(`📁 Simulating Explorer opening: <code>${game.path}</code>`, 'info');
        });
      }
    }
  };

  /* ==========================================================================
     5. FAQ ACCORDION
     ========================================================================== */
  const FaqManager = {
    init() {
      const questions = document.querySelectorAll('.faq-question');

      questions.forEach((q) => {
        q.addEventListener('click', () => {
          const item = q.closest('.faq-item');
          if (!item) return;

          const isActive = item.classList.contains('active');

          // Optional: close siblings
          const allItems = document.querySelectorAll('.faq-item');
          allItems.forEach((other) => {
            if (other !== item) other.classList.remove('active');
          });

          // Toggle current
          item.classList.toggle('active', !isActive);
        });
      });
    }
  };

  /* ==========================================================================
     6. MOBILE NAVIGATION MENU
     ========================================================================== */
  const MobileNavManager = {
    init() {
      const toggle = document.getElementById('mobile-menu-toggle');
      const drawer = document.getElementById('mobile-nav');

      if (!toggle || !drawer) return;

      toggle.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = drawer.classList.contains('open');
        drawer.classList.toggle('open', !isOpen);
        toggle.classList.toggle('active', !isOpen);
      });

      // Close when clicking any link inside drawer
      const links = drawer.querySelectorAll('.mobile-link');
      links.forEach((link) => {
        link.addEventListener('click', () => {
          drawer.classList.remove('open');
          toggle.classList.remove('active');
        });
      });

      // Close on click outside
      document.addEventListener('click', (e) => {
        if (!drawer.contains(e.target) && !toggle.contains(e.target)) {
          drawer.classList.remove('open');
          toggle.classList.remove('active');
        }
      });
    }
  };

  /* ==========================================================================
     7. SMOOTH SCROLLING WITH OFFSET
     ========================================================================== */
  const SmoothScrollManager = {
    init() {
      const anchorLinks = document.querySelectorAll('a[href^="#"]');
      const navbar = document.getElementById('navbar');

      anchorLinks.forEach((link) => {
        link.addEventListener('click', (e) => {
          const href = link.getAttribute('href');
          if (!href || href === '#') return;

          const target = document.querySelector(href);
          if (target) {
            e.preventDefault();

            const navHeight = navbar ? navbar.offsetHeight : 70;
            const targetPosition = target.getBoundingClientRect().top + window.pageYOffset - navHeight - 16;

            window.scrollTo({
              top: Math.max(0, targetPosition),
              behavior: 'smooth'
            });

            // Update URL cleanly without sudden jump
            if (history.pushState) {
              history.pushState(null, null, href);
            }
          }
        });
      });
    }
  };

  /* ==========================================================================
     INITIALIZATION ON DOM READY
     ========================================================================== */
  function onReady() {
    Toast.init();
    ClipboardManager.init();
    PlatformTabsManager.init();
    DemoSimulator.init();
    FaqManager.init();
    MobileNavManager.init();
    SmoothScrollManager.init();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', onReady);
  } else {
    onReady();
  }

})();
