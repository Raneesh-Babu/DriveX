/* app.js */
// Configure PDF.js worker
if (window.pdfjsLib) {
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js';
}

// Helpers
function g(id) { return document.getElementById(id); }
function showModal(id) { g(id).classList.add('active'); }
function closeModal(id) { g(id).classList.remove('active'); }

// Public pages navigation
function switchPublicView(viewId) {
  document.querySelectorAll('.public-nav-item').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.public-view').forEach(el => el.classList.remove('active'));

  const mapping = {
    'landingView': 'btnNavHome',
    'verifyView': 'btnNavVerify',
    'loginView': 'btnNavLogin'
  };

  const targetBtn = document.getElementById(mapping[viewId]);
  if (targetBtn) targetBtn.classList.add('active');

  const targetView = document.getElementById(viewId);
  if (targetView) targetView.classList.add('active');
}

// State
let currentAccount = null;
let currentView = 'myfiles';
let currentFolder = '/';
let currentCategoryFilter = 'All';
let currentSearchQuery = '';
let currentLayout = localStorage.getItem('drivexLayout') || 'grid';
let currentSort = localStorage.getItem('drivexSort') || 'date-desc';
let virtualFolders = [];
let contractAddress = null;
let provider = null;
let signer = null;
let contract = null;
let selectedFile = null;
let currentActionFile = null;
let shareMode = 'view';
let currentZoom = 1;

// AppKit (Web3Modal) Instance
let appKitModal = null;
const WC_PROJECT_ID = '7c2f28c5c7f8ec07d0dd0aa8f2c9a739';

// MetaMask SDK Instance
let mmsdk = null;

// Detect mobile browser
function isMobileBrowser() {
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

const CONTRACT_ABI = [
  "event AccessBought(uint256 indexed id, address indexed buyer, uint256 price)",
  "event AccessGranted(uint256 indexed id, address indexed to)",
  "event AccessRevoked(uint256 indexed id, address indexed to)",
  "event FileAdded(uint256 indexed id, address indexed owner, string cid, string name)",
  "event FileRemoved(uint256 indexed id, address indexed owner)",
  "event FileTransferred(uint256 indexed id, address indexed from, address indexed to)",
  "event PriceChanged(uint256 indexed id, uint256 newPrice)",
  "function addFile(string name, string cid, uint256 size, string mime, bytes32 contentHash, string category, uint256 price, string folder) returns (uint256)",
  "function batchMoveFiles(uint256[] ids, string[] newFolders, string[] newCategories)",
  "function buyAccess(uint256 id) payable",
  "function editName(uint256 id, string newName)",
  "function getFile(uint256 id) view returns (uint256 _id, string name, string cid, uint256 size, string mime, address owner, uint256 timestamp, bool deleted, bytes32 contentHash, string category, uint256 price, string folder)",
  "function getFilesByOwner(address owner) view returns (uint256[])",
  "function getHistory(uint256 id) view returns (tuple(address actor, string action, uint256 timestamp)[])",
  "function getMarketFiles() view returns (uint256[])",
  "function getSharedFiles(address user) view returns (uint256[])",
  "function grantAccess(uint256 id, address to)",
  "function hasAccess(uint256 id, address user) view returns (bool)",
  "function hashExists(bytes32) view returns (bool)",
  "function moveFile(uint256 id, string newFolder, string newCategory)",
  "function removeFile(uint256 id)",
  "function revokeAccess(uint256 id, address user)",
  "function setPrice(uint256 id, uint256 newPrice)",
  "function totalFiles() view returns (uint256)",
  "function transferFile(uint256 id, address to)",
  "function verifyFileByHash(bytes32 hash) view returns (bool found, uint256 id, address owner, string category, uint256 timestamp)"
];

async function init() {
  try {
    const res = await fetch('/config');
    const json = await res.json();
    contractAddress = json.contractAddress;

    // Initialize MetaMask SDK for Mobile Deep Linking
    if (typeof window.MetaMaskSDK !== 'undefined') {
      mmsdk = new window.MetaMaskSDK.MetaMaskSDK({
        dappMetadata: {
          name: "DriveX",
          url: window.location.href,
        },
        logging: { developerMode: false },
        checkInstallationImmediately: false
      });
    }

    g('publicVerifyInput').addEventListener('change', async (e) => {
      if (!e.target.files.length) return;
      await runPublicVerification(e.target.files[0]);
    });

    // Public Pages Navigation Setup
    const btnNavHome = document.getElementById('btnNavHome');
    if (btnNavHome) {
      btnNavHome.addEventListener('click', () => switchPublicView('landingView'));
      document.getElementById('btnNavVerify').addEventListener('click', () => switchPublicView('verifyView'));
      document.getElementById('btnNavLogin').addEventListener('click', () => switchPublicView('loginView'));
      document.getElementById('ctaGetStarted').addEventListener('click', () => switchPublicView('loginView'));

      // Public Theme Toggle
      const publicThemeToggleBtn = document.getElementById('publicThemeToggleBtn');
      if (publicThemeToggleBtn) {
        publicThemeToggleBtn.addEventListener('click', () => {
          document.body.classList.toggle('light-theme');
          const isLight = document.body.classList.contains('light-theme');
          const icon = document.getElementById('publicThemeIcon');
          if (isLight) {
            icon.classList.remove('fa-sun');
            icon.classList.add('fa-moon');
          } else {
            icon.classList.remove('fa-moon');
            icon.classList.add('fa-sun');
          }

          // Keep internal dashboard theme in sync if it exists
          const innerIcon = document.getElementById('themeIcon');
          if (innerIcon) {
            if (isLight) {
              innerIcon.classList.remove('fa-sun');
              innerIcon.classList.add('fa-moon');
            } else {
              innerIcon.classList.remove('fa-moon');
              innerIcon.classList.add('fa-sun');
            }
          }
        });
      }
    }

    // Initialize Reown AppKit (Web3Modal) for mobile Chrome
    if (typeof window.AppKit !== 'undefined' && window.AppKit.createAppKit) {
      const sepoliaNetwork = {
        id: 11155111,
        name: 'Sepolia',
        network: 'sepolia',
        nativeCurrency: { name: 'Sepolia Ether', symbol: 'SEP', decimals: 18 },
        rpcUrls: { default: { http: ['https://rpc.sepolia.org'] } },
        blockExplorers: { default: { name: 'Etherscan', url: 'https://sepolia.etherscan.io' } }
      };

      appKitModal = window.AppKit.createAppKit({
        adapters: [new window.AppKit.EthersAdapter()],
        networks: [sepoliaNetwork],
        metadata: {
          name: 'DriveX',
          description: 'Decentralized File Storage',
          url: window.location.origin,
          icons: ['https://upload.wikimedia.org/wikipedia/commons/3/36/MetaMask_Fox.svg']
        },
        projectId: WC_PROJECT_ID,
        features: { email: false, socials: false },
        themeMode: 'dark'
      });

      // Auto-reconnect AppKit
      appKitModal.subscribeState(state => {
        if (state.connected && !currentAccount) {
          const provider = appKitModal.getWalletProvider();
          if (provider) {
            provider.request({ method: 'eth_accounts' }).then(accounts => {
              if (accounts[0]) setupWallet(accounts[0], new ethers.providers.Web3Provider(provider));
            });
          }
        }
      });
    }

    // Auto-reconnect: desktop extension or injected provider
    if (window.ethereum && !appKitModal?.getState()?.connected) {
      const accounts = await window.ethereum.request({ method: 'eth_accounts' }).catch(() => []);
      if (accounts && accounts.length > 0) {
        await setupWallet(accounts[0], new ethers.providers.Web3Provider(window.ethereum));
        return;
      }
    }
  } catch (err) {
    console.error('Initialization error:', err);
  }
}



// Compute Hash
function computeContentHash(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const array = new Uint8Array(reader.result);
        const hash = ethers.utils.keccak256(array);
        resolve(hash);
      } catch (err) { reject(err); }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

// Public Verify
async function runPublicVerification(file) {
  const status = g('verifyStatus');
  const resBox = g('verifyResult');
  status.innerText = "Computing cryptographic hash...";
  resBox.className = "verify-result";

  try {
    const hash = await computeContentHash(file);
    status.innerText = `Hash: ${hash.slice(0, 10)}... Querying Blockchain...`;

    const res = await fetch('/verify/' + hash);
    const data = await res.json();

    if (data.found) {
      status.innerText = "";
      resBox.className = "verify-result success";
      const date = new Date(Number(data.timestamp) * 1000).toLocaleString();
      resBox.innerHTML = `
        <strong style="color:#34d399"><i class="fa-solid fa-check-circle"></i> Verified on Blockchain</strong><br/><br/>
        <b>Owner:</b> ${data.owner}<br/>
        <b>Category:</b> ${data.category}<br/>
        <b>Timestamp:</b> ${date}
      `;
    } else {
      status.innerText = "";
      resBox.className = "verify-result failed";
      resBox.innerHTML = `<strong style="color:#ef4444"><i class="fa-solid fa-triangle-exclamation"></i> Not Found</strong><br/><br/>This file's hash does not exist on the DriveX smart contract.`;
    }
  } catch (e) {
    status.innerText = "Error: " + e.message;
  }
}

// setupWallet accepts an ethers provider (extension or WalletConnect)
async function setupWallet(account, ethersProvider) {
  currentAccount = account;
  provider = ethersProvider;
  signer = provider.getSigner();
  contract = new ethers.Contract(contractAddress, CONTRACT_ABI, signer);

  g('publicScreen').classList.add('hidden');
  g('appLayout').style.display = 'flex';
  g('accountStatusText').innerText = account.slice(0, 6) + '...' + account.slice(-4);

  loadCurrentView();
}

g('loginConnectBtn').addEventListener('click', async () => {
  // Deep link directly to MetaMask on mobile devices
  if (isMobileBrowser() && mmsdk && (!window.ethereum || !window.ethereum.isMetaMask)) {
    try {
      g('loginLoader').style.display = 'block';
      const sdkProvider = mmsdk.getProvider();
      const accounts = await sdkProvider.request({ method: 'eth_requestAccounts' });
      if (accounts && accounts.length) {
        try {
          const chainId = await sdkProvider.request({ method: 'eth_chainId' });
          if (chainId !== '0xaa36a7' && chainId !== '11155111') {
            await sdkProvider.request({
              method: 'wallet_switchEthereumChain',
              params: [{ chainId: '0xaa36a7' }],
            });
          }
        } catch (chainErr) { console.warn('Chain switch:', chainErr); }
        await setupWallet(accounts[0], new ethers.providers.Web3Provider(sdkProvider));
        return;
      }
    } catch (e) {
      if (e.code !== 4001) await customAlert('Connection error: ' + e.message);
    } finally {
      g('loginLoader').style.display = 'none';
    }
  }

  // Mobile Chrome / no injected extension
  if (!window.ethereum) {
    if (appKitModal) {
      // Opens the WalletConnect beautiful in-browser UI
      await appKitModal.open();
      // The subscribeState listener in init() handles the successful connection
      return;
    } else if (isMobileBrowser()) {
      // Absolute fallback if CDN failed
      const dappUrl = window.location.href.replace(/^https?:\/\//, '');
      window.location.href = 'https://metamask.app.link/dapp/' + dappUrl;
      return;
    }
    return customAlert('MetaMask not found. Please install the browser extension.');
  }

  // Desktop MetaMask extension (or in-app browser)
  try {
    g('loginLoader').style.display = 'block';
    await window.ethereum.request({ method: 'eth_requestAccounts' });
    try {
      const chainId = await window.ethereum.request({ method: 'eth_chainId' });
      if (chainId !== '0xaa36a7' && chainId !== '11155111') {
        await window.ethereum.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: '0xaa36a7' }],
        });
      }
    } catch (chainErr) { console.warn('Chain switch:', chainErr); }
    const accounts = await window.ethereum.request({ method: 'eth_accounts' });
    if (accounts && accounts.length) {
      await setupWallet(accounts[0], new ethers.providers.Web3Provider(window.ethereum));
    }
  } catch (e) {
    if (e.code !== 4001) await customAlert('Connection error: ' + e.message);
  } finally {
    g('loginLoader').style.display = 'none';
  }
});

