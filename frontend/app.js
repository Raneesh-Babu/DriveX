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
let selectedFileIds = new Set(); // Multi-select track file IDs

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
  "event ViewRequested(uint256 indexed id, address indexed requester)",
  "event FileTrashed(uint256 indexed id, address indexed owner)",
  "event FileRestored(uint256 indexed id, address indexed owner)",
  "event FileStarred(uint256 indexed id, address indexed user, bool isStarred)",
  "function addFile(string name, string cid, uint256 size, string mime, bytes32 contentHash, string category, uint256 price, string folder) returns (uint256)",
  "function batchAddFiles(string[] names, string[] cids, uint256[] sizes, string[] mimes, bytes32[] contentHashes, string[] categories, uint256[] prices, string[] folders) returns (uint256[])",
  "function batchMoveFiles(uint256[] ids, string[] newFolders, string[] newCategories)",
  "function batchRemoveFiles(uint256[] ids)",
  "function batchTrashFiles(uint256[] ids)",
  "function batchTransferFiles(uint256[] ids, address to)",
  "function batchGrantAccess(uint256[] ids, address to)",
  "function batchRevokeAccess(uint256[] ids, address user)",
  "function buyAccess(uint256 id) payable",
  "function editName(uint256 id, string newName)",
  "function getFile(uint256 id) view returns (uint256 _id, string name, string cid, uint256 size, string mime, address owner, uint256 timestamp, bool deleted, bytes32 contentHash, string category, uint256 price, string folder)",
  "function getFilesByOwner(address owner) view returns (uint256[])",
  "function getBinnedFiles(address owner) view returns (uint256[])",
  "function getHistory(uint256 id) view returns (tuple(address actor, string action, uint256 timestamp)[])",
  "function getMarketFiles() view returns (uint256[])",
  "function getSharedFiles(address user) view returns (uint256[])",
  "function getStarredFiles(address user) view returns (uint256[])",
  "function grantAccess(uint256 id, address to)",
  "function hasAccess(uint256 id, address user) view returns (bool)",
  "function hashExists(bytes32) view returns (bool)",
  "function moveFile(uint256 id, string newFolder, string newCategory)",
  "function removeFile(uint256 id)",
  "function restoreFile(uint256 id)",
  "function revokeAccess(uint256 id, address user)",
  "function setPrice(uint256 id, uint256 newPrice)",
  "function starredFiles(uint256, address) view returns (bool)",
  "function toggleStar(uint256 id)",
  "function totalFiles() view returns (uint256)",
  "function transferFile(uint256 id, address to)",
  "function trashFile(uint256 id)",
  "function verifyFileByHash(bytes32 hash) view returns (bool found, uint256 id, address owner, string category, uint256 timestamp)",
  "function requestAccess(uint256 id)",
  "function approveAccessRequest(uint256 id, address requester)",
  "function denyAccessRequest(uint256 id, address requester)",
  "function viewRequests(uint256, address) view returns (bool)",
  "function registerUsername(string username)",
  "function changeUsername(string newUsername)",
  "function getUsername(address user) view returns (string)",
  "function usernames(address) view returns (string)",
  "function upgradeTier(uint8 tier, uint256 gbAmount) payable",
  "function getStorageLimitBytes(address user) view returns (uint256)",
  "function getFileCountLimit(address user) view returns (uint256)",
  "function storageTier(address) view returns (uint8)",
  "function customStorageGB(address) view returns (uint256)",
  "function premiumPrice() view returns (uint256)",
  "function proPrice() view returns (uint256)",
  "function proPlusPerGB() view returns (uint256)",
  "function setTierPrices(uint256 _premium, uint256 _pro, uint256 _proPlusPerGB)",
  "function withdrawFunds()",
  "event UsernameRegistered(address indexed user, string username)",
  "event TierUpgraded(address indexed user, uint8 tier, uint256 storageBytes)",
  "event FileRenamed(uint256 indexed id, address indexed owner, string newName)",
  "event FileMoved(uint256 indexed id, address indexed owner, string newFolder, string newCategory)",
  "function contractOwner() view returns (address)"
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

