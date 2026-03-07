/* app.js */
// Helpers
function g(id) { return document.getElementById(id); }
function showModal(id) { g(id).classList.add('active'); }
function closeModal(id) { g(id).classList.remove('active'); }

// State
let currentAccount = null;
let currentView = 'myfiles';
let currentFolder = '/';
let currentCategoryFilter = 'All';
let currentSearchQuery = '';
let virtualFolders = [];
let contractAddress = null;
let provider = null;
let signer = null;
let contract = null;
let selectedFile = null;
let currentActionFile = null;
let shareMode = 'view';
let currentZoom = 1;

// WalletConnect provider instance (mobile Chrome connection)
let wcProvider = null;

// WalletConnect Project ID
const WC_PROJECT_ID = '7c2f28c5c7f8ec07d0dd0aa8f2c9a739';
const SEPOLIA_CHAIN_ID = 11155111;

const CONTRACT_ABI = [
  "function addFile(string name,string cid,uint256 size,string mime,bytes32 contentHash,string category,uint256 price,string folder) public returns (uint256)",
  "function getFilesByOwner(address owner) public view returns (uint256[])",
  "function getSharedFiles(address user) public view returns (uint256[])",
  "function getMarketFiles() public view returns (uint256[])",
  "function getFile(uint256 id) public view returns (uint256,string,string,uint256,string,address,uint256,bool,bytes32,string,uint256,string)",
  "function moveFile(uint256 id, string newFolder, string newCategory) public",
  "function removeFile(uint256 id) public",
  "function transferFile(uint256 id, address to) public",
  "function hasAccess(uint256 id, address user) public view returns (bool)",
  "function getHistory(uint256 id) public view returns (tuple(address actor, string action, uint256 timestamp)[])",
  "function grantAccess(uint256 id, address to) public",
  "function revokeAccess(uint256 id, address user) public",
  "function buyAccess(uint256 id) public payable",
  "function verifyFileByHash(bytes32 hash) public view returns (bool, uint256, address, string, uint256)",
  "event AccessGranted(uint256 indexed id, address indexed to)",
  "event AccessBought(uint256 indexed id, address indexed buyer, uint256 price)",
  "event AccessRevoked(uint256 indexed id, address indexed to)"
];

async function init() {
  try {
    const res = await fetch('/config');
    const json = await res.json();
    contractAddress = json.contractAddress;

    g('publicVerifyInput').addEventListener('change', async (e) => {
      if (!e.target.files.length) return;
      await runPublicVerification(e.target.files[0]);
    });

    // Auto-reconnect: desktop extension
    if (window.ethereum) {
      const accounts = await window.ethereum.request({ method: 'eth_accounts' }).catch(() => []);
      if (accounts && accounts.length > 0) {
        await setupWallet(accounts[0], new ethers.providers.Web3Provider(window.ethereum));
        return;
      }
    }

    // Auto-reconnect: WalletConnect (if a previous WC session exists)
    try {
      const EthProvider = resolveWCProvider();
      if (EthProvider) {
        const wc = await EthProvider.init(wcConfig());
        if (wc.session) { // existing session
          wcProvider = wc;
          const accounts = wc.accounts;
          if (accounts && accounts.length > 0) {
            await setupWallet(accounts[0], new ethers.providers.Web3Provider(wc));
          }
        }
      }
    } catch (_) { /* no previous WC session */ }

  } catch (err) {
    console.error('Initialization error:', err);
  }
}

// Resolve the WalletConnect EthereumProvider class from its UMD global
function resolveWCProvider() {
  const mod = window.WalletConnectEthereumProvider;
  if (!mod) return null;
  // UMD bundle may export: { EthereumProvider } | { default: EthereumProvider } | the class itself
  return mod.EthereumProvider || mod.default?.EthereumProvider || mod.default || (typeof mod === 'function' ? mod : null);
}

// Shared WalletConnect configuration
function wcConfig() {
  return {
    projectId: WC_PROJECT_ID,
    chains: [SEPOLIA_CHAIN_ID],
    optionalChains: [SEPOLIA_CHAIN_ID],
    showQrModal: true,
    rpcMap: { [SEPOLIA_CHAIN_ID]: 'https://rpc.sepolia.org' },
    metadata: {
      name: 'DriveX',
      description: 'Decentralized Blockchain File Storage',
      url: window.location.origin,
      icons: ['https://upload.wikimedia.org/wikipedia/commons/3/36/MetaMask_Fox.svg'],
    },
  };
}

// Connect via WalletConnect (mobile Chrome flow)
async function connectWalletConnect() {
  const EthProvider = resolveWCProvider();
  if (!EthProvider) {
    alert('WalletConnect library failed to load. Please refresh and try again.');
    return;
  }
  try {
    g('loginLoader').style.display = 'block';
    wcProvider = await EthProvider.init(wcConfig());

    // .connect() opens the QR modal; on mobile MetaMask shows a deep-link button
    await wcProvider.connect({
      chains: [SEPOLIA_CHAIN_ID],
    });

    const accounts = wcProvider.accounts;
    if (!accounts || accounts.length === 0) throw new Error('No accounts returned.');

    // Switch to Sepolia inside WC session if needed
    try {
      const chainId = await wcProvider.request({ method: 'eth_chainId' });
      if (parseInt(chainId, 16) !== SEPOLIA_CHAIN_ID) {
        await wcProvider.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: '0xaa36a7' }],
        });
      }
    } catch (_) { }

    await setupWallet(accounts[0], new ethers.providers.Web3Provider(wcProvider));
  } catch (e) {
    if (wcProvider) { try { await wcProvider.disconnect(); } catch (_) { } wcProvider = null; }
    if (!e.message?.includes('User rejected') && e.code !== 4001) {
      alert('WalletConnect error: ' + e.message);
    }
  } finally {
    g('loginLoader').style.display = 'none';
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
  g('accountStatus').innerText = account.slice(0, 6) + '...' + account.slice(-4);

  loadCurrentView();
}