// Wallet button click = disconnect
g('accountStatus').addEventListener('click', async () => {
  currentAccount = null;
  provider = null;
  signer = null;
  contract = null;
  virtualFolders = [];
  g('searchInput').value = '';
  currentSearchQuery = '';
  g('categoryFilter').value = 'All';
  currentCategoryFilter = 'All';

  if (appKitModal && appKitModal.getState().connected) {
    try { await appKitModal.disconnect(); } catch (_) { }
  }

  g('publicScreen').classList.remove('hidden');
  g('appLayout').style.display = 'none';
  if (typeof switchPublicView === 'function') switchPublicView('landingView');
});

// UI Bindings mappings
g('searchInput').addEventListener('input', (e) => {
  currentSearchQuery = e.target.value.toLowerCase();
  loadCurrentView();
});

g('categoryFilter').addEventListener('change', (e) => {
  currentCategoryFilter = e.target.value;
  loadCurrentView();
});

g('createFolderBtn').addEventListener('click', async () => {
  const name = await customPrompt("Enter new folder name:");
  if (name && name.trim()) {
    let cleanName = name.trim().replace(/\//g, ''); // no slashes allowed in internal name
    let newPath = currentFolder === '/' ? '/' + cleanName : currentFolder + '/' + cleanName;
    if (!virtualFolders.includes(newPath)) {
      virtualFolders.push(newPath);
      loadCurrentView();
    }
  }
});

// Navigation
document.querySelectorAll('.nav-item').forEach(el => {
  el.addEventListener('click', (e) => {
    if (el.id === 'navPublicVerify') {
      currentView = 'publicverify';
      document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
      el.classList.add('active');
      g('viewTitle').innerText = 'Public Verification';

      // Hide standard grid and breadcrumbs, show verification section
      g('filesGrid').style.display = 'none';
      if (g('breadcrumbsWrapper')) g('breadcrumbsWrapper').style.display = 'none';
      g('publicVerifySection').style.display = 'block';
      return;
    }

    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    el.classList.add('active');
    currentView = el.getAttribute('data-view');
    currentFolder = '/';
    const titles = { 'myfiles': 'My Files', 'sharedfiles': 'Shared With Me', 'marketfiles': 'Marketplace' };
    g('viewTitle').innerText = titles[currentView];

    // Restore grid view components
    g('publicVerifySection').style.display = 'none';
    g('filesGrid').style.display = 'grid';
    if (g('breadcrumbsWrapper')) g('breadcrumbsWrapper').style.display = 'flex';

    // Clear search/filter on navigation change
    g('searchInput').value = ''; currentSearchQuery = '';
    g('categoryFilter').value = 'All'; currentCategoryFilter = 'All';
    loadCurrentView();
  });
});

// Layout & Sorting Bindings
const sortSelect = g('sortSelect');
if (sortSelect) {
  sortSelect.value = currentSort;
  sortSelect.addEventListener('change', (e) => {
    currentSort = e.target.value;
    localStorage.setItem('drivexSort', currentSort);
    loadCurrentView();
  });
}

function setLayout(layout) {
  currentLayout = layout;
  localStorage.setItem('drivexLayout', layout);

  const grid = g('filesGrid');
  if (layout === 'list') {
    grid.classList.add('list-view');
    if (g('btnLayoutList')) g('btnLayoutList').classList.add('active');
    if (g('btnLayoutGrid')) g('btnLayoutGrid').classList.remove('active');
  } else {
    grid.classList.remove('list-view');
    if (g('btnLayoutGrid')) g('btnLayoutGrid').classList.add('active');
    if (g('btnLayoutList')) g('btnLayoutList').classList.remove('active');
  }
}

const btnGrid = g('btnLayoutGrid');
const btnList = g('btnLayoutList');
if (btnGrid) btnGrid.addEventListener('click', () => setLayout('grid'));
if (btnList) btnList.addEventListener('click', () => setLayout('list'));

// Inner Public Verification Logic
const vDropInner = g('verifyDropZoneInner');
const vInputInner = g('verifyInputInner');

vDropInner.addEventListener('click', () => vInputInner.click());

vDropInner.addEventListener('dragover', (e) => {
  e.preventDefault();
  vDropInner.style.background = 'rgba(167, 139, 250, 0.2)';
});

vDropInner.addEventListener('dragleave', () => {
  vDropInner.style.background = 'rgba(0,0,0,0.2)';
});

vDropInner.addEventListener('drop', (e) => {
  e.preventDefault();
  vDropInner.style.background = 'rgba(0,0,0,0.2)';
  if (e.dataTransfer.files.length) runInnerVerification(e.dataTransfer.files[0]);
});

vInputInner.addEventListener('change', (e) => {
  if (e.target.files.length) runInnerVerification(e.target.files[0]);
});

async function runInnerVerification(file) {
  const status = g('verifyStatusInner');
  const resBox = g('verifyResultInner');
  const histTitle = g('verifyHistoryTitleInner');
  const histList = g('verifyHistoryListInner');

  status.innerText = "Computing cryptographic hash...";
  resBox.className = "verify-result";
  histTitle.style.display = 'none';
  histList.style.display = 'none';
  histList.innerHTML = '';

  try {
    const hash = await computeContentHash(file);
    status.innerText = `Hash: ${hash.slice(0, 10)}... Querying Blockchain...`;

    const res = await fetch('/verify/' + hash);
    const data = await res.json();

    if (data.found) {
      status.innerText = "";
      resBox.className = "verify-result success";
      const date = new Date(Number(data.timestamp) * 1000).toLocaleString();
      resBox.innerHTML = `
        <strong style="color:#34d399"><i class="fa-solid fa-check-circle"></i> Verified on Blockchain</strong><br/><br/>
        <b>Owner:</b> ${data.owner}<br/>
        <b>Category:</b> ${data.category}<br/>
        <b>Timestamp:</b> ${date}
      `;

      // If connected owner requests it, load history inline (since verify endpoint returns full file details id in production, we can also query the events if we have ID. Wait, the endpoint gives us 'data.id' if we passed it in the backend. Let's assume we can fetch '/myfiles/:owner' and match hash to get ID.)
      try {
        status.innerText = "Fetching securely logged history...";
        let matchedId = null;
        const allFilesRes = await fetch('/myfiles/' + data.owner);
        const allFilesData = await allFilesRes.json();
        const match = allFilesData.files.find(f => f.contentHash === hash);
        if (match) {
          matchedId = match.id;
        }

        if (matchedId) {
          histTitle.style.display = 'block';
          histList.style.display = 'flex';
          histList.innerHTML = '<div class="loader" style="margin:20px auto; border-top-color:#a78bfa;"></div>';

          const logs = await contract.getHistory(matchedId);
          histList.innerHTML = '';
          if (!logs.length) {
            histList.innerHTML = '<p style="color:var(--muted)">No history found.</p>';
          } else {
            for (let i = logs.length - 1; i >= 0; i--) {
              const l = logs[i];
              const div = document.createElement('div');
              div.className = 'history-item';
              div.style.background = 'rgba(255,255,255,0.05)';
              div.style.padding = '12px';
              div.style.borderRadius = '8px';
              div.innerHTML = `
                 <div class="actor"><i class="fa-solid fa-address-card"></i> Actor: <span>${l.actor}</span></div>
                 <div class="action"><i class="fa-solid fa-bolt"></i> ${l.action}</div>
                 <div class="time"><i class="fa-solid fa-clock"></i> ${new Date(Number(l.timestamp) * 1000).toLocaleString()}</div>
               `;
              histList.appendChild(div);
            }
          }
        }
        status.innerText = "";
      } catch (e) {
        status.innerText = "Error loading history: " + e.message;
      }
    } else {
      status.innerText = "";
      resBox.className = "verify-result failed";
      resBox.innerHTML = `<strong style="color:#ef4444"><i class="fa-solid fa-triangle-exclamation"></i> Not Found</strong><br/><br/>This file's hash does not exist on the DriveX smart contract.`;
    }
  } catch (e) {
    status.innerText = "Error: " + e.message;
  }
}

function syncCategories(allFiles) {
  // Parse dynamic categories
  const catSet = new Set(["General", "Hospital", "Education", "Legal", "Art"]);
  allFiles.forEach(f => {
    if (f.category && f.category.trim()) catSet.add(f.category);
  });

  // Update Category Filter dropdown
  const filterSelect = g('categoryFilter');
  filterSelect.innerHTML = '<option value="All">All Categories</option>';

  // Update Datalist for forms
  const dataList = g('categoryOptions');
  dataList.innerHTML = '';

  Array.from(catSet).sort().forEach(cat => {
    const optF = document.createElement('option');
    optF.value = cat; optF.innerText = cat;
    if (cat === currentCategoryFilter) optF.selected = true;
    filterSelect.appendChild(optF);

    const optD = document.createElement('option');
    optD.value = cat;
    dataList.appendChild(optD);
  });
}

async function loadCurrentView() {
  const grid = g('filesGrid');
  grid.innerHTML = '<div style="grid-column: 1 / -1; display: flex; justify-content: center; padding: 40px;"><div class="loader" style="border-top-color:#a78bfa;"></div></div>';
  renderBreadcrumbs();

  let endpoint = '';
  if (currentView === 'myfiles') endpoint = '/myfiles/' + currentAccount;
  else if (currentView === 'sharedfiles') endpoint = '/sharedfiles/' + currentAccount;
  else if (currentView === 'marketfiles') endpoint = '/marketfiles';

  try {
    const res = await fetch(endpoint);
    const data = await res.json();
    const filesArray = data.files || [];
    syncCategories(filesArray); // Generate filter lists
    renderArchitecture(filesArray);

    // Calculate Storage Used (only count user's owned files from their drive)
    if (currentView === 'myfiles') {
      let totalBytes = 0;
      filesArray.forEach(f => {
        if (!f.deleted) totalBytes += parseInt(f.size || 0);
      });
      const MAX_BYTES = 1024 * 1024 * 1024; // 1 GB
      const pct = Math.min((totalBytes / MAX_BYTES) * 100, 100).toFixed(1);

      const bar = g('storageProgressBar');
      const pctText = g('storageUsedPct');
      const usedText = g('storageUsedText');
      if (bar && pctText && usedText) {
        bar.style.width = pct + '%';
        pctText.innerText = pct + '%';
        usedText.innerText = formatBytes(totalBytes);
      }
    }
  } catch (e) {
    grid.innerHTML = `<p style="color:#ef4444">Error loading files: ${e.message}</p>`;
  }
}

function renderBreadcrumbs() {
  const bc = g('folderBreadcrumbs');
  bc.innerHTML = '';
  const parts = currentFolder.split('/').filter(p => p.length);

  const addCrumb = (name, path) => {
    const span = document.createElement('span');
    span.className = 'breadcrumb-item';
    span.innerText = name;
    span.onclick = () => { currentFolder = path; loadCurrentView(); };
    bc.appendChild(span);

    const sep = document.createElement('span');
    sep.className = 'breadcrumb-sep';
    sep.innerHTML = '<i class="fa-solid fa-chevron-right"></i>';
    bc.appendChild(sep);
  };

  addCrumb('Root', '/');
  let currentPath = '';
  parts.forEach(p => {
    currentPath += '/' + p;
    addCrumb(p, currentPath);
  });
  // Apply layout state correctly before rendering
  setLayout(currentLayout);

}

function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function renderArchitecture(allFiles) {
  const grid = g('filesGrid');
  grid.innerHTML = '';

  if (allFiles.length === 0 && virtualFolders.length === 0) {
    grid.innerHTML = '<p style="color:var(--muted); grid-column:1/-1; text-align:center; padding:40px;">No files found.</p>';
    return;
  }

  const folders = new Set();
  const displayFiles = [];

  // If Search is active, ignore folder hierarchy and show flat matches
  const isSearchActive = currentSearchQuery.length > 0;

  // 1. Compute folder paths from files
  allFiles.forEach(f => {
    if (f.deleted === true) return;
    if (currentView === 'marketfiles' && f.price === "0") return;

    const fileFolder = (f.folder || '/').replace(/\/+$/, '') || '/';
    const isRoot = currentFolder === '/';

    // Check search / category filter
    const matchesCategory = currentCategoryFilter === 'All' || f.category === currentCategoryFilter;
    const matchesSearch = !isSearchActive || (f.name && f.name.toLowerCase().includes(currentSearchQuery)) || (f.category && f.category.toLowerCase().includes(currentSearchQuery));

    if (!matchesCategory || !matchesSearch) return;

    if (isSearchActive || currentView === 'marketfiles') {
      displayFiles.push(f);
      return;
    }

    if (fileFolder === currentFolder) {
      displayFiles.push(f);
    } else if (fileFolder.startsWith(currentFolder + (isRoot ? '' : '/'))) {
      let relativePath = fileFolder.substring(currentFolder.length);
      if (relativePath.startsWith('/')) relativePath = relativePath.substring(1);
      const immediateSub = relativePath.split('/')[0];
      if (immediateSub) {
        const fullSubPath = (currentFolder === '/' ? '/' : currentFolder + '/') + immediateSub;
        folders.add(fullSubPath);
      }
    }
  });

  // 2. Add purely virtual folders logic if no search is active or market view
  if (!isSearchActive && currentView !== 'marketfiles') {
    virtualFolders.forEach(vf => {
      const isRoot = currentFolder === '/';
      if (vf.startsWith(currentFolder + (isRoot ? '' : '/'))) {
        let relativePath = vf.substring(currentFolder.length);
        if (relativePath.startsWith('/')) relativePath = relativePath.substring(1);
        const immediateSub = relativePath.split('/')[0];
        if (immediateSub) {
          const fullSubPath = (currentFolder === '/' ? '/' : currentFolder + '/') + immediateSub;
          folders.add(fullSubPath);
        }
      }
    });
  }

  if (folders.size === 0 && displayFiles.length === 0) {
    grid.innerHTML = '<p style="color:var(--muted); grid-column:1/-1; text-align:center; padding:40px;">No matching results.</p>';
    return;
  }

  // Sort displayFiles
  displayFiles.sort((a, b) => {
    switch (currentSort) {
      case 'name-asc':
        return a.name.localeCompare(b.name);
      case 'name-desc':
        return b.name.localeCompare(a.name);
      case 'date-asc':
        return parseInt(a.timestamp) - parseInt(b.timestamp);
      case 'date-desc':
        return parseInt(b.timestamp) - parseInt(a.timestamp);
      case 'size-asc':
        return parseInt(a.size) - parseInt(b.size);
      case 'size-desc':
        return parseInt(b.size) - parseInt(a.size);
      default:
        return parseInt(b.timestamp) - parseInt(a.timestamp);
    }
  });

  // Render Folders First (skip if searching or in marketplace)
  if (!isSearchActive && currentView !== 'marketfiles') {
    folders.forEach(folderPath => {
      const folderName = folderPath.split('/').pop();
      const card = document.createElement('div');
      card.className = 'card';
      card.style.cursor = 'pointer';
      card.title = `Open Folder: ${folderName}`;
      card.onclick = () => { currentFolder = folderPath; loadCurrentView(); };

      card.innerHTML = `
        <div class="file-thumb" style="font-size: 4rem; color: #a78bfa;">
          <i class="fa-solid fa-folder"></i>
        </div>
        <div class="file-info">
          <div class="file-name">${folderName}</div>
        </div>
      `;

      card.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        showFolderContextMenu(e.pageX, e.pageY, folderPath);
      });

      grid.appendChild(card);
    });
  }

  // Render Files
  displayFiles.forEach(f => {
    const card = document.createElement('div');
    card.className = 'card';

    const thumb = document.createElement('div');
    thumb.className = 'file-thumb';
    const ext = f.name.split('.').pop().toUpperCase();

    if (f.mime && f.mime.startsWith('image/')) {
      const img = document.createElement('img');
      img.src = `https://gateway.pinata.cloud/ipfs/${f.cid}`;
      img.onerror = () => { thumb.innerHTML = `<i class="fa-solid fa-file"></i><span class="file-ext">${ext}</span>`; };
      thumb.appendChild(img);
    } else if (f.mime && f.mime.includes('pdf')) {
      const canvasId = 'pdf-thumb-' + f.cid;
      thumb.innerHTML = `<canvas id="${canvasId}" style="width:100%; height:100%; object-fit:contain; border-radius:8px 8px 0 0;"></canvas>`;

      setTimeout(async () => {
        try {
          const url = `https://gateway.pinata.cloud/ipfs/${f.cid}`;
          const loadingTask = pdfjsLib.getDocument(url);
          const pdf = await loadingTask.promise;
          const page = await pdf.getPage(1);

          const canvas = document.getElementById(canvasId);
          if (canvas) {
            const context = canvas.getContext('2d');
            const viewport = page.getViewport({ scale: 0.5 });
            canvas.height = viewport.height;
            canvas.width = viewport.width;

            await page.render({ canvasContext: context, viewport: viewport }).promise;
          }
        } catch (e) {
          console.error('Error generating PDF thumbnail:', e);
          const c = document.getElementById(canvasId);
          if (c && c.parentElement) c.parentElement.innerHTML = `<i class="fa-solid fa-file-pdf" style="color: #ef4444;"></i><span class="file-ext">PDF</span>`;
        }
      }, 0);
    } else {
      thumb.innerHTML = `<i class="fa-solid fa-file"></i><span class="file-ext">${ext}</span>`;
    }

    // Date formatting helper
    const formatDate = (ts) => {
      if (!ts) return "N/A";
      const d = new Date(parseInt(ts) * 1000);
      return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    };

    const dateOverlay = document.createElement('div');
    dateOverlay.className = 'file-thumb-dates';
    dateOverlay.innerHTML = `
      <span><i class="fa-solid fa-calendar-plus" style="margin-right:4px;"></i>Up: ${formatDate(f.timestamp)}</span>
      <span><i class="fa-solid fa-clock-rotate-left" style="margin-right:4px;"></i>Mod: ${formatDate(f.lastModified || f.timestamp)}</span>
    `;
    thumb.appendChild(dateOverlay);

    thumb.onclick = (e) => {
      e.stopPropagation();
      const isOwner = f.owner && currentAccount && f.owner.toLowerCase() === currentAccount.toLowerCase();
      if (currentView === 'marketfiles' && !isOwner) {
        customAlert("You must buy access to this file before you can preview it.");
      } else {
        openPreview(f.cid, f.name, f.mime);
      }
    };

    const info = document.createElement('div');
    info.className = 'file-info';

    const name = document.createElement('div');
    name.className = 'file-name';
    name.innerText = f.name;
    name.title = f.name;

    const meta = document.createElement('div');
    meta.className = 'file-meta';

    const badges = document.createElement('div');
    badges.style.display = 'flex';
    badges.style.gap = '6px';
    badges.innerHTML = `<span class="badge cat">${f.category || 'General'}</span>`;
    if (f.price > 0 && currentView !== 'myfiles') {
      badges.innerHTML += `<span class="badge price">${ethers.utils.formatEther(f.price)} ETH</span>`;
    } else if (f.price > 0) {
      badges.innerHTML += `<span class="badge price">Selling</span>`;
    }

    const sizeStr = formatBytes(f.size);
    const s = document.createElement('span');
    s.innerText = sizeStr;

    meta.appendChild(badges);
    meta.appendChild(s);

    info.appendChild(name);

    // List view dates
    const listDates = document.createElement('div');
    listDates.className = 'list-dates';
    listDates.innerHTML = `
      <div style="font-size: 0.8rem; color: var(--muted);"><i class="fa-solid fa-calendar-plus" style="margin-right:6px;"></i>${formatDate(f.timestamp)}</div>
      <div style="font-size: 0.8rem; color: var(--muted);"><i class="fa-solid fa-clock-rotate-left" style="margin-right:6px;"></i>Mod: ${formatDate(f.lastModified || f.timestamp)}</div>
    `;
    info.appendChild(listDates);

    info.appendChild(meta);
    card.appendChild(thumb);
    card.appendChild(info);

    card.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      showContextMenu(e.pageX, e.pageY, f);
    });

    grid.appendChild(card);
  });
}

