# Drive App (blockchain-file-locker/drive-app)

This is a minimal "drive-like" app that pins files to Pinata (IPFS) and records metadata on-chain (Sepolia).

Quick start:

1. Copy `.env.example` to `.env` and fill the values (Infura/Alchemy RPC, PRIVATE_KEY, Pinata keys).
2. Install dependencies:

   npm install

3. Compile contract:

   npm run compile

4. Deploy contract to Sepolia:

   npm run deploy

   Save the deployed contract address in `.env` as CONTRACT_ADDRESS.

5. Start the server (it serves a very small frontend):

   npm start

6. Open http://localhost:3000 and try uploading files.

Notes:
- The server pins files to Pinata and, if `PRIVATE_KEY` and `CONTRACT_ADDRESS` are configured, will call the contract's `addFile` function to record the file metadata.
- The frontend uses the server endpoints; it's intentionally simple and meant as a starting point.