// Global UI Helper to fetch username or return lowercased address snippet
async function resolveAddressDisplay(address) {
  if (!address) return 'Unknown';
  try {
    const u = await contract.getUsername(address);
    if (u) return `<span style="color:var(--accent); font-weight:600;">@${u}</span> <span style="font-size:0.8em; color:var(--muted);">(${address.toLowerCase()})</span>`;
  } catch (e) { }
  return `<code>${address.toLowerCase()}</code>`;
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
      const formattedOwner = data.owner.toLowerCase();
      const ownerDisplay = data.username ? `<span style="color:var(--accent);">@${data.username}</span> <span style="font-size:0.8em; color:var(--muted);">(${formattedOwner})</span>` : formattedOwner;
      resBox.innerHTML = `
        <strong style="color:#34d399"><i class="fa-solid fa-check-circle"></i> Verified on Blockchain</strong><br/><br/>
        <b>Owner:</b> ${ownerDisplay}<br/>
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
  g('accountStatusText').innerText = account.slice(0, 6).toLowerCase() + '...' + account.slice(-4).toLowerCase();

  // --- Phase 5: Fetch username and storage tier ---
  try {
    const username = await contract.getUsername(account);
    if (username && username.length > 0) {
      g('accountStatusText').innerHTML = `<span style="color:var(--accent); font-weight:600;">@${username}</span>`;
    } else {
      // Prompt username registration (non-blocking)
      setTimeout(() => showModal('usernameModal'), 800);
    }
  } catch (e) { console.warn('Could not fetch username:', e.message); }

  // Load storage limit for progress bar
  updateStorageLimitDisplay();

  // Check if admin to show panel option
  checkAdminStatus();

  loadCurrentView();

  // Start real-time auto-update listeners
  setupContractListeners();

  // Upgrade Plan button
  const upgradeBtn = g('upgradePlanBtn');
  if (upgradeBtn) {
    upgradeBtn.onclick = () => openUpgradePlanModal();
  }

  // Username Registration
  const confirmUsernameBtn = g('confirmUsernameBtn');
  if (confirmUsernameBtn) {
    confirmUsernameBtn.onclick = async () => {
      const username = g('usernameInput').value.trim();
      const statusBox = g('usernameStatusBox');
      const loader = g('usernameLoader');
      if (username.length < 3) { statusBox.innerText = 'Username must be at least 3 characters.'; return; }
      confirmUsernameBtn.disabled = true;
      loader.style.display = 'block';
      statusBox.innerText = '';
      try {
        const tx = await contract.registerUsername(username, { gasLimit: 300000 });
        statusBox.innerText = 'Transaction pending...';
        await tx.wait();
        g('accountStatusText').innerHTML = `<span style="color:var(--accent); font-weight:600;">@${username}</span>`;
        closeModal('usernameModal');
        await customAlert(`Username @${username} registered successfully!`);
      } catch (e) {
        statusBox.innerText = 'Error: ' + (e.reason || e.message);
        confirmUsernameBtn.disabled = false;
      }
      loader.style.display = 'none';
    };
  }
}

async function updateStorageLimitDisplay() {
  if (!contract || !currentAccount) return;
  try {
    const limitBn = await contract.getStorageLimitBytes(currentAccount);
    const limitBytes = limitBn.toNumber();
    const limitEl = g('storageLimitText');
    if (limitEl) limitEl.innerText = formatBytes(limitBytes);
    // Store globally for use in progress bar
    window._storageLimitBytes = limitBytes;
  } catch (e) { console.warn('Could not fetch storage limit:', e.message); }
}

async function openUpgradePlanModal() {
  showModal('upgradePlanModal');
  const tierCards = g('tierCards');
  const confirmBtn = g('confirmUpgradeBtn');
  const btnText = g('upgradeBtnText');
  const statusBox = g('upgradeStatusBox');
  const proPlusRow = g('proPlusRow');
  const proPlusGBInput = g('proPlusGB');
  const proPlusPrice = g('proPlusPrice');
  statusBox.innerText = '';

  let selectedTier = null;
  let currentTier = 0;

  // Fetch live prices and current tier from contract
  let premiumWei = ethers.utils.parseEther('0.00016');
  let proWei = ethers.utils.parseEther('0.00023');
  let proPlusPerGBWei = ethers.utils.parseEther('0.000091');
  try {
    premiumWei = await contract.premiumPrice();
    proWei = await contract.proPrice();
    proPlusPerGBWei = await contract.proPlusPerGB();
    if (contract && currentAccount) {
      currentTier = await contract.storageTier(currentAccount);
    }
  } catch (e) { }

  const tiers = [
    { id: 0, name: 'Free', storage: '250 MB', files: '100 files', price: 'Free', color: '#6b7280', priceWei: null },
    { id: 1, name: 'Premium', storage: '500 MB', files: '250 files', price: `${ethers.utils.formatEther(premiumWei)} ETH`, color: '#60a5fa', priceWei: premiumWei },
    { id: 2, name: 'Pro', storage: '1 GB', files: '500 files', price: `${ethers.utils.formatEther(proWei)} ETH`, color: '#a78bfa', priceWei: proWei },
    { id: 3, name: 'Pro+', storage: 'Custom', files: 'Unlimited', price: `${ethers.utils.formatEther(proPlusPerGBWei)} ETH/GB`, color: '#34d399', priceWei: proPlusPerGBWei },
  ];

  tierCards.innerHTML = '';
  tiers.forEach(tier => {
    const isCurrent = tier.id === currentTier;
    const card = document.createElement('div');
    const opacity = isCurrent ? '0.6' : '1';
    const cursor = isCurrent ? 'not-allowed' : 'pointer';
    card.style.cssText = `border: 2px solid ${tier.color}33; border-radius: 12px; padding: 16px; cursor: ${cursor}; opacity: ${opacity}; transition: all 0.2s; background: rgba(255,255,255,0.03); position: relative;`;
    
    let currentBadge = '';
    if (isCurrent) {
        currentBadge = `<div style="position:absolute; top:-10px; right:12px; background:${tier.color}; color:#fff; font-size:0.75rem; padding:4px 10px; border-radius:12px; font-weight:bold; box-shadow:0 0 10px ${tier.color}66;">Current Plan</div>`;
    }

    card.innerHTML = `
      ${currentBadge}
      <div style="font-size:1.1rem; font-weight:bold; color:${tier.color};">${tier.name}</div>
      <div style="font-size:0.85rem; color:var(--text); margin:8px 0;">${tier.storage}<br/>${tier.files}</div>
      <div style="font-size:0.9rem; color:var(--muted); font-weight:500;">${tier.price}</div>
    `;
    card.onclick = () => {
      if (isCurrent) return; // Do not allow selecting current plan
      tierCards.querySelectorAll('div').forEach(c => c.style.borderColor = c.dataset.color + '33');
      card.style.borderColor = tier.color;
      card.style.background = `${tier.color}18`;
      selectedTier = tier;
      proPlusRow.style.display = tier.id === 3 ? 'block' : 'none';
      if (tier.id === 3) {
        const gb = parseInt(proPlusGBInput.value) || 1;
        proPlusPrice.innerText = `Total: ${ethers.utils.formatEther(proPlusPerGBWei.mul(gb))} ETH`;
      }
      confirmBtn.disabled = false;
      btnText.innerText = tier.id > currentTier ? `Upgrade to ${tier.name}` : `Downgrade to ${tier.name}`;
    };
    card.dataset.color = tier.color;
    tierCards.appendChild(card);
  });

  proPlusGBInput.oninput = () => {
    if (selectedTier && selectedTier.id === 3) {
      const gb = parseInt(proPlusGBInput.value) || 1;
      proPlusPrice.innerText = `Total: ${ethers.utils.formatEther(proPlusPerGBWei.mul(gb))} ETH`;
    }
  };

  confirmBtn.onclick = async () => {
    if (!selectedTier) return;
    const loader = g('upgradeLoader');
    confirmBtn.disabled = true;
    loader.style.display = 'block';
    statusBox.innerText = '';

    try {
      let tx;
      if (selectedTier.id === 0) {
        await customAlert('You are already on the Free plan.');
        closeModal('upgradePlanModal');
        return;
      } else if (selectedTier.id === 3) {
        const gb = parseInt(proPlusGBInput.value) || 1;
        const totalWei = proPlusPerGBWei.mul(gb);
        tx = await contract.upgradeTier(3, gb, { value: totalWei, gasLimit: 300000 });
      } else {
        tx = await contract.upgradeTier(selectedTier.id, 0, { value: selectedTier.priceWei, gasLimit: 300000 });
      }
      statusBox.innerText = 'Transaction pending...';
      await tx.wait();
      closeModal('upgradePlanModal');
      await updateStorageLimitDisplay();
      loadCurrentView();
      await customAlert(`Successfully upgraded to ${selectedTier.name} plan!`);
    } catch (e) {
      statusBox.innerText = 'Error: ' + (e.reason || e.message);
      confirmBtn.disabled = false;
    }
    loader.style.display = 'none';
    btnText.innerText = `Upgrade to ${selectedTier.name}`;
  };
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
let searchTimeout;
g('searchInput').addEventListener('input', (e) => {
  currentSearchQuery = e.target.value.toLowerCase();
  selectedFileIds.clear();
  updateMultiSelectUI();

  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => {
    loadCurrentView();
  }, 300); // 300ms debounce
});

g('categoryFilter').addEventListener('change', (e) => {
  currentCategoryFilter = e.target.value;
  selectedFileIds.clear();
  updateMultiSelectUI();
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

// Helper: hide all special view sections and restore grid
function hideAllSections() {
  if (g('publicVerifySection')) g('publicVerifySection').style.display = 'none';
  if (g('activityLogSection')) g('activityLogSection').style.display = 'none';
  if (g('adminPanelSection')) g('adminPanelSection').style.display = 'none';
  if (g('settingsSection')) g('settingsSection').style.display = 'none';
}

// Navigation
document.querySelectorAll('.nav-item').forEach(el => {
  el.addEventListener('click', (e) => {
    if (el.id === 'navPublicVerify') {
      currentView = 'publicverify';
      document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
      el.classList.add('active');
      g('viewTitle').innerText = 'Public Verification';

      hideAllSections();
      g('filesGrid').style.display = 'none';
      if (g('breadcrumbsWrapper')) g('breadcrumbsWrapper').style.display = 'none';
      g('publicVerifySection').style.display = 'block';
      return;
    }

    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    el.classList.add('active');
    currentView = el.getAttribute('data-view');
    currentFolder = '/';
    const titles = { 'myfiles': 'My Files', 'starred': 'Starred', 'bin': 'Bin', 'sharedfiles': 'Shared With Me', 'marketfiles': 'Marketplace', 'activity': 'Activity Log', 'adminpanel': 'Admin Panel', 'settings': 'Settings' };
    g('viewTitle').innerText = titles[currentView] || 'Files';

    // Hide all special sections first
    hideAllSections();

    if (currentView === 'activity') {
      // Show activity log, hide normal grid
      g('filesGrid').style.display = 'none';
      if (g('breadcrumbsWrapper')) g('breadcrumbsWrapper').style.display = 'none';
      if (g('activityLogSection')) g('activityLogSection').style.display = 'block';
      loadActivityLog();
      return;
    }

    if (currentView === 'adminpanel') {
      // Show admin panel, hide normal grid
      g('filesGrid').style.display = 'none';
      if (g('breadcrumbsWrapper')) g('breadcrumbsWrapper').style.display = 'none';
      if (g('adminPanelSection')) g('adminPanelSection').style.display = 'block';
      loadAdminPanel();
      return;
    }

    if (currentView === 'settings') {
      g('filesGrid').style.display = 'none';
      if (g('breadcrumbsWrapper')) g('breadcrumbsWrapper').style.display = 'none';
      if (g('settingsSection')) g('settingsSection').style.display = 'block';
      loadSettingsView();
      return;
    }

    // Restore grid view components
    g('filesGrid').style.display = 'grid';
    if (g('breadcrumbsWrapper')) g('breadcrumbsWrapper').style.display = 'flex';

    // Clear search/filter on navigation change
    g('searchInput').value = ''; currentSearchQuery = '';
    g('categoryFilter').value = 'All'; currentCategoryFilter = 'All';
    selectedFileIds.clear();
    updateMultiSelectUI();
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
        <b>Owner:</b> ${await resolveAddressDisplay(data.owner)}<br/>
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
              const actorDisplay = await resolveAddressDisplay(l.actor);
              div.innerHTML = `
                 <div class="actor"><i class="fa-solid fa-address-card"></i> Actor: <span>${actorDisplay}</span></div>
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
  else if (currentView === 'starred') endpoint = '/starredfiles/' + currentAccount;
  else if (currentView === 'bin') endpoint = '/binnedfiles/' + currentAccount;


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
      const MAX_BYTES = window._storageLimitBytes || (250 * 1024 * 1024); // default to Free 250MB
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
    // Check for pending requests asynchronously
    checkPendingRequests();
    checkNotifications();

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

    // Parse Advanced Search Query
    let queryText = currentSearchQuery.toLowerCase();
    let queryCategory = null;

    // Check for "category:X" syntax
    const catMatch = queryText.match(/category:([^\s]+)/i);
    if (catMatch) {
      queryCategory = catMatch[1].toLowerCase();
      // Remove the category:Token from the main text query
      queryText = queryText.replace(catMatch[0], '').trim();
    }

    const matchesCategoryDrop = currentCategoryFilter === 'All' || f.category === currentCategoryFilter;

    let matchesSearch = !isSearchActive;
    if (isSearchActive) {
      // if they specified a category via search box, it must match
      const searchCatMatch = !queryCategory || (f.category && f.category.toLowerCase().includes(queryCategory));
      
      // Check if text matches the file name, category, OR file type (mime)
      let searchTextMatch = !queryText || 
                            (f.name && f.name.toLowerCase().includes(queryText)) || 
                            (f.category && f.category.toLowerCase().includes(queryText));
                            
      // Map friendly terms to mime types
      if (queryText === 'image' || queryText === 'images' || queryText === 'photo') {
        searchTextMatch = searchTextMatch || (f.mime && f.mime.startsWith('image/'));
      } else if (queryText === 'video' || queryText === 'videos') {
        searchTextMatch = searchTextMatch || (f.mime && f.mime.startsWith('video/'));
      } else if (queryText === 'audio' || queryText === 'music') {
        searchTextMatch = searchTextMatch || (f.mime && f.mime.startsWith('audio/'));
      } else if (queryText === 'document' || queryText === 'documents' || queryText === 'doc') {
        searchTextMatch = searchTextMatch || (f.mime && (f.mime.includes('pdf') || f.mime.includes('word') || f.mime.includes('text')));
      }

      matchesSearch = searchCatMatch && searchTextMatch;
    }

    if (!matchesCategoryDrop || !matchesSearch) return;

    if (isSearchActive || currentView === 'marketfiles' || currentView === 'sharedfiles') {
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

  // 2. Add purely virtual folders logic if no search is active, or not in flat views
  if (!isSearchActive && currentView !== 'marketfiles' && currentView !== 'sharedfiles') {
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

      // Compute folder metadata from allFiles
      let folderSize = 0;
      let folderCreated = Infinity;
      allFiles.forEach(f => {
        const fileFolder = (f.folder || '/').replace(/\/+$/, '') || '/';
        if (fileFolder === folderPath || fileFolder.startsWith(folderPath + '/')) {
          folderSize += parseInt(f.size || 0);
          const ts = parseInt(f.timestamp || 0);
          if (ts > 0 && ts < folderCreated) folderCreated = ts;
        }
      });
      const folderSizeStr = formatBytes(folderSize);
      const folderCreatedStr = folderCreated < Infinity
        ? new Date(folderCreated * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
        : '—';

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
          <div class="file-meta" style="font-size:0.78rem; color:var(--muted); gap:6px; margin-top:4px;">
            <span><i class="fa-solid fa-calendar-plus" style="margin-right:3px;"></i>${folderCreatedStr}</span>
            <span><i class="fa-solid fa-database" style="margin-right:3px;"></i>${folderSizeStr}</span>
          </div>
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
    if (selectedFileIds.has(f.id)) card.classList.add('selected');

    // Add Checkbox for multi-select (only if owner, or generic depending on mode)
    const isOwner = f.owner && currentAccount && f.owner.toLowerCase() === currentAccount.toLowerCase();

    // Only allow selecting files the user owns for bulk actions, or if in shared/market for purely viewing
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.className = 'file-checkbox';
    cb.checked = selectedFileIds.has(f.id);
    cb.onclick = (e) => {
      e.stopPropagation();
      if (cb.checked) {
        selectedFileIds.add(f.id);
        card.classList.add('selected');
      } else {
        selectedFileIds.delete(f.id);
        card.classList.remove('selected');
      }
      updateMultiSelectUI();
    };

    if (currentView === 'myfiles' || (currentView === 'marketfiles' && isOwner)) {
      card.appendChild(cb);
    }

    const thumb = document.createElement('div');
    thumb.className = 'file-thumb';
    const ext = f.name.split('.').pop().toUpperCase();

    if (f.mime && f.mime.startsWith('image/')) {
      const img = document.createElement('img');
      img.src = `https://gateway.pinata.cloud/ipfs/${f.cid}`;
      img.onerror = () => { thumb.innerHTML = `<i class="fa-solid fa-file"></i><span class="file-ext">${ext}</span>`; };
      thumb.appendChild(img);
    } else if (f.mime && f.mime.startsWith('video/')) {
      const videoSrc = `https://gateway.pinata.cloud/ipfs/${f.cid}`;
      const canvasId = 'vid-thumb-' + f.cid;
      thumb.innerHTML = `<canvas id="${canvasId}" style="width:100%; height:100%; object-fit:contain; border-radius:8px 8px 0 0; background:#000;"></canvas><div style="position:absolute; top:50%; left:50%; transform:translate(-50%, -50%); color:rgba(255,255,255,0.8);"><i class="fa-solid fa-circle-play fa-2x"></i></div>`;

      setTimeout(() => {
        const video = document.createElement('video');
        video.crossOrigin = "anonymous";
        video.src = videoSrc;
        video.muted = true;
        video.playsInline = true;

        // Wait for metadata to load so we know duration/dimensions
        video.addEventListener('loadeddata', () => {
          // Seek to 1 second or half the video, whichever is smaller, to grab a good frame
          video.currentTime = Math.min(1, video.duration / 2 || 0);
        });

        // When seeking is done, draw to canvas
        video.addEventListener('seeked', () => {
          const canvas = document.getElementById(canvasId);
          if (canvas) {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          }
        });

        // Error fallback
        video.addEventListener('error', () => {
          const c = document.getElementById(canvasId);
          if (c && c.parentElement) {
            c.parentElement.innerHTML = `<i class="fa-solid fa-file-video" style="color: #6366f1;"></i><span class="file-ext">VIDEO</span>`;
          }
        });
      }, 0);
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

    // In Bin view: show Restore & Permanent Delete buttons, suppress context menu
    if (currentView === 'bin') {
      const restoreBtn = document.createElement('button');
      restoreBtn.className = 'btn btn-small';
      restoreBtn.style.cssText = 'margin:6px 6px 0; font-size:0.75rem; background:var(--accent); color:#fff;';
      restoreBtn.innerHTML = '<i class="fa-solid fa-rotate-left"></i> Restore';
      restoreBtn.onclick = async (e) => {
        e.stopPropagation();
        try {
          const tx = await contract.restoreFile(f.id);
          await tx.wait();
          loadCurrentView();
        } catch (err) {
          await customAlert('Restore failed: ' + err.message);
        }
      };

      const permDelBtn = document.createElement('button');
      permDelBtn.className = 'btn btn-small';
      permDelBtn.style.cssText = 'margin:6px 6px 6px 0; font-size:0.75rem; background:#ef4444; color:#fff;';
      permDelBtn.innerHTML = '<i class="fa-solid fa-trash"></i> Delete';
      permDelBtn.onclick = async (e) => {
        e.stopPropagation();
        const confirmed = await customConfirm(`Permanently delete "${f.name}"? This cannot be undone.`);
        if (!confirmed) return;
        try {
          const tx = await contract.removeFile(f.id);
          await tx.wait();
          loadCurrentView();
        } catch (err) {
          await customAlert('Delete failed: ' + err.message);
        }
      };

      const binActions = document.createElement('div');
      binActions.style.cssText = 'display:flex; gap:4px; padding:0 6px 6px;';
      binActions.appendChild(restoreBtn);
      binActions.appendChild(permDelBtn);
      card.appendChild(binActions);

      // No right-click context menu in Bin view
    } else {
      card.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        showContextMenu(e.pageX, e.pageY, f);
      });
    }

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

// Multi-select global actions UI
function updateMultiSelectUI() {
  const bar = g('multiSelectBar');
  const countSpan = g('multiSelectCountText');
  if (selectedFileIds.size > 0) {
    countSpan.innerText = `${selectedFileIds.size} Selected`;
    bar.classList.add('active');
  } else {
    bar.classList.remove('active');
  }
}

g('btnBulkClear').addEventListener('click', () => {
  selectedFileIds.clear();
  updateMultiSelectUI();
  // Quick hack to remove visual classes without full re-render
  document.querySelectorAll('.card.selected').forEach(c => {
    c.classList.remove('selected');
    const cb = c.querySelector('.file-checkbox');
    if (cb) cb.checked = false;
  });
});

// --- Bulk Move Logic ---
g('btnBulkMove').addEventListener('click', () => {
  if (selectedFileIds.size === 0) return;
  g('bulkMoveCount').innerText = selectedFileIds.size;
  g('bulkMoveFolder').value = currentFolder;
  g('bulkMoveCategory').value = 'General';
  g('bulkMoveStatusBox').innerText = '';
  showModal('bulkMoveModal');
});

g('confirmBulkMoveBtn').addEventListener('click', async () => {
  if (selectedFileIds.size === 0) return;

  let newFolder = g('bulkMoveFolder').value.trim();
  if (!newFolder.startsWith('/')) newFolder = '/' + newFolder;
  const newCat = g('bulkMoveCategory').value || 'General';

  const btn = g('confirmBulkMoveBtn');
  const loader = g('bulkMoveLoader');
  const stat = g('bulkMoveStatusBox');

  btn.disabled = true;
  loader.style.display = 'block';
  stat.innerText = `Preparing to move ${selectedFileIds.size} files...`;

  try {
    const idsToMove = Array.from(selectedFileIds);
    const foldersArray = new Array(idsToMove.length).fill(newFolder);
    const categoriesArray = new Array(idsToMove.length).fill(newCat);

    // Call batchMoveFiles on contract
    const tx = await contract.batchMoveFiles(idsToMove, foldersArray, categoriesArray, { gasLimit: 1000000 });
    stat.innerHTML = `Transaction Sent: <a href="https://sepolia.etherscan.io/tx/${tx.hash}" target="_blank" style="color:var(--accent)">View</a>. Waiting confirmation...`;
    await tx.wait();

    stat.innerText = 'Bulk Move Successful!';
    setTimeout(() => {
      selectedFileIds.clear();
      updateMultiSelectUI();
      closeModal('bulkMoveModal');
      loadCurrentView();
    }, 1500);
  } catch (e) {
    stat.innerText = "Error: " + e.message;
  } finally {
    btn.disabled = false;
    loader.style.display = 'none';
  }
});

// --- Bulk Transfer Logic ---
g('btnBulkTransfer').addEventListener('click', () => {
  if (selectedFileIds.size === 0) return;
  g('bulkTransferCount').innerText = selectedFileIds.size;
  g('bulkTransferAddress').value = '';
  g('bulkTransferStatusBox').innerText = '';
  showModal('bulkTransferModal');
});

g('confirmBulkTransferBtn').addEventListener('click', async () => {
  if (selectedFileIds.size === 0) return;

  const to = g('bulkTransferAddress').value;
  if (!to || !ethers.utils.isAddress(to)) return customAlert('Invalid recipient address');

  const btn = g('confirmBulkTransferBtn');
  const loader = g('bulkTransferLoader');
  const stat = g('bulkTransferStatusBox');

  btn.disabled = true;
  loader.style.display = 'block';
  stat.innerText = `Preparing to transfer ${selectedFileIds.size} files...`;

  try {
    const idsToTransfer = Array.from(selectedFileIds);

    // Call batchTransferFiles on contract
    const tx = await contract.batchTransferFiles(idsToTransfer, to, { gasLimit: 1000000 });
    stat.innerHTML = `Transaction Sent: <a href="https://sepolia.etherscan.io/tx/${tx.hash}" target="_blank" style="color:var(--accent)">View</a>. Waiting confirmation...`;
    await tx.wait();

    stat.innerText = 'Bulk Transfer Successful!';
    setTimeout(() => {
      selectedFileIds.clear();
      updateMultiSelectUI();
      closeModal('bulkTransferModal');
      loadCurrentView();
    }, 1500);
  } catch (e) {
    stat.innerText = "Error: " + e.message;
  } finally {
    btn.disabled = false;
    loader.style.display = 'none';
  }
});

// --- Bulk Delete Logic ---
g('btnBulkDelete').addEventListener('click', () => {
  if (selectedFileIds.size === 0) return;
  g('bulkDeleteCount').innerText = selectedFileIds.size;
  g('bulkDeleteStatusBox').innerText = '';
  showModal('bulkDeleteModal');
});

g('confirmBulkDeleteBtn').addEventListener('click', async () => {
  if (selectedFileIds.size === 0) return;

  const btn = g('confirmBulkDeleteBtn');
  const loader = g('bulkDeleteLoader');
  const stat = g('bulkDeleteStatusBox');

  btn.disabled = true;
  loader.style.display = 'block';
  stat.innerText = `Preparing to delete ${selectedFileIds.size} files...`;

  try {
    const idsToDelete = Array.from(selectedFileIds);

    // Call batchRemoveFiles on contract
    const tx = await contract.batchRemoveFiles(idsToDelete, { gasLimit: 1000000 });
    stat.innerHTML = `Transaction Sent: <a href="https://sepolia.etherscan.io/tx/${tx.hash}" target="_blank" style="color:var(--accent)">View</a>. Waiting confirmation...`;
    await tx.wait();

    stat.innerText = 'Bulk Delete Successful!';
    setTimeout(() => {
      selectedFileIds.clear();
      updateMultiSelectUI();
      closeModal('bulkDeleteModal');
      loadCurrentView();
    }, 1500);
  } catch (e) {
    stat.innerText = "Error: " + e.message;
  } finally {
    btn.disabled = false;
    loader.style.display = 'none';
  }
});

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

  // Reflect current star state (async, update UI once resolved)
  const starIcon = g('ctxStarIcon');
  const starText = g('ctxStarText');
  if (starIcon && starText) {
    starIcon.className = 'fa-regular fa-star'; // default
    starText.innerText = 'Star';
    if (contract && currentAccount) {
      contract.starredFiles(file.id, currentAccount).then(isStarred => {
        if (isStarred) {
          starIcon.className = 'fa-solid fa-star';
          starText.innerText = 'Unstar';
        } else {
          starIcon.className = 'fa-regular fa-star';
          starText.innerText = 'Star';
        }
      }).catch(() => { });
    }
  }

  contextMenu.classList.add('open');

  const rect = contextMenu.getBoundingClientRect();
  if (rect.right > window.innerWidth) contextMenu.style.left = `${window.innerWidth - rect.width - 10}px`;
  if (rect.bottom > window.innerHeight) contextMenu.style.top = `${window.innerHeight - rect.height - 10}px`;
}

document.addEventListener('click', () => {
  contextMenu.classList.remove('open');
  if (folderContextMenu) folderContextMenu.classList.remove('open');
});

g('ctxToggleStar').addEventListener('click', async () => {
  if (!currentActionFile) return;
  try {
    const tx = await contract.toggleStar(currentActionFile.id, { gasLimit: 300000 });
    await tx.wait();
    loadCurrentView();
  } catch (e) {
    await customAlert('Error toggling star: ' + e.message);
  }
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

g('ctxFolderShare').addEventListener('click', () => {
  shareMode = 'folder_view';
  g('shareTitle').innerText = `Share Folder`;
  g('shareDesc').innerText = `Grant view-only access to all files within this folder and its subfolders.`;
  g('shareAddress').value = '';
  g('shareStatusBox').innerText = '';
  g('shareLoader').style.display = 'none';
  g('confirmShareBtn').disabled = false;
  g('shareBtnText').innerText = 'Grant Access';
  showModal('shareModal');
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
      const tx = await contract.batchMoveFiles(filesToMove, newFolders, newCategories, { gasLimit: 1000000 });
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

g('ctxTrash').addEventListener('click', async () => {
  if (!currentActionFile) return;
  const confirmed = await customConfirm(`Move "${currentActionFile.name}" to Bin?`);
  if (!confirmed) return;
  try {
    const tx = await contract.trashFile(currentActionFile.id);
    await tx.wait();
    loadCurrentView();
  } catch (e) {
    await customAlert('Error moving to Bin: ' + e.message);
  }
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

g('ctxRequestAccess').addEventListener('click', async () => {
  if (!currentActionFile) return;
  const confirmed = await customConfirm(
    `Send a view access request to the owner of "${currentActionFile.name}"?\n\nThe owner will be notified and can approve or deny your request.`
  );
  if (!confirmed) return;
  try {
    const tx = await contract.requestAccess(currentActionFile.id, { gasLimit: 300000 });
    await customAlert('Transaction sent. Waiting for confirmation...');
    await tx.wait();
    await customAlert('✅ Access request sent! The file owner will be notified.');
  } catch (e) {
    await customAlert('Error: ' + e.message);
  }
});

// Checks for pending View Requests targeting the current user's files
async function checkPendingRequests() {
  if (!contract || !currentAccount) return;
  try {
    const filter = contract.filters.ViewRequested();
    const logs = await contract.queryFilter(filter, 0, 'latest');

    const pendingRequests = [];
    for (const log of logs) {
      const fileId = log.args.id.toNumber();
      const requester = log.args.requester;
      // Check if current user still owns the file and request is still pending
      const fileData = await contract.getFile(fileId);
      const owner = fileData[5];
      if (owner.toLowerCase() !== currentAccount.toLowerCase()) continue;
      const isPending = await contract.viewRequests(fileId, requester);
      if (isPending) {
        pendingRequests.push({ fileId, requester, name: fileData[1] });
      }
    }

    const bell = g('btnRequests');
    const badge = g('requestsBadge');
    if (bell && badge) {
      if (pendingRequests.length > 0) {
        badge.innerText = pendingRequests.length;
        badge.style.display = 'flex';
        bell.onclick = () => showPendingRequestsModal(pendingRequests);
      } else {
        badge.style.display = 'none';
        bell.onclick = () => showPendingRequestsModal([]);
      }
    }
  } catch (e) {
    console.warn('Could not check pending requests:', e.message);
  }
}

async function showPendingRequestsModal(requests) {
  showModal('requestsModal');
  const list = g('requestsList');
  const statBox = g('requestsStatusBox');
  list.innerHTML = '';

  if (requests.length === 0) {
    statBox.style.display = 'block';
    return;
  }
  statBox.style.display = 'none';

  for (const req of requests) {
    const item = document.createElement('div');
    item.className = 'access-item';
    item.style.marginBottom = '12px';

    const info = document.createElement('div');
    const reqDisplay = await resolveAddressDisplay(req.requester);
    info.innerHTML = `<strong style="color:var(--text)">${req.name}</strong><br/><small style="color:var(--muted)">From: ${reqDisplay}</small>`;

    const btnGroup = document.createElement('div');
    btnGroup.style.display = 'flex';
    btnGroup.style.gap = '8px';
    btnGroup.style.flexShrink = '0';

    const approveBtn = document.createElement('button');
    approveBtn.className = 'btn btn-sm';
    approveBtn.style.background = 'var(--accent)';
    approveBtn.style.color = '#fff';
    approveBtn.innerHTML = '<i class="fa-solid fa-check"></i> Approve';
    approveBtn.onclick = async () => {
      approveBtn.disabled = true;
      approveBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
      try {
        const tx = await contract.approveAccessRequest(req.fileId, req.requester);
        await tx.wait();
        item.remove();
        if (list.children.length === 0) statBox.style.display = 'block';
        checkPendingRequests();
      } catch (e) { await customAlert('Error: ' + e.message); approveBtn.disabled = false; approveBtn.innerHTML = '<i class="fa-solid fa-check"></i> Approve'; }
    };

    const denyBtn = document.createElement('button');
    denyBtn.className = 'btn btn-danger btn-sm';
    denyBtn.innerHTML = '<i class="fa-solid fa-x"></i> Deny';
    denyBtn.onclick = async () => {
      denyBtn.disabled = true;
      denyBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
      try {
        const tx = await contract.denyAccessRequest(req.fileId, req.requester);
        await tx.wait();
        item.remove();
        if (list.children.length === 0) statBox.style.display = 'block';
        checkPendingRequests();
      } catch (e) { await customAlert('Error: ' + e.message); denyBtn.disabled = false; denyBtn.innerHTML = '<i class="fa-solid fa-x"></i> Deny'; }
    };

    btnGroup.appendChild(approveBtn);
    btnGroup.appendChild(denyBtn);
    item.appendChild(info);
    item.appendChild(btnGroup);
    list.appendChild(item);
  }
}

// Checks for general notifications targeting the current user
async function checkNotifications() {
  if (!contract || !currentAccount) return;
  try {
    const notifications = [];
    // Currently relying on scanning recent blocks for simplicity. In production, 
    // a backend indexer (The Graph) or a wider block range could be used.
    const fromBlock = -10000; // last 10,000 blocks

    // 1. AccessBought log where you are the owner (someone bought your file)
    let filterBought = contract.filters.AccessBought();
    let logsBought = await contract.queryFilter(filterBought, fromBlock, 'latest');
    for (let log of logsBought) {
      const fileId = log.args.id.toNumber();
      // We need to know who the seller was. We can check the previous Owner by getting FileTransferred
      // emitted alongside AccessBought, or querying the history.
      // For now, let's keep it simple: fetch file data, check history.
      try {
        const hist = await contract.getHistory(fileId);
        // Find if current user was the owner right before this sale
        // This is a naive approach; an indexed seller param in the event would be better.
        // As a workaround, check if current user is in the file history.
        let involved = hist.some(h => h.actor.toLowerCase() === currentAccount.toLowerCase());
        if (involved && log.args.buyer.toLowerCase() !== currentAccount.toLowerCase()) {
          const buyerDisplay = await resolveAddressDisplay(log.args.buyer);
          notifications.push({
            type: 'sale',
            text: `User ${buyerDisplay} bought your file.`,
            time: (await log.getBlock()).timestamp
          });
        }
      } catch (e) { }
    }

    // 2. AccessGranted where target is current account
    let filterGranted = contract.filters.AccessGranted(null, currentAccount);
    let logsGranted = await contract.queryFilter(filterGranted, fromBlock, 'latest');
    for (let log of logsGranted) {
      notifications.push({
        type: 'grant',
        text: `You were granted view access to file #${log.args.id.toNumber()}`,
        time: (await log.getBlock()).timestamp
      });
    }

    // 3. FileTransferred where target is current account
    let filterTransferred = contract.filters.FileTransferred(null, null, currentAccount);
    let logsTransferred = await contract.queryFilter(filterTransferred, fromBlock, 'latest');
    for (let log of logsTransferred) {
      notifications.push({
        type: 'transfer',
        text: `Ownership of file #${log.args.id.toNumber()} was transferred to you.`,
        time: (await log.getBlock()).timestamp
      });
    }

    // Deduplicate and sort by time
    notifications.sort((a, b) => b.time - a.time);

    const bell = g('btnNotifications');
    const badge = g('notificationsBadge');
    if (bell && badge) {
      if (notifications.length > 0) {
        badge.innerText = notifications.length;
        badge.style.display = 'flex';
        bell.onclick = () => showNotificationsModal(notifications);
      } else {
        badge.style.display = 'none';
        bell.onclick = () => showNotificationsModal([]);
      }
    }

  } catch (e) {
    console.warn('Could not check notifications:', e.message);
  }
}

function showNotificationsModal(notifications) {
  showModal('notificationsModal');
  const list = g('notificationsList');
  const statBox = g('notificationsStatusBox');
  list.innerHTML = '';

  if (notifications.length === 0) {
    statBox.style.display = 'block';
    return;
  }
  statBox.style.display = 'none';

  notifications.forEach(notif => {
    const item = document.createElement('div');
    item.className = 'history-item';

    let icon = '<i class="fa-solid fa-bell"></i>';
    if (notif.type === 'sale') icon = '<i class="fa-solid fa-cart-shopping" style="color:#34d399"></i>';
    if (notif.type === 'grant') icon = '<i class="fa-solid fa-eye" style="color:#60a5fa"></i>';
    if (notif.type === 'transfer') icon = '<i class="fa-solid fa-handshake" style="color:#a78bfa"></i>';

    item.innerHTML = `
      <div class="action" style="font-weight:500;">${icon} ${notif.text}</div>
      <div class="time"><i class="fa-solid fa-clock"></i> ${new Date(Number(notif.time) * 1000).toLocaleString()}</div>
    `;
    list.appendChild(item);
  });
}

async function loadActivityLog() {
  if (!contract || !currentAccount) return;
  const logList = g('activityLogList');
  const loader = g('activityLogLoader');
  if (!logList || !loader) return;

  logList.innerHTML = '';
  loader.style.display = 'block';

  try {
    const fromBlock = -10000; // query last ~10,000 blocks
    const events = [];

    // FileAdded by me
    const filterAdded = contract.filters.FileAdded(null, currentAccount);
    const logsAdded = await contract.queryFilter(filterAdded, fromBlock, 'latest');
    for (const log of logsAdded) {
      const blk = await log.getBlock();
      events.push({ icon: 'fa-upload', color: '#a78bfa', text: `Uploaded file: <strong>${log.args.name}</strong>`, time: blk.timestamp });
    }

    // FileRemoved by me - via owner indexed arg
    const filterRemoved = contract.filters.FileRemoved(null, currentAccount);
    const logsRemoved = await contract.queryFilter(filterRemoved, fromBlock, 'latest');
    for (const log of logsRemoved) {
      const blk = await log.getBlock();
      events.push({ icon: 'fa-trash', color: '#ef4444', text: `Deleted file #${log.args.id.toNumber()}`, time: blk.timestamp });
    }

    // Helper wrapper to fetch username or return lowercased address snippet (now using global)

    // FileTransferred FROM me
    const filterTransferFrom = contract.filters.FileTransferred(null, currentAccount, null);
    const logsTransferFrom = await contract.queryFilter(filterTransferFrom, fromBlock, 'latest');
    for (const log of logsTransferFrom) {
      const blk = await log.getBlock();
      const displayName = await resolveAddressDisplay(log.args.to);
      events.push({ icon: 'fa-share', color: '#f59e0b', text: `Transferred file #${log.args.id.toNumber()} to ${displayName}`, time: blk.timestamp });
    }

    // FileTransferred TO me
    const filterTransferTo = contract.filters.FileTransferred(null, null, currentAccount);
    const logsTransferTo = await contract.queryFilter(filterTransferTo, fromBlock, 'latest');
    for (const log of logsTransferTo) {
      const blk = await log.getBlock();
      const displayName = await resolveAddressDisplay(log.args.from);
      events.push({ icon: 'fa-handshake', color: '#34d399', text: `Received file #${log.args.id.toNumber()} from ${displayName}`, time: blk.timestamp });
    }

    // FileTrashed by me
    const filterTrashed = contract.filters.FileTrashed(null, currentAccount);
    const logsTrashed = await contract.queryFilter(filterTrashed, fromBlock, 'latest');
    for (const log of logsTrashed) {
      const blk = await log.getBlock();
      events.push({ icon: 'fa-trash-can', color: '#f59e0b', text: `Moved file #${log.args.id.toNumber()} to Bin`, time: blk.timestamp });
    }

    // FileRestored by me
    const filterRestored = contract.filters.FileRestored(null, currentAccount);
    const logsRestored = await contract.queryFilter(filterRestored, fromBlock, 'latest');
    for (const log of logsRestored) {
      const blk = await log.getBlock();
      events.push({ icon: 'fa-trash-arrow-up', color: '#34d399', text: `Restored file #${log.args.id.toNumber()} from Bin`, time: blk.timestamp });
    }

    // FileStarred by me
    const filterStarred = contract.filters.FileStarred(null, currentAccount);
    const logsStarred = await contract.queryFilter(filterStarred, fromBlock, 'latest');
    for (const log of logsStarred) {
      const blk = await log.getBlock();
      const actionTxt = log.args.isStarred ? 'Starred' : 'Unstarred';
      const iconTxt = log.args.isStarred ? 'fa-star' : 'fa-star-half-stroke';
      events.push({ icon: iconTxt, color: '#eab308', text: `${actionTxt} file #${log.args.id.toNumber()}`, time: blk.timestamp });
    }

    // ViewRequested by me
    const filterRequested = contract.filters.ViewRequested(null, currentAccount);
    const logsRequested = await contract.queryFilter(filterRequested, fromBlock, 'latest');
    for (const log of logsRequested) {
      const blk = await log.getBlock();
      events.push({ icon: 'fa-hand-point-up', color: '#a78bfa', text: `Requested access to file #${log.args.id.toNumber()}`, time: blk.timestamp });
    }

    // AccessGranted to me
    const filterGranted = contract.filters.AccessGranted(null, currentAccount);
    const logsGranted = await contract.queryFilter(filterGranted, fromBlock, 'latest');
    for (const log of logsGranted) {
      const blk = await log.getBlock();
      events.push({ icon: 'fa-key', color: '#34d399', text: `Granted access to file #${log.args.id.toNumber()}`, time: blk.timestamp });
    }

    // AccessRevoked from me
    const filterRevoked = contract.filters.AccessRevoked(null, currentAccount);
    const logsRevoked = await contract.queryFilter(filterRevoked, fromBlock, 'latest');
    for (const log of logsRevoked) {
      const blk = await log.getBlock();
      events.push({ icon: 'fa-lock', color: '#ef4444', text: `Lost access to file #${log.args.id.toNumber()}`, time: blk.timestamp });
    }

    // FileRenamed by me
    const filterRenamed = contract.filters.FileRenamed(null, currentAccount);
    const logsRenamed = await contract.queryFilter(filterRenamed, fromBlock, 'latest');
    for (const log of logsRenamed) {
      const blk = await log.getBlock();
      events.push({ icon: 'fa-pen-to-square', color: '#6366f1', text: `Renamed file #${log.args.id.toNumber()} to <strong>${log.args.newName}</strong>`, time: blk.timestamp });
    }

    // FileMoved by me
    const filterMoved = contract.filters.FileMoved(null, currentAccount);
    const logsMoved = await contract.queryFilter(filterMoved, fromBlock, 'latest');
    for (const log of logsMoved) {
      const blk = await log.getBlock();
      events.push({ icon: 'fa-folder-tree', color: '#8b5cf6', text: `Moved file #${log.args.id.toNumber()} to ${log.args.newFolder} (${log.args.newCategory})`, time: blk.timestamp });
    }

    // AccessBought by me
    const filterBought = contract.filters.AccessBought(null, currentAccount);
    const logsBought = await contract.queryFilter(filterBought, fromBlock, 'latest');
    for (const log of logsBought) {
      const blk = await log.getBlock();
      const ethAmt = ethers.utils.formatEther(log.args.price);
      events.push({ icon: 'fa-cart-shopping', color: '#60a5fa', text: `Purchased file #${log.args.id.toNumber()} for ${ethAmt} ETH`, time: blk.timestamp });
    }

    loader.style.display = 'none';

    if (events.length === 0) {
      logList.innerHTML = '<p style="color:var(--muted); text-align:center; padding:40px;">No activity found in the recent 10,000 blocks.</p>';
      return;
    }

    // Sort newest first
    events.sort((a, b) => b.time - a.time);

    for (const ev of events) {
      const item = document.createElement('div');
      item.className = 'history-item';
      item.innerHTML = `
        <div class="action" style="font-weight:500;"><i class="fa-solid ${ev.icon}" style="color:${ev.color};"></i> ${ev.text}</div>
        <div class="time"><i class="fa-solid fa-clock"></i> ${new Date(Number(ev.time) * 1000).toLocaleString()}</div>
      `;
      logList.appendChild(item);
    }

  } catch (e) {
    loader.style.display = 'none';
    logList.innerHTML = `<p style="color:#ef4444; text-align:center; padding:20px;">Error loading activity: ${e.message}</p>`;
  }
}



// Upload Flow
g('uploadTriggerBtn').addEventListener('click', () => g('fileInput').click());

let selectedFiles = [];

g('fileInput').addEventListener('change', (e) => {
  if (!e.target.files.length) return;
  selectedFiles = Array.from(e.target.files);
  if (selectedFiles.length === 1) {
    g('uploadFileName').innerText = selectedFiles[0].name;
    g('uploadName').value = selectedFiles[0].name;
    g('uploadName').parentElement.style.display = 'block';
  } else {
    g('uploadFileName').innerText = `${selectedFiles.length} files selected`;
    g('uploadName').value = 'Multiple Files';
    g('uploadName').parentElement.style.display = 'none'; // hide single name input
  }
  g('uploadFolder').value = currentFolder;
  g('uploadCategory').value = 'General';
  g('uploadPrice').value = '0';
  g('uploadStatusBox').innerHTML = '';
  showModal('uploadModal');
});

g('confirmUploadBtn').addEventListener('click', async () => {
  if (selectedFiles.length === 0) return;

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
    const names = [];
    const cids = [];
    const sizes = [];
    const mimes = [];
    const hashes = [];
    const categories = Array(selectedFiles.length).fill(category);
    const prices = Array(selectedFiles.length).fill(priceWei);
    const folders = Array(selectedFiles.length).fill(folder);

    for (let i = 0; i < selectedFiles.length; i++) {
      const file = selectedFiles[i];
      stat.innerText = `Processing ${i + 1}/${selectedFiles.length}: ${file.name}...`;

      // 1. Compute Hash
      const hash = await computeContentHash(file);

      // 2. Check duplicates
      const verifyRes = await fetch('/verify/' + hash);
      const verifyData = await verifyRes.json();
      if (verifyData.found) {
        throw new Error(`Duplicate File detected: ${file.name} already exists. Owner: ${verifyData.owner}`);
      }

      // 3. Pin to IPFS
      const data = new FormData();
      data.append('file', file);
      const res = await fetch('/upload', { method: 'POST', body: data });
      const json = await res.json();
      if (json.error) throw new Error(json.error);

      // Populate arrays
      // If single file selected, respect the overridden name input, else use actual file name
      names.push(selectedFiles.length === 1 ? g('uploadName').value : file.name);
      cids.push(json.cid);
      sizes.push(json.size);
      mimes.push(json.mime);
      hashes.push(hash);
    }

    stat.innerText = 'Confirm transaction in MetaMask...';

    // Call batch function instead of single
    const tx = await contract.batchAddFiles(names, cids, sizes, mimes, hashes, categories, prices, folders, { gasLimit: 5000000 });
    stat.innerHTML = `Transaction Sent: <a href="https://sepolia.etherscan.io/tx/${tx.hash}" target="_blank" style="color:var(--accent)">View</a>. Waiting confirmation...`;
    await tx.wait();

    stat.innerText = 'All files successfully uploaded!';
    setTimeout(() => {
      selectedFiles = [];
      closeModal('uploadModal');
      loadCurrentView();
    }, 1500);

  } catch (e) {
    stat.innerHTML = `<span style="color:#ef4444">${e.message}</span>`;
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
    } else if (shareMode === 'transfer') {
      tx = await contract.transferFile(currentActionFile.id, to);
    } else if (shareMode === 'folder_view') {
      // Fetch user files to find all nested under the selected folder
      const res = await fetch('/myfiles/' + currentAccount);
      const data = await res.json();
      const allFiles = data.files || [];

      const idsToShare = [];
      allFiles.forEach(f => {
        const fileFolder = f.folder || '/';
        if (fileFolder === currentActionFolder || fileFolder.startsWith(currentActionFolder + '/')) {
          idsToShare.push(f.id);
        }
      });

      if (idsToShare.length === 0) {
        throw new Error("No physical files found in this folder to share.");
      }

      stat.innerText = `Authorizing ${idsToShare.length} files...`;
      tx = await contract.batchGrantAccess(idsToShare, to);
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
      const actorDisplay = await resolveAddressDisplay(l.actor);
      const div = document.createElement('div');
      div.className = 'history-item';
      div.innerHTML = `
        <div class="actor"><i class="fa-solid fa-address-card"></i> Actor: <span>${actorDisplay}</span></div>
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

    for (const user of activeUsers) {
      const item = document.createElement('div');
      item.className = 'access-item';

      const userDisplay = await resolveAddressDisplay(user);
      const addrSpan = document.createElement('div');
      addrSpan.className = 'address';
      addrSpan.innerHTML = `<i class="fa-solid fa-wallet" style="color:var(--accent); font-size:1.2rem;"></i> <span>${userDisplay}</span>`;

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
    }

  } catch (e) {
    loader.style.display = 'none';
    list.innerHTML = '<p style="color:#ef4444; text-align:center;">Failed to load access list:<br/>' + e.message + '</p>';
  }
}

async function buyFile(id, priceWei) {
  try {
    // Capture the original owner BEFORE the transaction changes ownership
    const fileData = await contract.getFile(id);
    const previousOwner = fileData[5]; // owner is index 5 in the return tuple

    const tx = await contract.buyAccess(id, { value: priceWei });
    await customAlert('Transaction sent. Waiting for confirmation...');
    const receipt = await tx.wait();

    // Extract the new cloned file ID from the AccessBought event
    let newFileId = null;
    const iface = new ethers.utils.Interface(CONTRACT_ABI);
    for (const log of receipt.logs) {
      try {
        const parsedLog = iface.parseLog(log);
        if (parsedLog.name === 'AccessBought') {
          newFileId = parsedLog.args.id.toNumber();
          break;
        }
      } catch (e) {
        // Ignore logs that can't be parsed
      }
    }

    await customAlert('Purchase successful! A copy of this file has been added to your My Files.');

    if (newFileId !== null) {
      // Prompt buyer to share access back to the original creator using the newly minted file
      const shareBack = await customConfirm(
        'Do you want to grant view access of your new copy back to the original creator?\n\nAddress: ' + previousOwner + '\n\nThis is optional but a great way to say thanks!'
      );
      if (shareBack) {
        try {
          const shareTx = await contract.grantAccess(newFileId, previousOwner);
          await shareTx.wait();
          await customAlert('View access granted to the original creator!');
        } catch (shareErr) {
          console.warn('Could not share back access:', shareErr.message);
        }
      }
    }

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
    g('customMediaControls').style.display = 'none';
  } else if (isVideo || isAudio) {
    const media = document.createElement(isVideo ? 'video' : 'audio');
    media.src = url;
    media.controls = false; // Disable default controls
    media.style.maxWidth = '100%';
    media.style.maxHeight = '100%';
    media.style.outline = 'none';
    media.style.transition = 'transform 0.15s ease';
    viewer.appendChild(media);

    // Wire up Custom Controls
    const controls = g('customMediaControls');
    controls.style.display = 'flex';

    const playPauseBtn = g('mediaPlayPause');
    const timeline = g('mediaTimeline');
    const currentTimeEl = g('mediaCurrentTime');
    const durationEl = g('mediaDuration');
    const volumeSlider = g('mediaVolume');
    const muteToggle = g('mediaMuteToggle');
    const speedSelect = g('mediaSpeed');
    const fullscreenBtn = g('mediaFullscreen');

    // Helper to format time
    const formatTime = (secs) => {
      const minutes = Math.floor(secs / 60) || 0;
      const seconds = Math.floor(secs % 60) || 0;
      return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
    };

    // Play/Pause
    const togglePlay = () => {
      if (media.paused) {
        media.play();
        playPauseBtn.innerHTML = '<i class="fa-solid fa-pause" style="font-size:1.2rem;"></i>';
      } else {
        media.pause();
        playPauseBtn.innerHTML = '<i class="fa-solid fa-play" style="font-size:1.2rem;"></i>';
      }
    };
    playPauseBtn.onclick = togglePlay;
    media.onclick = togglePlay; // Click video to play/pause

    // Metadata loaded (duration)
    media.onloadedmetadata = () => {
      durationEl.innerText = formatTime(media.duration);
      timeline.max = media.duration;
    };

    // Time update
    media.ontimeupdate = () => {
      currentTimeEl.innerText = formatTime(media.currentTime);
      timeline.value = media.currentTime;
    };

    // Timeline Drag
    timeline.oninput = () => {
      media.currentTime = timeline.value;
    };

    // Volume
    volumeSlider.oninput = () => {
      media.volume = volumeSlider.value;
      if (media.volume === 0) {
        muteToggle.className = 'fa-solid fa-volume-xmark';
      } else if (media.volume < 0.5) {
        muteToggle.className = 'fa-solid fa-volume-low';
      } else {
        muteToggle.className = 'fa-solid fa-volume-high';
      }
    };

    // Mute Toggle
    muteToggle.onclick = () => {
      if (media.volume > 0) {
        media.dataset.lastVol = media.volume;
        media.volume = 0;
        volumeSlider.value = 0;
        muteToggle.className = 'fa-solid fa-volume-xmark';
      } else {
        const lastVol = media.dataset.lastVol || 1;
        media.volume = lastVol;
        volumeSlider.value = lastVol;
        muteToggle.className = lastVol < 0.5 ? 'fa-solid fa-volume-low' : 'fa-solid fa-volume-high';
      }
    };

    // Playback Speed
    speedSelect.onchange = () => {
      media.playbackRate = parseFloat(speedSelect.value);
    };

    // Fullscreen
    fullscreenBtn.onclick = () => {
      if (viewer.requestFullscreen) {
        viewer.requestFullscreen();
      } else if (viewer.webkitRequestFullscreen) {
        viewer.webkitRequestFullscreen();
      }
    };

    // Auto-play
    media.play().then(() => {
      playPauseBtn.innerHTML = '<i class="fa-solid fa-pause" style="font-size:1.2rem;"></i>';
    }).catch(e => console.log('Autoplay prevented:', e));

    // Hide controls on closeModal
    const origClose = window.closeModal;
    window.closeModal = function (id) {
      if (id === 'previewModal') {
        media.pause();
        controls.style.display = 'none';
      }
      origClose(id);
    };

  } else if (isPdf) {
    g('customMediaControls').style.display = 'none';
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

// Admin Panel Logic
async function loadAdminPanel() {
  if (!contract) return;
  const statusBox = g('adminStatusBox');
  const balEl = g('adminContractBalance');
  statusBox.innerText = '';
  balEl.innerText = 'Loading...';

  const ADMIN_WALLET = '0x6e123606a07d68abed7aa74f0ccff38b72e528f2';
  if (!currentAccount || currentAccount.toLowerCase() !== ADMIN_WALLET) {
    balEl.innerText = 'Access Denied: You are not the contract admin.';
    g('btnAdminUpdatePrices').disabled = true;
    g('btnAdminWithdraw').disabled = true;
    return;
  }
  g('btnAdminUpdatePrices').disabled = false;
  g('btnAdminWithdraw').disabled = false;

  try {
    // Load Prices from contract
    const prem = await contract.premiumPrice();
    const pro = await contract.proPrice();
    const prop = await contract.proPlusPerGB();
    g('adminPremiumPrice').value = ethers.utils.formatEther(prem);
    g('adminProPrice').value = ethers.utils.formatEther(pro);
    g('adminProPlusPrice').value = ethers.utils.formatEther(prop);

    // Load Contract Balance
    const balanceWei = await provider.getBalance(contract.address);
    balEl.innerText = `${ethers.utils.formatEther(balanceWei)} ETH`;
  } catch (e) {
    statusBox.innerText = 'Error loading admin data: ' + e.message;
  }
}

if (g('btnAdminUpdatePrices')) {
  g('btnAdminUpdatePrices').addEventListener('click', async () => {
    const loader = g('adminPriceLoader');
    const box = g('adminStatusBox');
    const btn = g('btnAdminUpdatePrices');
    btn.disabled = true;
    loader.style.display = 'block';
    box.innerText = '';

    try {
      const premVal = g('adminPremiumPrice').value.trim();
      const proVal = g('adminProPrice').value.trim();
      const propVal = g('adminProPlusPrice').value.trim();

      const pWei = ethers.utils.parseEther(premVal || "0");
      const proWei = ethers.utils.parseEther(proVal || "0");
      const propWei = ethers.utils.parseEther(propVal || "0");

      box.innerText = 'Sign transaction...';
      const tx = await contract.setTierPrices(pWei, proWei, propWei);
      box.innerText = 'Waiting for confirmation...';
      await tx.wait();
      box.innerHTML = '<span style="color:#34d399">Prices successfully updated!</span>';
    } catch (e) {
      box.innerText = 'Error: ' + e.message;
    } finally {
      btn.disabled = false;
      loader.style.display = 'none';
      setTimeout(() => box.innerText = '', 5000);
    }
  });
}

if (g('btnAdminWithdraw')) {
  g('btnAdminWithdraw').addEventListener('click', async () => {
    const loader = g('adminWithdrawLoader');
    const box = g('adminStatusBox');
    const btn = g('btnAdminWithdraw');
    btn.disabled = true;
    loader.style.display = 'block';
    box.innerText = '';

    try {
      box.innerText = 'Sign transaction...';
      const tx = await contract.withdrawFunds();
      box.innerText = 'Waiting for confirmation...';
      await tx.wait();
      box.innerHTML = '<span style="color:#34d399">Funds withdrawn successfully!</span>';
      loadAdminPanel(); // refresh local balance
    } catch (e) {
      box.innerText = 'Error: ' + e.message;
    } finally {
      btn.disabled = false;
      loader.style.display = 'none';
      setTimeout(() => box.innerText = '', 5000);
    }
  });
}

// Check admin status using hardcoded admin wallet address
async function checkAdminStatus() {
  const ADMIN_WALLET = '0x6e123606a07d68abed7aa74f0ccff38b72e528f2';
  const isAdmin = currentAccount && currentAccount.toLowerCase() === ADMIN_WALLET;

  const navAdmin = g('navAdminPanel');
  if (navAdmin) navAdmin.style.display = isAdmin ? 'flex' : 'none';
}

// Settings Panel Logic
async function loadSettingsView() {
  if (!contract || !currentAccount) return;

  // Show wallet address
  const walletEl = g('settingsWalletAddress');
  if (walletEl) walletEl.innerText = currentAccount;

  // Show username
  const userEl = g('settingsUsername');
  if (userEl) {
    try {
      const uname = await contract.getUsername(currentAccount);
      userEl.innerText = uname ? `@${uname}` : '(no username)';
    } catch(e) { userEl.innerText = '(error loading username)'; }
  }

  // Show admin block if admin
  const adminBlock = g('settingsAdminBlock');
  if (adminBlock) {
    try {
      const owner = await contract.contractOwner();
      adminBlock.style.display = owner.toLowerCase() === currentAccount.toLowerCase() ? 'block' : 'none';
    } catch(e) { adminBlock.style.display = 'none'; }
  }
}

// Rename Username event
if (g('btnSaveUsername')) {
  g('btnSaveUsername').addEventListener('click', async () => {
    const newName = g('settingsNewUsername').value.trim();
    const statusEl = g('settingsUsernameStatus');
    const loader = g('settingsUsernameLoader');
    const btn = g('btnSaveUsername');

    if (newName.length < 3) { statusEl.innerText = 'Username must be at least 3 characters.'; return; }

    btn.disabled = true;
    loader.style.display = 'block';
    statusEl.innerText = '';

    try {
      // First, try to clear old username if already registered
      const currentUsername = await contract.getUsername(currentAccount);
      if (currentUsername && currentUsername.length > 0) {
        // Call updateUsername (we'll need to add this) or use a two-step approach:
        // Since the contract uses registerUsername with a check for "already registered", 
        // we call a helper. If contract has changeUsername, use it. Otherwise, we must 
        // ask user to note their old name is being replaced.
        if (typeof contract.changeUsername === 'function') {
          statusEl.innerText = 'Updating username...';
          const tx = await contract.changeUsername(newName);
          await tx.wait();
        } else {
          statusEl.innerHTML = '<span style="color:#ef4444;">Username change requires a contract with <code>changeUsername()</code> function. Please contact admin.</span>';
          btn.disabled = false; loader.style.display = 'none'; return;
        }
      } else {
        statusEl.innerText = 'Registering username...';
        const tx = await contract.registerUsername(newName);
        await tx.wait();
      }

      g('accountStatusText').innerHTML = `<span style="color:var(--accent); font-weight:600;">@${newName}</span>`;
      g('settingsUsername').innerText = `@${newName}`;
      g('settingsNewUsername').value = '';
      statusEl.innerHTML = `<span style="color:#34d399;">Username updated to @${newName}!</span>`;
    } catch(e) {
      statusEl.innerText = 'Error: ' + (e.reason || e.message);
    } finally {
      btn.disabled = false;
      loader.style.display = 'none';
    }
  });
}

// Navigate to Admin Panel from Settings
// Navigate to Admin Panel from Settings
window.goToAdminPanel = function() {
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  if (g('navAdminPanel')) g('navAdminPanel').classList.add('active');
  currentView = 'adminpanel';
  g('viewTitle').innerText = 'Admin Panel';
  g('filesGrid').style.display = 'none';
  if (g('breadcrumbsWrapper')) g('breadcrumbsWrapper').style.display = 'none';
  if (g('settingsSection')) g('settingsSection').style.display = 'none';
  if (g('adminPanelSection')) g('adminPanelSection').style.display = 'block';
  loadAdminPanel();
};

// Real-Time Contract Event Listeners + Polling Fallback
let _autoUpdateInterval = null;
let _lastRefreshTime = 0;
const DEBOUNCE_REFRESH_MS = 1500; // min interval between refreshes

function debounceRefresh(label) {
  const now = Date.now();
  if (now - _lastRefreshTime < DEBOUNCE_REFRESH_MS) return;
  _lastRefreshTime = now;
  console.log(`[Auto-Update] Triggered by: ${label}`);
  loadCurrentView();
  updateStorageLimitDisplay();
}

function setupContractListeners() {
  if (!contract) return;

  // Remove existing listeners to avoid duplicates
  contract.removeAllListeners();

  // File events
  contract.on('FileAdded', (id, owner) => {
    if (owner.toLowerCase() === currentAccount?.toLowerCase()) {
      debounceRefresh('FileAdded');
    }
  });

  contract.on('FileRemoved', (id, owner) => {
    if (owner.toLowerCase() === currentAccount?.toLowerCase()) {
      debounceRefresh('FileRemoved');
    }
  });

  contract.on('FileTransferred', (id, from, to) => {
    const acc = currentAccount?.toLowerCase();
    if (from.toLowerCase() === acc || to.toLowerCase() === acc) {
      debounceRefresh('FileTransferred');
    }
  });

  contract.on('AccessGranted', () => debounceRefresh('AccessGranted'));
  contract.on('AccessRevoked', () => debounceRefresh('AccessRevoked'));
  contract.on('PriceChanged', () => debounceRefresh('PriceChanged'));

  contract.on('TierUpgraded', (user) => {
    if (user.toLowerCase() === currentAccount?.toLowerCase()) {
      debounceRefresh('TierUpgraded');
      updateStorageLimitDisplay();
    }
  });

  // Polling fallback — refreshes every 30s for any missed events (e.g. someone shares a file with you)
  if (_autoUpdateInterval) clearInterval(_autoUpdateInterval);
  _autoUpdateInterval = setInterval(() => {
    if (contract && currentAccount) {
      loadCurrentView();
    }
  }, 30000);

  console.log('[Auto-Update] Contract listeners and polling started.');
}

init();