// Folder Context Menu
let currentActionFolder = null;
const folderContextMenu = g('folderContextMenu');

function showFolderContextMenu(x, y, folderPath) {
  currentActionFolder = folderPath;
  folderContextMenu.style.left = `${x}px`;
  folderContextMenu.style.top = `${y}px`;
  folderContextMenu.classList.add('open');

  const rect = folderContextMenu.getBoundingClientRect();
  if (rect.right > window.innerWidth) folderContextMenu.style.left = `${window.innerWidth - rect.width - 10}px`;
  if (rect.bottom > window.innerHeight) folderContextMenu.style.top = `${window.innerHeight - rect.height - 10}px`;
}

// Right Click Custom Context Menu
const contextMenu = g('contextMenu');
function showContextMenu(x, y, file) {
  currentActionFile = file;

  contextMenu.style.left = `${x}px`;
  contextMenu.style.top = `${y}px`;

  const isOwner = file.owner.toLowerCase() === currentAccount.toLowerCase();

  if (!isOwner && currentView === 'marketfiles') {
    g('ctxDownload').style.display = 'none';
  } else {
    g('ctxDownload').style.display = '';
  }

  g('ctxOwnerOnlyGroup').style.display = isOwner ? 'flex' : 'none';
  g('ctxMarketGroup').style.display = (!isOwner && file.price > 0 && currentView === 'marketfiles') ? 'flex' : 'none';

  contextMenu.classList.add('open');

  const rect = contextMenu.getBoundingClientRect();
  if (rect.right > window.innerWidth) contextMenu.style.left = `${window.innerWidth - rect.width - 10}px`;
  if (rect.bottom > window.innerHeight) contextMenu.style.top = `${window.innerHeight - rect.height - 10}px`;
}

