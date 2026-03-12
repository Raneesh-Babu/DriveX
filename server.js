require('dotenv').config();
const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { pinFileToIPFS } = require('./pinata');
const ethers = require('ethers');

const upload = multer({ dest: 'uploads/' });
const app = express();
app.use(cors());
app.use(express.json());

app.use('/', express.static(path.join(__dirname, 'frontend')));

const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS || '';
const RPC = process.env.SEPOLIA_RPC_URL || '';

let contract = null;
let provider = null;

async function initContract() {
  if (!CONTRACT_ADDRESS || !RPC) return;
  provider = new ethers.providers.JsonRpcProvider(RPC);
  const abi = [
    "event FileAdded(uint256 indexed id, address indexed owner, string cid, string name)",
    "event FileRemoved(uint256 indexed id, address indexed owner)",
    "event FileTransferred(uint256 indexed id, address indexed from, address indexed to)",
    "event AccessBought(uint256 indexed id, address indexed buyer, uint256 price)",
    "event AccessGranted(uint256 indexed id, address indexed to)",
    "event AccessRevoked(uint256 indexed id, address indexed to)",
    "event PriceChanged(uint256 indexed id, uint256 newPrice)",
    "event ViewRequested(uint256 indexed id, address indexed requester)",
    "event FileTrashed(uint256 indexed id, address indexed owner)",
    "event FileRestored(uint256 indexed id, address indexed owner)",
    "event FileStarred(uint256 indexed id, address indexed user, bool isStarred)",
    "event FileRenamed(uint256 indexed id, address indexed owner, string newName)",
    "event FileMoved(uint256 indexed id, address indexed owner, string newFolder, string newCategory)",
    "event UsernameRegistered(address indexed user, string username)",
    "event TierUpgraded(address indexed user, uint8 tier, uint256 storageBytes)",
    "function addFile(string name,string cid,uint256 size,string mime,bytes32 contentHash,string category,uint256 price,string folder) public returns (uint256)",
    "function batchAddFiles(string[] names,string[] cids,uint256[] sizes,string[] mimes,bytes32[] contentHashes,string[] categories,uint256[] prices,string[] folders) public returns (uint256[])",
    "function getFilesByOwner(address owner) public view returns (uint256[])",
    "function getBinnedFiles(address owner) public view returns (uint256[])",
    "function getSharedFiles(address user) public view returns (uint256[])",
    "function getMarketFiles() public view returns (uint256[])",
    "function getFile(uint256 id) public view returns (uint256,string,string,uint256,string,address,uint256,bool,bytes32,string,uint256,string)",
    "function moveFile(uint256 id, string newFolder, string newCategory) public",
    "function hasAccess(uint256 id, address user) public view returns (bool)",
    "function getHistory(uint256 id) public view returns (tuple(address actor, string action, uint256 timestamp)[])",
    "function verifyFileByHash(bytes32 hash) public view returns (bool, uint256, address, string, uint256)",
    "function batchMoveFiles(uint256[] ids, string newFolders, string newCategories) public",
    "function batchRemoveFiles(uint256[] ids) public",
    "function batchTransferFiles(uint256[] ids, address to) public",
    "function toggleStar(uint256 id) public",
    "function getStarredFiles(address user) public view returns (uint256[])",
    "function trashFile(uint256 id) public",
    "function batchTrashFiles(uint256[] ids) public",
    "function restoreFile(uint256 id) public",
    "function batchGrantAccess(uint256[] ids, address to) public",
    "function batchRevokeAccess(uint256[] ids, address user) public",
    "function requestAccess(uint256 id) public",
    "function approveAccessRequest(uint256 id, address requester) public",
    "function denyAccessRequest(uint256 id, address requester) public",
    "function viewRequests(uint256, address) public view returns (bool)",
    "function registerUsername(string username) public",
    "function getUsername(address user) public view returns (string)",
    "function upgradeTier(uint8 tier, uint256 gbAmount) public payable",
    "function getStorageLimitBytes(address user) public view returns (uint256)",
    "function getFileCountLimit(address user) public view returns (uint256)",
    "function storageTier(address) public view returns (uint8)",
    "function premiumPrice() public view returns (uint256)",
    "function proPrice() public view returns (uint256)",
    "function proPlusPerGB() public view returns (uint256)"
  ];
  contract = new ethers.Contract(CONTRACT_ADDRESS, abi, provider);
}

