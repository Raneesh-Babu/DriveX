const axios = require('axios');
const fs = require('fs');
const FormData = require('form-data');

const PINATA_API_KEY = process.env.PINATA_API_KEY;
const PINATA_SECRET_KEY = process.env.PINATA_SECRET_KEY;

if (!PINATA_API_KEY || !PINATA_SECRET_KEY) {
  // will throw at runtime when trying to pin
}

async function pinFileToIPFS(filePath, fileName) {
  if (!PINATA_API_KEY || !PINATA_SECRET_KEY) throw new Error('Pinata creds missing');

  const url = 'https://api.pinata.cloud/pinning/pinFileToIPFS';
  const data = new FormData();
  data.append('file', fs.createReadStream(filePath));
  data.append('pinataMetadata', JSON.stringify({ name: fileName }));

  const res = await axios.post(url, data, {
    maxBodyLength: 'Infinity',
    headers: {
      ...data.getHeaders(),
      pinata_api_key: PINATA_API_KEY,
      pinata_secret_api_key: PINATA_SECRET_KEY,
    },
  });

  return res.data; // contains IpfsHash, PinSize, Timestamp
}

module.exports = { pinFileToIPFS };
