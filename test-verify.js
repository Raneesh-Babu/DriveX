const hash = process.argv[2];
fetch(`http://localhost:3000/verify/${hash}`)
  .then(res => res.json())
  .then(data => console.log(data))
  .catch(console.error);
