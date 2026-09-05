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
      const tabs = document.querySelectorAll('.platform-tab, .platform-tab-btn');
      const contents = document.querySelectorAll('.platform-content');

      if (!tabs.length) return;

      tabs.forEach((tab) => {
        tab.addEventListener('click', () => {
          const platform = tab.getAttribute('data-platform');
          if (!platform) return;

          // Deactivate all
          tabs.forEach((t) => {
            t.classList.remove('active');
            t.setAttribute('aria-selected', 'false');
          });
          contents.forEach((c) => c.classList.remove('active'));

          // Activate selected
          tab.classList.add('active');
          tab.setAttribute('aria-selected', 'true');
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

    // Concurrency Worker Pool Settings
    concurrency: 4,

    // Loose folders database for folder healer tab across games
    looseFoldersByGame: {
      '294100': [
        { folder: '2009463077', title: 'Combat Extended', steamId: '2009463077', action: 'Generate PublishedFileId & rename' },
        { folder: 'Mod 3606988448', title: 'Vanilla Weapons Expanded', steamId: '3606988448', action: 'Strip prefix & repair metadata' },
        { folder: 'HugsLib_unzip', title: 'HugsLib', steamId: '818773962', action: 'Clean folder name & link Steam ID' }
      ],
      '281990': [
        { folder: 'gigastructures_extracted', title: 'Gigastructural Engineering', steamId: '1121692237', action: 'Generate PublishedFileId & rename' },
        { folder: 'Mod_1805627705', title: 'Planetary Diversity', steamId: '1805627705', action: 'Link Steam ID & rebuild manifest' },
        { folder: 'UI_Overhaul_Dynamic_Loose', title: 'UI Overhaul Dynamic', steamId: '1623423360', action: 'Normalize folder & link ID' }
      ],
      '255710': [
        { folder: 'MoveIt_v2_unpacked', title: 'Move It', steamId: '1619685021', action: 'Format folder & link Workshop ID' },
        { folder: 'TMPE_traffic_raw', title: 'Traffic Manager: President Edition', steamId: '1637663252', action: 'Generate PublishedFileId.txt' },
        { folder: 'Harmony_Cities_loose', title: 'Harmony 2.2-2', steamId: '2040656402', action: 'Fix casing & restore manifest' }
      ],
      '108600': [
        { folder: 'TrueMusic_custom_loose', title: 'True Music', steamId: '2613146550', action: 'Generate PublishedFileId & rename' },
        { folder: 'common_sense_41_extracted', title: 'Common Sense', steamId: '2875848298', action: 'Link Steam ID & rebuild manifest' },
        { folder: 'FilibusterCars_unzip', title: 'Filibuster Rhymes Used Cars', steamId: '1510950729', action: 'Repair folder structure & link ID' }
      ]
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
        speed: 'Staged in temp_workers/'
      },
      {
        id: 'q-3',
        title: 'Harmony Library',
        workshopId: '2009463077',
        worker: 'Worker 3',
        status: 'completed',
        progress: 100,
        speed: 'Deployed to mods/'
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
      { tag: 'WebSocket', text: 'Broadcasted queue update to all active browser clients (count: 1)' },
      { tag: 'FastAPI', text: 'GET /api/v1/mods HTTP/1.1 200 OK (2.4ms)' },
      { tag: 'SteamAPI', text: 'IPublishedFileService/QueryFiles responded with 20 items (cache hit)' },
      { tag: 'MetadataCache', text: 'Persisted 24 mod state records to data/workshop_cache.json' }
    ],
    logIndex: 0,
    allLogs: [],

    init() {
      this.initTabs();
      this.initProfileSwitcher();
      this.populateTagFilter();
      this.initModsTab();
      this.initQueueTab();
      this.initHealerTab();
      this.initSettingsTab();
      this.initLogsTab();
      this.initHeaderButtons();
      this.renderWorkerCards();
    },

    /* --------------------------------------------------------------------------
       4.1 Tab Switching (Accessible with ARIA sync)
       -------------------------------------------------------------------------- */
    initTabs() {
      const tabs = document.querySelectorAll('.demo-tab, .demo-tab-btn');
      const panes = document.querySelectorAll('.demo-pane');

      tabs.forEach((tab) => {
        tab.addEventListener('click', () => {
          const targetTab = tab.getAttribute('data-tab');
          if (!targetTab) return;

          tabs.forEach((t) => {
            t.classList.remove('active');
            t.setAttribute('aria-selected', 'false');
          });
          panes.forEach((p) => p.classList.remove('active'));

          tab.classList.add('active');
          tab.setAttribute('aria-selected', 'true');
          const targetPane = document.getElementById(`demo-pane-${targetTab}`);
          if (targetPane) {
            targetPane.classList.add('active');
          }
        });
      });
    },

    /* --------------------------------------------------------------------------
       4.2 Multi-Game Profile Switcher
       -------------------------------------------------------------------------- */
    initProfileSwitcher() {
      const headerSelect = document.getElementById('demo-profile-select');
      const settingsSelect = document.getElementById('demo-settings-game-select');

      const handleProfileChange = (appId) => {
        if (!appId) return;
        this.switchGameProfile(appId);
      };

      if (headerSelect) {
        headerSelect.addEventListener('change', (e) => handleProfileChange(e.target.value));
      }

      if (settingsSelect) {
        settingsSelect.addEventListener('change', (e) => handleProfileChange(e.target.value));
      }
    },

    switchGameProfile(appId) {
      if (!this.games[appId]) return;
      this.activeAppId = appId;
      const game = this.games[appId];

      // Synchronize header badge
      const headerGame = document.getElementById('demo-header-game');
      if (headerGame) {
        headerGame.textContent = `${game.name} (AppID: ${appId})`;
      }

      // Synchronize select dropdowns
      const headerSelect = document.getElementById('demo-profile-select');
      if (headerSelect && headerSelect.value !== appId) {
        headerSelect.value = appId;
      }
      const settingsSelect = document.getElementById('demo-settings-game-select');
      if (settingsSelect && settingsSelect.value !== appId) {
        settingsSelect.value = appId;
      }

      // Synchronize settings directory path
      const settingsPath = document.getElementById('demo-settings-path-input');
      if (settingsPath) {
        settingsPath.value = game.path;
      }

      // Populate tag filters dynamically for the active game
      this.populateTagFilter();

      // Reset search/filter inputs
      const searchInput = document.getElementById('demo-search-input');
      const statusSelect = document.getElementById('demo-status-select');
      if (searchInput) searchInput.value = '';
      if (statusSelect) statusSelect.value = 'all';

      // Re-render mods grid
      this.renderMods();

      Toast.show(`🎮 Switched active profile to <strong>${game.name}</strong> (${appId})`, 'info');
      this.appendConsoleLog('ProfileManager', `Switched active profile to ${game.name} (AppID: ${appId}) — Target: ${game.path}`);
    },

    populateTagFilter() {
      const tagSelect = document.getElementById('demo-tag-select');
      if (!tagSelect) return;

      const currentMods = this.games[this.activeAppId].mods;
      const tagSet = new Set();
      currentMods.forEach((m) => {
        if (Array.isArray(m.tags)) {
          m.tags.forEach((t) => tagSet.add(t));
        }
      });

      tagSelect.innerHTML = '<option value="">All Tags</option>';
      Array.from(tagSet).sort().forEach((tag) => {
        const opt = document.createElement('option');
        opt.value = tag;
        opt.textContent = tag;
        tagSelect.appendChild(opt);
      });
    },

    /* --------------------------------------------------------------------------
       4.3 Installed Mods Tab
       -------------------------------------------------------------------------- */
    initModsTab() {
      const searchInput = document.getElementById('demo-search-input');
      if (searchInput) {
        searchInput.addEventListener('input', () => this.filterMods());
      }

      const statusSelect = document.getElementById('demo-status-select');
      if (statusSelect) {
        statusSelect.addEventListener('change', () => this.filterMods());
      }

      const tagSelect = document.getElementById('demo-tag-select');
      if (tagSelect) {
        tagSelect.addEventListener('change', () => this.filterMods());
      }

      const checkBtn = document.getElementById('demo-btn-check-updates');
      if (checkBtn) {
        checkBtn.addEventListener('click', () => this.checkForUpdates());
      }

      const updateAllBtn = document.getElementById('demo-btn-update-all');
      if (updateAllBtn) {
        updateAllBtn.addEventListener('click', () => this.updateAllOutdated());
      }

      const quickUpdateBtn = document.getElementById('demo-btn-quick-update');
      if (quickUpdateBtn) {
        quickUpdateBtn.addEventListener('click', () => this.updateAllOutdated());
      }

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
          <div class="demo-empty-state" style="grid-column: 1 / -1; padding: 40px 20px; text-align: center; color: var(--text-muted);">
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
                      ? `<button class="btn btn-warning btn-xs btn-mod-update" data-id="${mod.id}">⬆ Update</button>`
                      : `<button class="btn btn-secondary btn-xs btn-mod-view" data-id="${mod.id}">📁 Files</button>`
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

      // Attach view files buttons
      grid.querySelectorAll('.btn-mod-view').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          const modId = e.currentTarget.getAttribute('data-id');
          const mod = currentMods.find((m) => m.id === modId);
          Toast.show(`Opened folder for <strong>${mod ? mod.title : modId}</strong> in <code>${this.games[this.activeAppId].path}</code>`, 'info');
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
        const matchesQuery =
          !query ||
          mod.title.toLowerCase().includes(query) ||
          mod.author.toLowerCase().includes(query) ||
          mod.id.includes(query) ||
          (Array.isArray(mod.tags) && mod.tags.some((t) => t.toLowerCase().includes(query)));

        let matchesStatus = true;
        if (status === 'updates') {
          matchesStatus = mod.status === 'update-available';
        } else if (status === 'steam') {
          matchesStatus = mod.steam === true;
        }

        let matchesTag = true;
        if (tag) {
          matchesTag = Array.isArray(mod.tags) && mod.tags.includes(tag);
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
        if (currentMods.length >= 2) {
          currentMods[0].status = 'update-available';
          currentMods[1].status = 'update-available';
        }

        const banner = document.getElementById('demo-updates-banner');
        if (banner) {
          banner.style.display = 'flex';
        }

        const updateAllBtn = document.getElementById('demo-btn-update-all');
        const outdatedCount = document.getElementById('demo-outdated-count');
        const count = currentMods.filter((m) => m.status === 'update-available').length;

        if (outdatedCount) outdatedCount.textContent = count;
        if (updateAllBtn) updateAllBtn.style.display = 'inline-flex';

        this.filterMods();

        Toast.show(`🔔 Steam Workshop check finished: ${count} updates found!`, 'warning');
        this.appendConsoleLog('SteamAPI', `QueryFiles API scan returned: ${count} outdated mods flagged for update`);
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
        this.appendConsoleLog('BackupEngine', `Created automatic zip rollback archives in backups/`);
        this.appendConsoleLog('WorkerPool', `Batch update completed successfully: ${count} mods up to date.`);
      }, 900);
    },

    updateSingleMod(modId) {
      const currentMods = this.games[this.activeAppId].mods;
      const mod = currentMods.find((m) => m.id === modId);
      if (!mod) return;

      mod.status = 'up-to-date';
      this.filterMods();

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
      this.appendConsoleLog('WorkerPool', `Updated mod ${mod.title} (${mod.id}) - backup archived.`);
    },

    /* --------------------------------------------------------------------------
       4.4 Download Queue & Isolated Staging Workers
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

      // Quick-add pill triggers
      const quickPills = document.querySelectorAll('.quick-add-pill');
      quickPills.forEach((pill) => {
        pill.addEventListener('click', (e) => {
          e.preventDefault();
          const workshopId = pill.getAttribute('data-quick-id');
          const title = pill.getAttribute('data-quick-title') || `Workshop Item #${workshopId}`;
          this.dispatchDownload(workshopId, title);
        });
      });

      // Clear completed tasks button
      const clearBtn = document.getElementById('demo-btn-clear-completed');
      if (clearBtn) {
        clearBtn.addEventListener('click', () => {
          const initialLen = this.queueItems.length;
          this.queueItems = this.queueItems.filter((item) => item.status === 'downloading');
          const clearedCount = initialLen - this.queueItems.length;
          this.renderQueue();
          Toast.show(`Cleared ${clearedCount} completed task${clearedCount === 1 ? '' : 's'} from queue.`, 'info');
          this.appendConsoleLog('QueueManager', `Purged ${clearedCount} finished tasks from staging history.`);
        });
      }

      this.renderQueue();
    },

    addToQueue() {
      const input = document.getElementById('demo-queue-input');
      if (!input) return;

      const rawVal = input.value.trim();
      if (!rawVal) {
        Toast.show('Please enter a Steam Workshop ID or URL!', 'warning');
        return;
      }

      const match = rawVal.match(/id=(\d+)/) || rawVal.match(/(\d{6,12})/);
      const workshopId = match ? match[1] : `${Math.floor(1000000000 + Math.random() * 900000000)}`;
      const title = `Workshop Item #${workshopId.slice(0, 6)}`;
      input.value = '';

      this.dispatchDownload(workshopId, title);
    },

    dispatchDownload(workshopId, title) {
      // Pick next worker based on concurrency pool
      const workerNum = (this.queueItems.length % this.concurrency) + 1;
      const newItem = {
        id: `q-${Date.now()}`,
        title: title,
        workshopId: workshopId,
        worker: `Worker ${workerNum}`,
        status: 'downloading',
        progress: 0,
        speed: '28.4 MB/s'
      };

      this.queueItems.unshift(newItem);
      this.renderQueue();

      Toast.show(`⚡ Dispatched <strong>${title}</strong> to Worker ${workerNum}!`, 'info');
      this.appendConsoleLog('WorkerPool', `Dispatched ${workshopId} to Worker ${workerNum} in staging directory temp_workers/worker_${workerNum}`);

      this.simulateDownload(newItem);
    },

    simulateDownload(item) {
      const speeds = ['19.4 MB/s', '24.1 MB/s', '31.5 MB/s', '28.9 MB/s', '35.0 MB/s'];
      const speedVal = document.getElementById('demo-speed-val');

      const interval = setInterval(() => {
        if (item.progress < 100) {
          item.progress = Math.min(100, item.progress + Math.floor(Math.random() * 16 + 12));
          const randomSpeed = speeds[Math.floor(Math.random() * speeds.length)];
          item.speed = randomSpeed;
          if (speedVal) speedVal.textContent = randomSpeed;

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
          item.speed = 'Staged in temp_workers/';
          this.renderQueue();

          Toast.show(`📦 <strong>${item.title}</strong> staged in temp_workers/!`, 'info');
          this.appendConsoleLog('SteamCMD', `${item.worker}: Mod ${item.workshopId} depot chunk verified and staged in isolated workspace`);

          // Automatically deploy to installed mods after brief validation
          setTimeout(() => {
            item.status = 'completed';
            item.speed = 'Deployed to mods/';
            
            // Add to active game mods if not already present
            const currentMods = this.games[this.activeAppId].mods;
            const existing = currentMods.find((m) => m.id === item.workshopId);
            if (!existing) {
              currentMods.unshift({
                id: item.workshopId,
                title: item.title,
                author: 'Workshop Creator',
                tags: ['Installed', 'New'],
                status: 'up-to-date',
                size: '22.4 MB',
                desc: 'Freshly downloaded and deployed via SteamCMD parallel worker staging.',
                icon: '📦',
                steam: true
              });
            } else {
              existing.status = 'up-to-date';
            }

            this.renderQueue();
            this.renderMods();

            Toast.show(`✨ <strong>${item.title}</strong> deployed to <code>${this.games[this.activeAppId].path}</code>!`, 'success', 3500);
            this.appendConsoleLog('Deployer', `Atomic move: temp_workers/${item.worker.toLowerCase().replace(' ', '_')} -> ${this.games[this.activeAppId].path}`);
          }, 1200);
        }
      }, 250);
    },

    renderQueue() {
      const list = document.getElementById('demo-queue-list');
      const badge = document.getElementById('demo-queue-badge');
      if (!list) return;

      if (badge) badge.textContent = this.queueItems.length;

      if (this.queueItems.length === 0) {
        list.innerHTML = `
          <div class="demo-empty-state" style="padding: 30px; text-align: center; color: var(--text-muted);">
            No items in download queue. Paste a Workshop URL or click one of the quick test buttons above!
          </div>
        `;
        this.renderWorkerCards();
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

      this.renderWorkerCards();
    },

    renderWorkerCards() {
      const container = document.getElementById('demo-workers-cards');
      const activeCountEl = document.getElementById('demo-workers-active-count');
      const totalCountEl = document.getElementById('demo-workers-total-count');
      const speedVal = document.getElementById('demo-speed-val');

      if (totalCountEl) totalCountEl.textContent = this.concurrency;

      const activeTasks = this.queueItems.filter((i) => i.status === 'downloading');
      if (activeCountEl) activeCountEl.textContent = Math.min(activeTasks.length, this.concurrency);

      if (speedVal) {
        speedVal.textContent = activeTasks.length > 0 ? `${(activeTasks.length * 12.8).toFixed(1)} MB/s Aggregate` : 'Idle (0 MB/s)';
      }

      if (!container) return;

      let cardsHtml = '';
      for (let i = 1; i <= this.concurrency; i++) {
        const workerName = `Worker ${i}`;
        const activeTask = this.queueItems.find((item) => item.worker === workerName && item.status === 'downloading');
        const stagedTask = this.queueItems.find((item) => item.worker === workerName && item.status === 'staged');

        let statusText = 'Idle';
        let badgeClass = 'badge-secondary';
        let detail = 'Awaiting queue dispatch';

        if (activeTask) {
          statusText = 'Downloading';
          badgeClass = 'badge-cyan pulse-glow';
          detail = `${activeTask.title} (${activeTask.progress}%)`;
        } else if (stagedTask) {
          statusText = 'Staged';
          badgeClass = 'badge-warning';
          detail = `Verifying ${stagedTask.title}`;
        }

        cardsHtml += `
          <div class="worker-card ${activeTask ? 'worker-active' : ''}">
            <div class="worker-card-header">
              <span class="worker-name">${workerName}</span>
              <span class="badge ${badgeClass}">${statusText}</span>
            </div>
            <div class="worker-sandbox-path">temp_workers/worker_${i}</div>
            <div class="worker-detail">${detail}</div>
          </div>
        `;
      }

      container.innerHTML = cardsHtml;
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
      const repairBtn = document.getElementById('demo-btn-repair-meta');

      if (!progressWrap || !progressFill || !statusText) return;

      progressWrap.style.display = 'block';
      progressFill.style.width = '0%';
      statusText.textContent = `Scanning ${this.games[this.activeAppId].name} directories for unindexed folders...`;
      if (scanBtn) scanBtn.disabled = true;

      const looseList = this.looseFoldersByGame[this.activeAppId] || this.looseFoldersByGame['294100'];

      const steps = [
        { percent: '25%', text: 'Inspecting folder structure and About.xml / modinfo manifests...' },
        { percent: '60%', text: 'Querying Steam Web API for matching workshop metadata...' },
        { percent: '90%', text: 'Determining missing PublishedFileId.txt and folder normalization paths...' },
        { percent: '100%', text: `Scan complete! ${looseList.length} loose folders identified.` }
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

            if (tbody) {
              tbody.innerHTML = looseList
                .map((item, idx) => `
                  <tr id="healer-row-${idx}">
                    <td><code class="code-badge">${item.folder}</code></td>
                    <td><strong>${item.title}</strong></td>
                    <td><span class="badge badge-cyan">${item.steamId}</span></td>
                    <td class="action-cell">
                      <span class="badge badge-warning">${item.action}</span>
                    </td>
                  </tr>
                `)
                .join('');
            }

            if (repairBtn) {
              repairBtn.innerHTML = '✨ Repair Metadata &amp; Rename Folders';
              repairBtn.disabled = false;
              repairBtn.classList.remove('btn-secondary');
              repairBtn.classList.add('btn-success');
            }

            if (tableWrap) tableWrap.style.display = 'block';
            Toast.show(`🔍 Scan complete: ${looseList.length} loose mod folders detected in <strong>${this.games[this.activeAppId].name}</strong>!`, 'info');
            this.appendConsoleLog('ModRefactorer', `Found ${looseList.length} unindexed folders requiring PublishedFileId.txt metadata healing.`);
          }, 400);
        }
      }, 280);
    },

    repairAllMetadata() {
      const repairBtn = document.getElementById('demo-btn-repair-meta');
      const looseList = this.looseFoldersByGame[this.activeAppId] || this.looseFoldersByGame['294100'];
      if (!repairBtn) return;

      repairBtn.innerHTML = '<span class="btn-spinner"></span> Repairing & Renaming...';
      repairBtn.disabled = true;

      let idx = 0;
      const stepInterval = setInterval(() => {
        if (idx < looseList.length) {
          const row = document.getElementById(`healer-row-${idx}`);
          if (row) {
            const cell = row.querySelector('.action-cell');
            if (cell) {
              cell.innerHTML = `<span class="badge badge-success">✓ PublishedFileId: ${looseList[idx].steamId} synced &amp; renamed</span>`;
            }
          }
          this.appendConsoleLog('ModRefactorer', `Healed folder: "${looseList[idx].folder}" -> "${looseList[idx].title}" (ID: ${looseList[idx].steamId})`);
          idx++;
        } else {
          clearInterval(stepInterval);
          repairBtn.innerHTML = '✓ All Folders Healed &amp; Renamed';
          repairBtn.classList.remove('btn-success');
          repairBtn.classList.add('btn-secondary');

          Toast.show(`✨ All ${looseList.length} loose folders repaired and indexed for 1-click updates!`, 'success', 3500);
        }
      }, 320);
    },

    /* --------------------------------------------------------------------------
       4.6 Settings Tab
       -------------------------------------------------------------------------- */
    initSettingsTab() {
      const slider = document.getElementById('demo-worker-slider');
      const label = document.getElementById('demo-worker-num');
      const browseBtn = document.getElementById('demo-btn-browse-path');
      const backupToggle = document.getElementById('demo-backup-toggle');
      const steamcmdToggle = document.getElementById('demo-steamcmd-toggle');
      const saveBtn = document.getElementById('demo-btn-save-settings');
      const resetBtn = document.getElementById('demo-btn-reset-settings');

      if (slider && label) {
        slider.addEventListener('input', () => {
          const val = parseInt(slider.value, 10);
          label.textContent = `${val} Workers`;
          this.concurrency = val;
          this.renderWorkerCards();
          this.appendConsoleLog('Config', `Parallel worker pool resized to ${val}`);
        });
      }

      if (browseBtn) {
        browseBtn.addEventListener('click', () => {
          const game = this.games[this.activeAppId];
          Toast.show(`📁 Folder Picker simulated for <strong>${game.name}</strong>: <code>${game.path}</code>`, 'info');
        });
      }

      if (backupToggle) {
        backupToggle.addEventListener('change', () => {
          const enabled = backupToggle.checked;
          Toast.show(`Zip backup safety engine ${enabled ? 'enabled' : 'disabled'}.`, enabled ? 'success' : 'warning');
          this.appendConsoleLog('Config', `Setting "auto_backup" changed to: ${enabled}`);
        });
      }

      if (steamcmdToggle) {
        steamcmdToggle.addEventListener('change', () => {
          const enabled = steamcmdToggle.checked;
          Toast.show(`SteamCMD anonymous login ${enabled ? 'enabled' : 'disabled'}.`, 'info');
          this.appendConsoleLog('Config', `Setting "steamcmd_anonymous" changed to: ${enabled}`);
        });
      }

      if (saveBtn) {
        saveBtn.addEventListener('click', () => {
          const originalText = saveBtn.innerHTML;
          saveBtn.innerHTML = '<span class="btn-spinner"></span> Saving...';
          saveBtn.disabled = true;

          setTimeout(() => {
            saveBtn.innerHTML = originalText;
            saveBtn.disabled = false;
            Toast.show('💾 Configuration saved successfully to <code>config.json</code>!', 'success');
            this.appendConsoleLog('Config', `Persisted settings to disk: concurrency=${this.concurrency}, active_profile=${this.activeAppId}`);
          }, 400);
        });
      }

      if (resetBtn) {
        resetBtn.addEventListener('click', () => {
          if (slider && label) {
            slider.value = 4;
            label.textContent = '4 Workers';
            this.concurrency = 4;
            this.renderWorkerCards();
          }
          if (backupToggle) backupToggle.checked = true;
          if (steamcmdToggle) steamcmdToggle.checked = true;

          Toast.show('↺ Configuration restored to factory defaults.', 'info');
          this.appendConsoleLog('Config', 'Restored all settings to default values.');
        });
      }
    },

    /* --------------------------------------------------------------------------
       4.7 Console Logs Tab & Stream Filter
       -------------------------------------------------------------------------- */
    initLogsTab() {
      const term = document.getElementById('demo-console-output');
      const simBtn = document.getElementById('demo-btn-sim-log');
      const clearBtn = document.getElementById('demo-btn-clear-log');
      const filterSelect = document.getElementById('demo-log-filter');

      // Pre-populate with realistic initial startup logs
      if (term && term.children.length === 0) {
        const initialLogs = [
          { tag: 'WorkerPool', text: 'Initialized isolated staging environments in temp_workers/ (worker_1 .. worker_4)' },
          { tag: 'SteamCMD', text: 'Checking SteamCMD binary at bin/steamcmd.sh... Validated OK' },
          { tag: 'MetadataCache', text: 'Loaded 24 cached mod entries from data/workshop_cache.json' },
          { tag: 'FastAPI', text: 'Server running on http://127.0.0.1:8080 (Press CTRL+C or click Stop to quit)' },
          { tag: 'WebSocket', text: 'WebSocket listener connected on /ws/stream' }
        ];

        initialLogs.forEach((l) => this.appendConsoleLog(l.tag, l.text));
      }

      if (simBtn) {
        simBtn.addEventListener('click', () => {
          const item = this.logPool[this.logIndex % this.logPool.length];
          this.logIndex++;
          this.appendConsoleLog(item.tag, item.text);
        });
      }

      if (clearBtn) {
        clearBtn.addEventListener('click', () => {
          if (term) term.innerHTML = '';
          this.allLogs = [];
          Toast.show('Console log buffer cleared.', 'info');
        });
      }

      if (filterSelect) {
        filterSelect.addEventListener('change', () => {
          const filter = filterSelect.value;
          const lines = term.querySelectorAll('.term-line');
          lines.forEach((line) => {
            if (filter === 'all') {
              line.style.display = '';
            } else {
              const tagEl = line.querySelector('.term-tag');
              if (tagEl && tagEl.textContent.includes(filter)) {
                line.style.display = '';
              } else {
                line.style.display = 'none';
              }
            }
          });
        });
      }
    },

    appendConsoleLog(tag, message) {
      const term = document.getElementById('demo-console-output');
      if (!term) return;

      const now = new Date();
      const timeStr = now.toTimeString().split(' ')[0];

      // Tag color mapping
      const tagColors = {
        WorkerPool: 'log-tag-cyan',
        SteamCMD: 'log-tag-purple',
        BackupEngine: 'log-tag-emerald',
        ModRefactorer: 'log-tag-amber',
        Config: 'log-tag-purple',
        ProfileManager: 'log-tag-cyan',
        SteamAPI: 'log-tag-amber',
        Deployer: 'log-tag-emerald',
        QueueManager: 'log-tag-cyan',
        FastAPI: 'log-tag-emerald',
        WebSocket: 'log-tag-purple',
        MetadataCache: 'log-tag-cyan'
      };

      const tagClass = tagColors[tag] || 'log-tag-cyan';

      const div = document.createElement('div');
      div.className = 'term-line';
      div.innerHTML = `
        <span class="term-time">[${timeStr}]</span>
        <span class="term-tag ${tagClass}">[${tag}]</span>
        <span class="term-msg">${message}</span>
      `;

      term.appendChild(div);
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
          Toast.show(`📁 Opened mod folder: <code>${game.path}</code>`, 'info');
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

          // Close siblings and set aria-expanded to false
          const allItems = document.querySelectorAll('.faq-item');
          allItems.forEach((other) => {
            if (other !== item) {
              other.classList.remove('active');
              const otherBtn = other.querySelector('.faq-question');
              if (otherBtn) otherBtn.setAttribute('aria-expanded', 'false');
            }
          });

          // Toggle current
          item.classList.toggle('active', !isActive);
          q.setAttribute('aria-expanded', String(!isActive));
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

      const setDrawerState = (open) => {
        drawer.classList.toggle('open', open);
        toggle.classList.toggle('active', open);
        toggle.setAttribute('aria-expanded', String(open));
        if (open) {
          document.body.style.overflow = 'hidden';
        } else {
          document.body.style.overflow = '';
        }
      };

      toggle.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = drawer.classList.contains('open');
        setDrawerState(!isOpen);
      });

      // Close when clicking any link inside drawer
      const links = drawer.querySelectorAll('.mobile-link, .nav-link, a');
      links.forEach((link) => {
        link.addEventListener('click', () => {
          setDrawerState(false);
        });
      });

      // Close on click outside
      document.addEventListener('click', (e) => {
        if (drawer.classList.contains('open') && !drawer.contains(e.target) && !toggle.contains(e.target)) {
          setDrawerState(false);
        }
      });

      // Close on Escape key
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && drawer.classList.contains('open')) {
          setDrawerState(false);
          toggle.focus();
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