initContract();

app.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'no file' });
    const result = await pinFileToIPFS(req.file.path, req.file.originalname);
    fs.unlink(req.file.path, () => { });

    const ipfsHash = result.IpfsHash;
    const size = result.PinSize || req.file.size || 0;
    const mime = req.file.mimetype || '';

    res.json({ cid: ipfsHash, size, mime });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'upload failed' });
  }
});

app.get('/config', (req, res) => {
  res.json({ contractAddress: CONTRACT_ADDRESS || null });
});

async function fetchFiles(ids) {
  const files = [];
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    const f = await contract.getFile(id);
    let lastModified = f[6].toString();
    let lastAction = "Uploaded";
    try {
      const history = await contract.getHistory(id);
      if (history && history.length > 0) {
        lastModified = history[history.length - 1].timestamp.toString();
        lastAction = history[history.length - 1].action;
      }
    } catch (e) {
      console.warn('Could not fetch history for file', id);
    }

    files.push({
      id: f[0].toString(),
      name: f[1],
      cid: f[2],
      size: f[3].toString(),
      mime: f[4],
      owner: f[5],
      timestamp: f[6].toString(),
      lastModified: lastModified,
      lastAction: lastAction,
      deleted: f[7],
      contentHash: f[8],
      category: f[9],
      price: f[10].toString(),
      folder: f[11] || '/'
    });
  }
  return files;
}

app.get('/myfiles/:owner', async (req, res) => {
  try {
    if (!contract) return res.status(400).json({ error: 'contract not configured' });
    const owner = req.params.owner;
    const ids = await contract.getFilesByOwner(owner);
    const files = await fetchFiles(ids);
    res.json({ files });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'failed to fetch' });
  }
});

app.get('/sharedfiles/:user', async (req, res) => {
  try {
    if (!contract) return res.status(400).json({ error: 'contract not configured' });
    const user = req.params.user;
    const ids = await contract.getSharedFiles(user);
    const files = await fetchFiles(ids);
    res.json({ files });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'failed to fetch' });
  }
});

app.get('/marketfiles', async (req, res) => {
  try {
    if (!contract) return res.status(400).json({ error: 'contract not configured' });
    const ids = await contract.getMarketFiles();
    const files = await fetchFiles(ids);
    res.json({ files });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'failed to fetch' });
  }
});

app.get('/starredfiles/:user', async (req, res) => {
  try {
    if (!contract) return res.status(400).json({ error: 'contract not configured' });
    const user = req.params.user;
    const ids = await contract.getStarredFiles(user);
    const files = await fetchFiles(ids);
    res.json({ files });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'failed to fetch' });
  }
});

app.get('/binnedfiles/:user', async (req, res) => {
  try {
    if (!contract) return res.status(400).json({ error: 'contract not configured' });
    const user = req.params.user;
    const ids = await contract.getBinnedFiles(user);
    const files = await fetchFiles(ids);
    res.json({ files });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'failed to fetch' });
  }
});

app.get('/verify/:hash', async (req, res) => {
  try {
    if (!contract) return res.status(400).json({ error: 'contract not configured' });
    const result = await contract.verifyFileByHash(req.params.hash);
    if (!result[0]) return res.json({ found: false });
    
    // Fetch username for the owner
    const ownerAddress = result[2];
    let username = '';
    try {
      username = await contract.getUsername(ownerAddress);
    } catch (e) { console.warn('Could not fetch username for', ownerAddress); }

    res.json({
      found: true,
      id: result[1].toString(),
      owner: ownerAddress,
      username: username || '',
      category: result[3],
      timestamp: result[4].toString()
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'failed to verify' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Drive app running on http://localhost:${PORT}`));
// Trigger restart 3