document.addEventListener('click', () => {
  contextMenu.classList.remove('open');
  if (folderContextMenu) folderContextMenu.classList.remove('open');
});

g('ctxFolderOpen').addEventListener('click', () => {
  if (currentActionFolder) {
    currentFolder = currentActionFolder;
    loadCurrentView();
  }
});

g('ctxFolderDelete').addEventListener('click', () => {
  g('deleteFolderTargetName').innerText = currentActionFolder;
  g('deleteFolderStatusBox').innerText = '';
  showModal('deleteFolderModal');
});

g('ctxFolderRename').addEventListener('click', () => {
  g('renameFolderCurrent').value = currentActionFolder;
  g('renameFolderInput').value = currentActionFolder.split('/').pop();
  g('renameFolderStatusBox').innerText = '';
  showModal('renameFolderModal');
});

g('confirmFolderRenameBtn').addEventListener('click', async () => {
  const newName = g('renameFolderInput').value.trim().replace(/\//g, '');
  if (!newName) return customAlert("Folder name cannot be empty");

  const btn = g('confirmFolderRenameBtn');
  const loader = g('renameFolderLoader');
  const stat = g('renameFolderStatusBox');

  btn.disabled = true;
  loader.style.display = 'block';

  try {
    // Determine new folder path
    const parts = currentActionFolder.split('/');
    parts[parts.length - 1] = newName;
    const newPath = parts.join('/');

    // Also update virtual folders if they match
    virtualFolders = virtualFolders.map(vf => {
      if (vf === currentActionFolder) return newPath;
      if (vf.startsWith(currentActionFolder + '/')) return newPath + vf.substring(currentActionFolder.length);
      return vf;
    });

    // Find all files that are inside this folder
    const filesToMove = [];
    const newFolders = [];
    const newCategories = [];

    // Fetch all files
    const res = await fetch('/myfiles/' + currentAccount);
    const data = await res.json();
    const allFiles = data.files || [];

    allFiles.forEach(f => {
      const fileFolder = f.folder || '/';
      if (fileFolder === currentActionFolder || fileFolder.startsWith(currentActionFolder + '/')) {
        filesToMove.push(f.id);
        const updatedFolder = newPath + fileFolder.substring(currentActionFolder.length);
        newFolders.push(updatedFolder);
        newCategories.push(f.category || 'General');
      }
    });

    if (filesToMove.length > 0) {
      stat.innerText = `Moving ${filesToMove.length} files on the blockchain...`;
      const tx = await contract.batchMoveFiles(filesToMove, newFolders, newCategories);
      stat.innerHTML = `Transaction Sent: <a href="https://sepolia.etherscan.io/tx/${tx.hash}" target="_blank" style="color:var(--accent)">View</a>. Waiting confirmation...`;
      await tx.wait();
    }

    stat.innerText = 'Folder renamed successfully!';
    setTimeout(() => {
      // If we were inside the renamed folder, stay inside the new path
      if (currentFolder === currentActionFolder || currentFolder.startsWith(currentActionFolder + '/')) {
        currentFolder = newPath + currentFolder.substring(currentActionFolder.length);
      }
      closeModal('renameFolderModal');
      loadCurrentView();
    }, 1500);

  } catch (err) {
    stat.innerText = 'Error: ' + err.message;
  } finally {
    btn.disabled = false;
    loader.style.display = 'none';
  }
});

g('confirmFolderDeleteBtn').addEventListener('click', async () => {
  const btn = g('confirmFolderDeleteBtn');
  const loader = g('deleteFolderLoader');
  const stat = g('deleteFolderStatusBox');

  btn.disabled = true;
  loader.style.display = 'block';

  if (virtualFolders.includes(currentActionFolder)) {
    stat.innerText = 'Removing virtual folder...';
    setTimeout(() => {
      virtualFolders = virtualFolders.filter(f => f !== currentActionFolder);
      closeModal('deleteFolderModal');
      loadCurrentView();
    }, 500);
  } else {
    stat.innerHTML = '<span style="color:#ef4444">This folder contains active files on the blockchain network.<br/>You must delete or move all nested physical files manually first.</span>';
  }

  setTimeout(() => {
    btn.disabled = false;
    loader.style.display = 'none';
  }, 1000);
});

g('ctxDownload').addEventListener('click', async () => {
  const url = `https://gateway.pinata.cloud/ipfs/${currentActionFile.cid}`;
  const toast = g('downloadToast');

  try {
    toast.style.display = 'flex';
    const response = await fetch(url);
    if (!response.ok) throw new Error('Network response was not ok');

    const blob = await response.blob();
    const objectUrl = window.URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = currentActionFile.name; // Use the actual file name
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(objectUrl);
  } catch (error) {
    console.error("Download failed:", error);
    customAlert("Failed to download file. Please try again.");
  } finally {
    toast.style.display = 'none';
  }
});

g('ctxVerify').addEventListener('click', async () => {
  await customAlert(`Please download the file first, then drag it into the "Public Verification Tool" on the landing page to verify its integrity.\n\nOn-Chain Hash Signature: ${currentActionFile.contentHash}`);
});

g('ctxHistory').addEventListener('click', () => showFileHistory(currentActionFile.id));

g('ctxShareView').addEventListener('click', () => {
  shareMode = 'view';
  g('shareTitle').innerText = 'Share File (View Only)';
  g('shareDesc').innerText = 'Grant view-only access to a specific wallet address.';
  openShareModal(currentActionFile.id);
});

g('ctxShareOwnership').addEventListener('click', () => {
  shareMode = 'transfer';
  g('shareTitle').innerText = 'Transfer Ownership';
  g('shareDesc').innerText = 'WARNING: You will permanently transfer ownership of this file to the target address.';
  openShareModal(currentActionFile.id);
});

g('ctxManageAccess').addEventListener('click', () => {
  openManageAccessModal(currentActionFile.id);
});

g('ctxMove').addEventListener('click', () => {
  g('moveFolder').value = currentActionFile.folder || '/';
  g('moveCategory').value = currentActionFile.category || 'General';
  g('moveStatusBox').innerText = '';
  showModal('moveModal');
});

g('ctxRename').addEventListener('click', () => {
  g('renameInput').value = currentActionFile.name;
  g('renameStatusBox').innerText = '';
  showModal('renameModal');
});

g('confirmRenameBtn').addEventListener('click', async () => {
  const newName = g('renameInput').value.trim();
  if (!newName) return customAlert("Name cannot be empty");

  const btn = g('confirmRenameBtn');
  const loader = g('renameLoader');
  const stat = g('renameStatusBox');

  btn.disabled = true;
  loader.style.display = 'block';
  stat.innerText = 'Initiating transaction...';

  try {
    const tx = await contract.editName(currentActionFile.id, newName);
    stat.innerHTML = `Transaction Sent: <a href="https://sepolia.etherscan.io/tx/${tx.hash}" target="_blank" style="color:var(--accent)">View</a>. Waiting confirmation...`;
    await tx.wait();

    stat.innerText = 'File renamed successfully!';
    setTimeout(() => {
      closeModal('renameModal');
      loadCurrentView();
    }, 1500);
  } catch (e) {
    stat.innerText = 'Error: ' + e.message;
  } finally {
    btn.disabled = false;
    loader.style.display = 'none';
  }
});

g('ctxDelete').addEventListener('click', () => {
  g('deleteTargetName').innerText = currentActionFile.name;
  g('deleteStatusBox').innerText = '';
  showModal('deleteModal');
});

g('ctxSetPrice').addEventListener('click', () => {
  g('setPriceValue').value = currentActionFile.price > 0 ? ethers.utils.formatEther(currentActionFile.price) : '0';
  g('setPriceStatusBox').innerText = '';
  showModal('setPriceModal');
});

g('confirmSetPriceBtn').addEventListener('click', async () => {
  const priceEth = g('setPriceValue').value;
  let priceWei;
  try {
    priceWei = ethers.utils.parseEther(priceEth || "0");
  } catch (e) {
    return customAlert("Invalid price format");
  }

  const btn = g('confirmSetPriceBtn');
  const loader = g('setPriceLoader');
  const stat = g('setPriceStatusBox');

  btn.disabled = true;
  loader.style.display = 'block';
  stat.innerText = 'Initiating transaction...';

  try {
    const tx = await contract.setPrice(currentActionFile.id, priceWei);
    stat.innerHTML = `Transaction Sent: <a href="https://sepolia.etherscan.io/tx/${tx.hash}" target="_blank" style="color:var(--accent)">View</a>. Waiting confirmation...`;
    await tx.wait();

    stat.innerText = 'Price Updated Successfully!';
    setTimeout(() => {
      closeModal('setPriceModal');
      loadCurrentView();
    }, 1500);
  } catch (e) {
    stat.innerText = 'Error: ' + e.message;
  } finally {
    btn.disabled = false;
    loader.style.display = 'none';
  }
});

g('confirmDeleteBtn').addEventListener('click', async () => {
  const btn = g('confirmDeleteBtn');
  const loader = g('deleteLoader');
  const stat = g('deleteStatusBox');

  btn.disabled = true;
  loader.style.display = 'block';
  stat.innerText = 'Initiating deletion transaction...';

  try {
    const tx = await contract.removeFile(currentActionFile.id);
    stat.innerHTML = `Transaction Sent: <a href="https://sepolia.etherscan.io/tx/${tx.hash}" target="_blank" style="color:var(--accent)">View</a>. Waiting confirmation...`;
    await tx.wait();

    stat.innerText = 'File successfully deleted!';
    setTimeout(() => {
      closeModal('deleteModal');
      loadCurrentView();
    }, 1500);
  } catch (e) {
    stat.innerText = 'Error: ' + e.message;
  } finally {
    btn.disabled = false;
    loader.style.display = 'none';
  }
});

g('ctxBuy').addEventListener('click', () => buyFile(currentActionFile.id, currentActionFile.price));


// Upload Flow
g('uploadTriggerBtn').addEventListener('click', () => g('fileInput').click());

g('fileInput').addEventListener('change', (e) => {
  if (!e.target.files.length) return;
  selectedFile = e.target.files[0];
  g('uploadFileName').innerText = selectedFile.name;
  g('uploadName').value = selectedFile.name;
  g('uploadFolder').value = currentFolder;
  g('uploadCategory').value = 'General';
  g('uploadPrice').value = '0';
  g('uploadStatusBox').innerHTML = '';
  showModal('uploadModal');
});

g('confirmUploadBtn').addEventListener('click', async () => {
  if (!selectedFile) return;
  const name = g('uploadName').value;
  let folder = g('uploadFolder').value.trim();
  if (!folder.startsWith('/')) folder = '/' + folder;

  const category = g('uploadCategory').value || 'General';

  const priceEth = g('uploadPrice').value;
  const priceWei = ethers.utils.parseEther(priceEth || "0");

  const loader = g('uploadLoader');
  const btn = g('confirmUploadBtn');
  const stat = g('uploadStatusBox');

  btn.disabled = true; loader.style.display = 'block';
  try {
    stat.innerText = 'Pinning to IPFS...';
    const data = new FormData();
    data.append('file', selectedFile);
    const res = await fetch('/upload', { method: 'POST', body: data });
    const json = await res.json();
    if (json.error) throw new Error(json.error);

    stat.innerText = 'Computing Hash & Checking Blockchain...';
    const hash = await computeContentHash(selectedFile);

    // Check global existence early
    const verifyRes = await fetch('/verify/' + hash);
    const verifyData = await verifyRes.json();

    if (verifyData.found) {
      stat.innerHTML = `<span style="color:#ef4444"><i class="fa-solid fa-triangle-exclamation"></i> Duplicating file not allowed.</span><br/>This file already exists on the blockchain.<br/><b>Owner:</b> ${verifyData.owner}<br/><b>Category:</b> ${verifyData.category}`;
      throw new Error("Duplicate File");
    }

    stat.innerText = 'Confirm in MetaMask...';
    const tx = await contract.addFile(name, json.cid, json.size, json.mime, hash, category, priceWei, folder);

    stat.innerHTML = `Transaction Sent: <a href="https://sepolia.etherscan.io/tx/${tx.hash}" target="_blank" style="color:var(--accent)">View</a>. Waiting confirmation...`;
    await tx.wait();

    stat.innerText = 'Successfully Uploaded!';
    setTimeout(() => {
      closeModal('uploadModal');
      loadCurrentView();
    }, 1500);
  } catch (e) {
    if (e.message !== "Duplicate File") {
      stat.innerText = 'Error: ' + e.message;
    }
  } finally {
    btn.disabled = false; loader.style.display = 'none';
  }
});

g('confirmMoveBtn').addEventListener('click', async () => {
  let newFolder = g('moveFolder').value.trim();
  if (!newFolder.startsWith('/')) newFolder = '/' + newFolder;
  const newCat = g('moveCategory').value || 'General';

  const btn = g('confirmMoveBtn');
  const loader = g('moveLoader');
  const stat = g('moveStatusBox');

  btn.disabled = true;
  loader.style.display = 'block';
  stat.innerText = 'Initiating move transaction...';

  try {
    const tx = await contract.moveFile(currentActionFile.id, newFolder, newCat);
    stat.innerHTML = `Transaction Sent: <a href="https://sepolia.etherscan.io/tx/${tx.hash}" target="_blank" style="color:var(--accent)">View</a>. Waiting confirmation...`;
    await tx.wait();

    stat.innerText = 'Move Successful!';
    setTimeout(() => {
      closeModal('moveModal');
      loadCurrentView();
    }, 1500);
  } catch (e) {
    stat.innerText = "Error Moving File: " + e.message;
  } finally {
    btn.disabled = false;
    loader.style.display = 'none';
  }
});

function openShareModal(id) {
  g('shareAddress').value = '';
  g('shareStatusBox').innerText = '';
  g('shareLoader').style.display = 'none';
  g('confirmShareBtn').disabled = false;
  g('shareBtnText').innerText = shareMode === 'view' ? 'Grant Access' : 'Transfer Ownership';
  showModal('shareModal');
}

g('confirmShareBtn').addEventListener('click', async () => {
  const to = g('shareAddress').value;
  if (!to || !ethers.utils.isAddress(to)) return customAlert('Invalid address');

  const btn = g('confirmShareBtn');
  const loader = g('shareLoader');
  const stat = g('shareStatusBox');

  btn.disabled = true;
  loader.style.display = 'block';
  stat.innerText = 'Initiating transaction...';

  try {
    let tx;
    if (shareMode === 'view') {
      tx = await contract.grantAccess(currentActionFile.id, to);
    } else {
      tx = await contract.transferFile(currentActionFile.id, to);
    }
    stat.innerHTML = `Transaction Sent: <a href="https://sepolia.etherscan.io/tx/${tx.hash}" target="_blank" style="color:var(--accent)">View</a>. Waiting confirmation...`;
    await tx.wait();

    stat.innerText = 'Success!';
    setTimeout(() => {
      closeModal('shareModal');
      loadCurrentView();
    }, 1500);
  } catch (e) {
    stat.innerText = 'Error: ' + e.message;
  } finally {
    btn.disabled = false;
    loader.style.display = 'none';
  }
});

async function showFileHistory(id) {
  showModal('historyModal');
  const hist = g('historyList');
  hist.innerHTML = '<div class="loader" style="margin:20px auto; border-top-color:#a78bfa;"></div>';
  try {
    const logs = await contract.getHistory(id);
    hist.innerHTML = '';
    if (!logs.length) {
      hist.innerHTML = '<p style="color:var(--muted)">No history found.</p>';
      return;
    }
    for (let i = logs.length - 1; i >= 0; i--) {
      const l = logs[i];
      const div = document.createElement('div');
      div.className = 'history-item';
      div.innerHTML = `
        <div class="actor"><i class="fa-solid fa-address-card"></i> Actor: <span>${l.actor}</span></div>
        <div class="action"><i class="fa-solid fa-bolt"></i> ${l.action}</div>
        <div class="time"><i class="fa-solid fa-clock"></i> ${new Date(Number(l.timestamp) * 1000).toLocaleString()}</div>
      `;
      hist.appendChild(div);
    }
  } catch (e) {
    hist.innerHTML = '<p style="color:#ef4444">Failed to load history.</p>';
  }
}

async function openManageAccessModal(id) {
  showModal('manageAccessModal');
  const list = g('accessList');
  const loader = g('accessListLoader');
  list.innerHTML = '';
  loader.style.display = 'block';

  try {
    const grantedFilter = contract.filters.AccessGranted(ethers.BigNumber.from(id));
    const boughtFilter = contract.filters.AccessBought(ethers.BigNumber.from(id));

    const grantedLogs = await contract.queryFilter(grantedFilter, 0, 'latest');
    const boughtLogs = await contract.queryFilter(boughtFilter, 0, 'latest');

    const candidates = new Set();

    grantedLogs.forEach(log => {
      candidates.add(log.args.to);
    });
    boughtLogs.forEach(log => {
      candidates.add(log.args.buyer);
    });

    const activeUsers = [];
    for (let user of candidates) {
      const has = await contract.hasAccess(id, user);
      if (has && user.toLowerCase() !== currentAccount.toLowerCase()) {
        activeUsers.push(user);
      }
    }

    loader.style.display = 'none';

    if (activeUsers.length === 0) {
      list.innerHTML = '<div style="text-align:center; padding:40px 20px;"><i class="fa-solid fa-user-shield" style="font-size:3rem; color:var(--muted); margin-bottom:16px; display:block;"></i><p style="color:var(--text); margin:0; font-weight:500;">Private File</p><p style="color:var(--muted); font-size:0.9rem; margin-top:4px;">No users currently have view access.</p></div>';
      return;
    }

    activeUsers.forEach(user => {
      const item = document.createElement('div');
      item.className = 'access-item';

      const addrSpan = document.createElement('div');
      addrSpan.className = 'address';
      addrSpan.innerHTML = `<i class="fa-solid fa-wallet" style="color:var(--accent); font-size:1.2rem;"></i> <span>${user}</span>`;

      const revokeBtn = document.createElement('button');
      revokeBtn.className = 'btn btn-danger btn-sm';
      revokeBtn.style.flexShrink = '0';
      revokeBtn.innerHTML = '<i class="fa-solid fa-user-minus"></i> Revoke';
      let isRevoking = false;
      revokeBtn.onclick = async () => {
        if (isRevoking) return;
        if (!(await customConfirm('Revoke access for ' + user + '?'))) return;
        isRevoking = true;
        revokeBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Revoking...';
        revokeBtn.style.opacity = '0.5';
        try {
          const tx = await contract.revokeAccess(id, user);
          await tx.wait();
          item.remove();
          if (list.children.length === 0) {
            list.innerHTML = '<div style="text-align:center; padding:40px 20px;"><i class="fa-solid fa-user-shield" style="font-size:3rem; color:var(--muted); margin-bottom:16px; display:block;"></i><p style="color:var(--text); margin:0; font-weight:500;">Private File</p><p style="color:var(--muted); font-size:0.9rem; margin-top:4px;">No users currently have view access.</p></div>';
          }
        } catch (e) {
          await customAlert('Error revoking access: ' + e.message);
          revokeBtn.innerHTML = '<i class="fa-solid fa-user-minus"></i> Revoke';
          revokeBtn.style.opacity = '1';
        } finally {
          isRevoking = false;
        }
      };

      item.appendChild(addrSpan);
      item.appendChild(revokeBtn);
      list.appendChild(item);
    });

  } catch (e) {
    loader.style.display = 'none';
    list.innerHTML = '<p style="color:#ef4444; text-align:center;">Failed to load access list:<br/>' + e.message + '</p>';
  }
}

async function buyFile(id, priceWei) {
  try {
    const tx = await contract.buyAccess(id, { value: priceWei });
    await customAlert('Transaction sent. Please wait for confirmation.');
    await tx.wait();
    await customAlert('Purchase successful! Item is now in "Shared with Me"');
    loadCurrentView();
  } catch (e) { await customAlert(e.message); }
}

function openPreview(cid, name, mime) {
  const url = `https://gateway.pinata.cloud/ipfs/${cid}`;
  g('previewTitle').innerText = name;

  // Reset zoom on open
  currentZoom = 1;
  applyZoom();

  const viewer = g('previewViewer');
  viewer.innerHTML = `<div class="loader" style="border-top-color:#a78bfa;"></div>`;

  viewer.style.position = 'relative';
  viewer.style.overflow = 'auto'; // allow scrolling when zoomed
  viewer.style.display = 'flex';
  viewer.style.flex = '1';
  viewer.style.minHeight = '0';
  viewer.style.justifyContent = 'center';
  viewer.style.alignItems = 'center';
  viewer.style.height = '100%';
  viewer.style.width = '100%';
  viewer.style.backgroundColor = 'rgba(0,0,0,0.02)';

  const isImage = mime && mime.startsWith('image/');
  const isVideo = mime && mime.startsWith('video/');
  const isAudio = mime && mime.startsWith('audio/');
  const isPdf = mime && mime.includes('pdf');
  const isText = mime && mime.startsWith('text/');

  viewer.innerHTML = '';

  if (isImage) {
    const img = document.createElement('img');
    img.src = url;
    img.style.maxWidth = '100%';
    img.style.maxHeight = '100%';
    img.style.objectFit = 'contain';
    img.style.transition = 'transform 0.15s ease';
    viewer.appendChild(img);
  } else if (isVideo || isAudio) {
    const media = document.createElement(isVideo ? 'video' : 'audio');
    media.src = url;
    media.controls = true;
    media.style.maxWidth = '100%';
    media.style.maxHeight = '100%';
    media.style.outline = 'none';
    media.style.transition = 'transform 0.15s ease';
    viewer.appendChild(media);
  } else if (isPdf) {
    const container = document.createElement('div');
    container.style.width = '100%';
    container.style.height = '100%';
    container.style.overflow = 'auto'; // ensure it can scroll
    container.style.display = 'flex';
    container.style.flexDirection = 'column';
    container.style.alignItems = 'center';
    container.style.backgroundColor = '#f1f5f9';
    container.style.padding = '20px';
    viewer.appendChild(container);

    const renderPdf = async () => {
      try {
        const loadingTask = pdfjsLib.getDocument(url);
        const pdf = await loadingTask.promise;
        for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
          const page = await pdf.getPage(pageNum);

          // Render at high resolution for clarity
          const baseScale = 2.0;
          const viewport = page.getViewport({ scale: baseScale });

          const canvas = document.createElement('canvas');
          const context = canvas.getContext('2d');
          canvas.height = viewport.height;
          canvas.width = viewport.width;
          canvas.style.marginBottom = '20px';
          canvas.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)';

          // Store base dimensions for zooming
          canvas.dataset.baseWidth = viewport.width;
          canvas.dataset.baseHeight = viewport.height;

          // Initial zoom display size
          const currentScale = typeof currentZoom !== 'undefined' ? currentZoom : 1;
          const displayScale = currentScale / baseScale;
          canvas.style.width = (viewport.width * displayScale) + 'px';
          canvas.style.height = (viewport.height * displayScale) + 'px';
          canvas.style.transition = 'width 0.15s ease, height 0.15s ease';

          await page.render({ canvasContext: context, viewport: viewport }).promise;
          container.appendChild(canvas);
        }
      } catch (err) {
        container.innerHTML = `<p style="color:red; padding:20px;">Error rendering PDF: ${err.message}</p>`;
      }
    };
    renderPdf();

  } else if (isText) {
    const iframe = document.createElement('iframe');
    iframe.src = url;
    iframe.style.width = '100%';
    iframe.style.height = '100%';
    iframe.style.border = 'none';
    iframe.style.backgroundColor = '#fff';
    viewer.appendChild(iframe);
  } else {
    // Fallback for unknown/unsupported
    const fallbackDiv = document.createElement('div');
    fallbackDiv.style.display = 'flex';
    fallbackDiv.style.flexDirection = 'column';
    fallbackDiv.style.alignItems = 'center';
    fallbackDiv.style.gap = '16px';
    fallbackDiv.style.padding = '40px';
    fallbackDiv.innerHTML = `
      <i class="fa-solid fa-file-shield" style="font-size:4rem; color:var(--muted)"></i>
      <h3 style="margin:0; color:var(--text);">Preview Not Available</h3>
      <p style="text-align:center; color:var(--muted); max-width:400px;">This file type (${mime || 'unknown'}) cannot be securely previewed in the browser. Please download it or open securely.</p>
      <a href="${url}" target="_blank" class="btn btn-primary"><i class="fa-solid fa-up-right-from-square"></i> Open securely in new tab</a>
    `;
    viewer.appendChild(fallbackDiv);
  }

  showModal('previewModal');
}

