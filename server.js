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
    "function addFile(string name,string cid,uint256 size,string mime,bytes32 contentHash,string category,uint256 price,string folder) public returns (uint256)",
    "function getFilesByOwner(address owner) public view returns (uint256[])",
    "function getSharedFiles(address user) public view returns (uint256[])",
    "function getMarketFiles() public view returns (uint256[])",
    "function getFile(uint256 id) public view returns (uint256,string,string,uint256,string,address,uint256,bool,bytes32,string,uint256,string)",
    "function moveFile(uint256 id, string newFolder, string newCategory) public",
    "function hasAccess(uint256 id, address user) public view returns (bool)",
    "function getHistory(uint256 id) public view returns (tuple(address actor, string action, uint256 timestamp)[])",
    "function verifyFileByHash(bytes32 hash) public view returns (bool, uint256, address, string, uint256)"
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

app.get('/verify/:hash', async (req, res) => {
  try {
    if (!contract) return res.status(400).json({ error: 'contract not configured' });
    const result = await contract.verifyFileByHash(req.params.hash);
    if (!result[0]) return res.json({ found: false });
    res.json({
      found: true,
      id: result[1].toString(),
      owner: result[2],
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
