// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

contract Drive {
    struct FileRecord {
        uint256 id;
        string name;
        string cid; // IPFS hash
        uint256 size;
        string mime;
        address owner;
        uint256 timestamp;
        bytes32 contentHash;
        string category;
        uint256 price;
        string folder; // New folder property
    }
    
    struct HistoryLog {
        address actor;
        string action;
        uint256 timestamp;
    }

    FileRecord[] private files;
    mapping(uint256 => HistoryLog[]) private fileHistory;
    mapping(uint256 => mapping(address => bool)) private fileAccess;
    mapping(bytes32 => bool) public hashExists;

    event FileAdded(uint256 indexed id, address indexed owner, string cid, string name);
    event FileRemoved(uint256 indexed id, address indexed owner);
    event FileTransferred(uint256 indexed id, address indexed from, address indexed to);
    event AccessGranted(uint256 indexed id, address indexed to);
    event AccessRevoked(uint256 indexed id, address indexed to);
    event AccessBought(uint256 indexed id, address indexed buyer, uint256 price);

    function _logHistory(uint256 id, string memory action) internal {
        fileHistory[id].push(HistoryLog(msg.sender, action, block.timestamp));
    }

    function addFile(
        string memory name,
        string memory cid,
        uint256 size,
        string memory mime,
        bytes32 contentHash,
        string memory category,
        uint256 price,
        string memory folder
    ) public returns (uint256) {
        require(!hashExists[contentHash], "File already uploaded by someone");
        
        uint256 id = files.length;
        files.push(FileRecord(id, name, cid, size, mime, msg.sender, block.timestamp, contentHash, category, price, folder));
        fileAccess[id][msg.sender] = true; 
        hashExists[contentHash] = true;
        _logHistory(id, "Uploaded");
        emit FileAdded(id, msg.sender, cid, name);
        return id;
    }

    function getFile(uint256 id) public view returns (
        uint256 _id, string memory name, string memory cid, uint256 size, string memory mime,
        address owner, uint256 timestamp, bool deleted, bytes32 contentHash, string memory category, uint256 price, string memory folder
    ) {
        require(id < files.length, "Invalid id");
        FileRecord storage f = files[id];
        deleted = (f.owner == address(0));
        return (f.id, f.name, f.cid, f.size, f.mime, f.owner, f.timestamp, deleted, f.contentHash, f.category, f.price, f.folder);
    }

    function hasAccess(uint256 id, address user) public view returns (bool) {
        if(id >= files.length) return false;
        FileRecord storage f = files[id];
        if(f.owner == user) return true;
        if(f.owner == address(0)) return false; // deleted
        return fileAccess[id][user];
    }

    function getFilesByOwner(address owner) public view returns (uint256[] memory) {
        uint256 total = files.length;
        uint256 count = 0;
        for (uint256 i = 0; i < total; i++) {
            if (files[i].owner == owner) {
                count++;
            }
        }
        uint256[] memory result = new uint256[](count);
        uint256 idx = 0;
        for (uint256 i = 0; i < total; i++) {
            if (files[i].owner == owner) {
                result[idx] = files[i].id;
                idx++;
            }
        }
        return result;
    }

    function getSharedFiles(address user) public view returns (uint256[] memory) {
        uint256 total = files.length;
        uint256 count = 0;
        for (uint256 i = 0; i < total; i++) {
            if (files[i].owner != user && fileAccess[i][user] && files[i].owner != address(0)) {
                count++;
            }
        }
        uint256[] memory result = new uint256[](count);
        uint256 idx = 0;
        for (uint256 i = 0; i < total; i++) {
            if (files[i].owner != user && fileAccess[i][user] && files[i].owner != address(0)) {
                result[idx] = files[i].id;
                idx++;
            }
        }
        return result;
    }

    function getMarketFiles() public view returns (uint256[] memory) {
        uint256 total = files.length;
        uint256 count = 0;
        for (uint256 i = 0; i < total; i++) {
            if (files[i].price > 0 && files[i].owner != address(0)) {
                count++;
            }
        }
        uint256[] memory result = new uint256[](count);
        uint256 idx = 0;
        for (uint256 i = 0; i < total; i++) {
            if (files[i].price > 0 && files[i].owner != address(0)) {
                result[idx] = files[i].id;
                idx++;
            }
        }
        return result;
    }

    function totalFiles() public view returns (uint256) {
        return files.length;
    }

    function removeFile(uint256 id) public {
        require(id < files.length, "Invalid id");
        FileRecord storage f = files[id];
        require(f.owner == msg.sender, "Not owner");
        require(f.owner != address(0), "Already removed");
        address previous = f.owner;
        f.owner = address(0);
        _logHistory(id, "Deleted");
        emit FileRemoved(id, previous);
    }

    function transferFile(uint256 id, address to) public {
        require(id < files.length, "Invalid id");
        require(to != address(0), "Invalid recipient");
        FileRecord storage f = files[id];
        require(f.owner == msg.sender, "Not owner");
        address previous = f.owner;
        f.owner = to;
        fileAccess[id][to] = true;
        _logHistory(id, "Transferred ownership");
        emit FileTransferred(id, previous, to);
    }

    function editName(uint256 id, string memory newName) public {
        require(id < files.length, "Invalid id");
        FileRecord storage f = files[id];
        require(f.owner == msg.sender, "Not owner");
        f.name = newName;
        _logHistory(id, "Renamed");
    }

    function moveFile(uint256 id, string memory newFolder, string memory newCategory) public {
        require(id < files.length, "Invalid id");
        FileRecord storage f = files[id];
        require(f.owner == msg.sender, "Not owner");
        f.folder = newFolder;
        f.category = newCategory;
        _logHistory(id, "Moved / Changed Category");
    }

    function grantAccess(uint256 id, address to) public {
        require(id < files.length, "Invalid id");
        FileRecord storage f = files[id];
        require(f.owner == msg.sender, "Not owner");
        require(to != address(0), "Invalid address");
        fileAccess[id][to] = true;
        _logHistory(id, "Granted view access");
        emit AccessGranted(id, to);
    }

    function revokeAccess(uint256 id, address user) public {
        require(id < files.length, "Invalid id");
        FileRecord storage f = files[id];
        require(f.owner == msg.sender, "Not owner");
        fileAccess[id][user] = false;
        _logHistory(id, "Revoked view access");
        emit AccessRevoked(id, user);
    }

    function buyAccess(uint256 id) public payable {
        require(id < files.length, "Invalid id");
        FileRecord storage f = files[id];
        require(f.owner != address(0), "File deleted");
        require(f.price > 0, "Not for sale");
        require(msg.value >= f.price, "Insufficient payment");
        require(f.owner != msg.sender, "Owner cannot buy");
        require(!fileAccess[id][msg.sender], "Already have access");

        fileAccess[id][msg.sender] = true;
        
        payable(f.owner).transfer(msg.value);
        
        _logHistory(id, "Access purchased");
        emit AccessBought(id, msg.sender, msg.value);
    }

    function getHistory(uint256 id) public view returns (HistoryLog[] memory) {
        return fileHistory[id];
    }
    
    function verifyFileByHash(bytes32 hash) public view returns (bool found, uint256 id, address owner, string memory category, uint256 timestamp) {
        for(uint256 i = 0; i < files.length; i++) {
            if(files[i].contentHash == hash && files[i].owner != address(0)) {
                return (true, files[i].id, files[i].owner, files[i].category, files[i].timestamp);
            }
        }
        return (false, 0, address(0), "", 0);
    }
}