// Zoom controls
function changeZoom(delta) {
  if (delta === 0) {
    currentZoom = 1;
  } else {
    currentZoom += delta;
    if (currentZoom < 0.25) currentZoom = 0.25;
    if (currentZoom > 5) currentZoom = 5;
  }
  applyZoom();
}

function applyZoom() {
  const viewer = g('previewViewer');
  // We target the immediate child elements that hold the actual content (img or iframe)
  Array.from(viewer.children).forEach(child => {
    if (child.tagName === 'IMG' || child.tagName === 'IFRAME' || child.tagName === 'VIDEO') {
      child.style.transform = `scale(${currentZoom})`;
      child.style.transformOrigin = 'center center';
      child.style.transition = 'transform 0.15s ease';
    } else if (child.tagName === 'DIV') {
      // PDF Container
      const canvases = child.querySelectorAll('canvas');
      canvases.forEach(canvas => {
        if (canvas.dataset.baseWidth && canvas.dataset.baseHeight) {
          const baseScale = 2.0;
          const displayScale = currentZoom / baseScale;
          canvas.style.width = (canvas.dataset.baseWidth * displayScale) + 'px';
          canvas.style.height = (canvas.dataset.baseHeight * displayScale) + 'px';
        }
      });
    }
  });
}

// Bind zoom buttons
document.addEventListener('DOMContentLoaded', () => {
  g('btnZoomIn').addEventListener('click', () => changeZoom(0.25));
  g('btnZoomOut').addEventListener('click', () => changeZoom(-0.25));
  g('btnZoomReset').addEventListener('click', () => changeZoom(0));

  // Mobile Menu Toggle
  const mobileMenuBtn = g('mobileMenuToggle');
  const sidebar = document.querySelector('aside.sidebar');
  if (mobileMenuBtn && sidebar) {
    mobileMenuBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      sidebar.classList.toggle('mobile-open');
    });

    // Close sidebar when clicking outside of it
    document.addEventListener('click', (e) => {
      if (sidebar.classList.contains('mobile-open') && !sidebar.contains(e.target) && !mobileMenuBtn.contains(e.target)) {
        sidebar.classList.remove('mobile-open');
      }
    });

    // Close sidebar on interactive selections
    sidebar.addEventListener('click', (e) => {
      if (e.target.closest('.nav-item') || e.target.closest('.btn')) {
        sidebar.classList.remove('mobile-open');
      }
    });
    sidebar.addEventListener('change', (e) => {
      if (e.target.tagName === 'SELECT') {
        sidebar.classList.remove('mobile-open');
      }
    });
  }
});