g('loginConnectBtn').addEventListener('click', async () => {
  if (!window.ethereum) {
    // Mobile Chrome / no extension: use WalletConnect QR modal
    await connectWalletConnect();
    return;
  }
  // Desktop MetaMask extension
  try {
    g('loginLoader').style.display = 'block';
    await window.ethereum.request({ method: 'eth_requestAccounts' });
    try {
      const chainId = await window.ethereum.request({ method: 'eth_chainId' });
      if (chainId !== '0xaa36a7') {
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
    if (e.code !== 4001) alert('Connection error: ' + e.message);
  } finally {
    g('loginLoader').style.display = 'none';
  }
});

g('signoutBtn').addEventListener('click', async () => {
  currentAccount = null;
  provider = null;
  signer = null;
  contract = null;
  virtualFolders = [];
  g('searchInput').value = '';
  currentSearchQuery = '';
  g('categoryFilter').value = 'All';
  currentCategoryFilter = 'All';

  // Disconnect WalletConnect session if active
  if (wcProvider) {
    try { await wcProvider.disconnect(); } catch (_) { }
    wcProvider = null;
  }

  g('publicScreen').classList.remove('hidden');
  g('appLayout').style.display = 'none';
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

g('createFolderBtn').addEventListener('click', () => {
  const name = prompt("Enter new folder name:");
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
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    el.classList.add('active');
    currentView = el.getAttribute('data-view');
    currentFolder = '/';
    const titles = { 'myfiles': 'My Files', 'sharedfiles': 'Shared With Me', 'marketfiles': 'Marketplace' };
    g('viewTitle').innerText = titles[currentView];

    // Clear search/filter on navigation change
    g('searchInput').value = ''; currentSearchQuery = '';
    g('categoryFilter').value = 'All'; currentCategoryFilter = 'All';
    loadCurrentView();
  });
});

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
    syncCategories(data.files || []); // Generate filter lists
    renderArchitecture(data.files || []);
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
  if (bc.lastChild) bc.removeChild(bc.lastChild);
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

    if (isSearchActive) {
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

  // 2. Add purely virtual folders logic if no search is active
  if (!isSearchActive) {
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

  // Render Folders First (skip if searching)
  if (!isSearchActive) {
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
      thumb.innerHTML = `<i class="fa-solid fa-file-pdf" style="color: #ef4444;"></i><span class="file-ext">PDF</span>`;
    } else {
      thumb.innerHTML = `<i class="fa-solid fa-file"></i><span class="file-ext">${ext}</span>`;
    }

    thumb.onclick = (e) => { e.stopPropagation(); openPreview(f.cid, f.name); };

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

g('ctxDownload').addEventListener('click', () => {
  const url = `https://gateway.pinata.cloud/ipfs/${currentActionFile.cid}`;
  window.open(url, '_blank');
});

g('ctxVerify').addEventListener('click', () => {
  alert(`Please download the file first, then drag it into the "Public Verification Tool" on the landing page to verify its integrity.\n\nOn-Chain Hash Signature: ${currentActionFile.contentHash}`);
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

g('ctxDelete').addEventListener('click', () => {
  g('deleteTargetName').innerText = currentActionFile.name;
  g('deleteStatusBox').innerText = '';
  showModal('deleteModal');
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
  if (!to || !ethers.utils.isAddress(to)) return alert('Invalid address');

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
        if (!confirm('Revoke access for ' + user + '?')) return;
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
          alert('Error revoking access: ' + e.message);
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
    alert('Transaction sent. Please wait for confirmation.');
    await tx.wait();
    alert('Purchase successful! Item is now in "Shared with Me"');
    loadCurrentView();
  } catch (e) { alert(e.message); }
}

function openPreview(cid, name) {
  const url = `https://gateway.pinata.cloud/ipfs/${cid}`;
  g('previewTitle').innerText = name;
  g('previewDownload').href = url;

  // Reset zoom on open
  currentZoom = 1;
  applyZoom();

  const viewer = g('previewViewer');
  viewer.innerHTML = `<div class="loader" style="border-top-color:#a78bfa;"></div>`;

  const iframe = document.createElement('iframe');

  viewer.innerHTML = '';

  const fallbackDiv = document.createElement('div');
  fallbackDiv.style.position = 'absolute';
  fallbackDiv.style.display = 'flex';
  fallbackDiv.style.flexDirection = 'column';
  fallbackDiv.style.alignItems = 'center';
  fallbackDiv.style.gap = '16px';
  fallbackDiv.style.padding = '20px';
  fallbackDiv.innerHTML = `
    <i class="fa-solid fa-file-shield" style="font-size:3rem; color:var(--muted)"></i>
    <p style="text-align:center; color:var(--muted);">For security, some files cannot be previewed natively in the browser frame.</p>
    <a href="${url}" target="_blank" class="btn btn-primary"><i class="fa-solid fa-up-right-from-square"></i> Open securely in new tab</a>
  `;

  iframe.src = url;
  iframe.style.position = 'relative';
  iframe.style.zIndex = '10';
  iframe.style.backgroundColor = '#fff';

  viewer.style.position = 'relative';
  viewer.style.overflow = 'auto'; // allow scrolling when zoomed

  viewer.appendChild(fallbackDiv);
  viewer.appendChild(iframe);

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
    if (child.tagName === 'IMG' || child.tagName === 'IFRAME') {
      child.style.transform = `scale(${currentZoom})`;
      child.style.transformOrigin = 'center center';
      child.style.transition = 'transform 0.15s ease';
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

init();
