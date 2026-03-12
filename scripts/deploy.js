async function main() {
  const [deployer] = await ethers.getSigners();

  console.log("Deploying contracts with account:", deployer.address);

  const Drive = await ethers.getContractFactory("Drive");
  const drive = await Drive.deploy();
  await drive.deployed();

  const fs = require('fs');
  fs.writeFileSync('deployed_address.txt', drive.address);
  console.log("Drive deployed to:", drive.address);
}

main().then(() => process.exit(0)).catch((error) => {
  console.error(error);
  process.exit(1);
});