// Theme Toggle
const storedTheme = localStorage.getItem('theme');
if (storedTheme === 'light') {
  document.body.classList.add('light-theme');
  const icon = document.getElementById('themeIcon');
  if (icon) { icon.classList.remove('fa-sun'); icon.classList.add('fa-moon'); }
}

g('themeToggleBtn').addEventListener('click', () => {
  const body = document.body;
  body.classList.toggle('light-theme');
  const icon = g('themeIcon');
  if (body.classList.contains('light-theme')) {
    localStorage.setItem('theme', 'light');
    icon.classList.remove('fa-sun');
    icon.classList.add('fa-moon');
  } else {
    localStorage.setItem('theme', 'dark');
    icon.classList.remove('fa-moon');
    icon.classList.add('fa-sun');
  }
});

// --- Custom Native Dialog Replacements ---

window.customAlert = function (message) {
  return new Promise((resolve) => {
    g('customAlertMessage').innerText = message;
    showModal('customAlertModal');

    const onOk = () => {
      closeModal('customAlertModal');
      g('customAlertOkBtn').removeEventListener('click', onOk);
      resolve();
    };

    g('customAlertOkBtn').addEventListener('click', onOk);
  });
};

window.customConfirm = function (message) {
  return new Promise((resolve) => {
    g('customConfirmMessage').innerText = message;
    showModal('customConfirmModal');

    const cleanup = () => {
      closeModal('customConfirmModal');
      g('customConfirmOkBtn').removeEventListener('click', onConfirm);
      g('customConfirmCancelBtn').removeEventListener('click', onCancel);
    };

    const onConfirm = () => { cleanup(); resolve(true); };
    const onCancel = () => { cleanup(); resolve(false); };

    g('customConfirmOkBtn').addEventListener('click', onConfirm);
    g('customConfirmCancelBtn').addEventListener('click', onCancel);
  });
};

window.customPrompt = function (message, defaultVal = '') {
  return new Promise((resolve) => {
    g('customPromptMessage').innerText = message;
    const input = g('customPromptInput');
    input.value = defaultVal;
    showModal('customPromptModal');
    input.focus();

    const cleanup = () => {
      closeModal('customPromptModal');
      g('customPromptSubmitBtn').removeEventListener('click', onSubmit);
      g('customPromptCancelBtn').removeEventListener('click', onCancel);
      input.removeEventListener('keydown', onKey);
    };

    const onSubmit = () => { cleanup(); resolve(input.value); };
    const onCancel = () => { cleanup(); resolve(null); };
    const onKey = (e) => { if (e.key === 'Enter') onSubmit(); };

    g('customPromptSubmitBtn').addEventListener('click', onSubmit);
    g('customPromptCancelBtn').addEventListener('click', onCancel);
    input.addEventListener('keydown', onKey);
  });
};

init();
