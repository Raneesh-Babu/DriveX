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
    mapping(uint256 => mapping(address => bool)) public starredFiles;
    mapping(uint256 => bool) private binned; // soft-delete: not permanent
    mapping(uint256 => mapping(address => bool)) public viewRequests; // Request to View

    // ============ Account Registry ============
    address public contractOwner;
    mapping(address => string) public usernames;
    mapping(string => address) public usernameToAddress;

    // ============ Storage Tiers ============
    // 0=Free, 1=Premium, 2=Pro, 3=Pro+
    mapping(address => uint8) public storageTier;
    mapping(address => uint256) public customStorageGB; // Only for Pro+ (tier 3)

    // Tier prices in wei per month
    // Free=0, Premium=0.00016 ETH, Pro=0.00023 ETH, Pro+=per GB 0.000091 ETH
    uint256 public premiumPrice  = 0.00016 ether;
    uint256 public proPrice      = 0.00023 ether;
    uint256 public proPlusPerGB  = 0.000091 ether;

    // Tier storage limits in bytes
    uint256 public constant FREE_STORAGE     = 250 * 1024 * 1024;  // 250 MB
    uint256 public constant PREMIUM_STORAGE  = 500 * 1024 * 1024;  // 500 MB
    uint256 public constant PRO_STORAGE      = 1024 * 1024 * 1024; // 1 GB

    // Tier file count limits (type(uint256).max = unlimited)
    uint256 public constant FREE_FILE_LIMIT    = 100;
    uint256 public constant PREMIUM_FILE_LIMIT = 250;
    uint256 public constant PRO_FILE_LIMIT     = 500;

    event FileAdded(uint256 indexed id, address indexed owner, string cid, string name);
    event FileRemoved(uint256 indexed id, address indexed owner);
    event FileTransferred(uint256 indexed id, address indexed from, address indexed to);
    event AccessGranted(uint256 indexed id, address indexed to);
    event AccessRevoked(uint256 indexed id, address indexed to);
    event AccessBought(uint256 indexed id, address indexed buyer, uint256 price);
    event PriceChanged(uint256 indexed id, uint256 newPrice);
    event FileStarred(uint256 indexed id, address indexed user, bool isStarred);
    event FileTrashed(uint256 indexed id, address indexed owner);
    event FileRestored(uint256 indexed id, address indexed owner);
    event ViewRequested(uint256 indexed id, address indexed requester);
    event UsernameRegistered(address indexed user, string username);
    event TierUpgraded(address indexed user, uint8 tier, uint256 storageBytes);
    event FileRenamed(uint256 indexed id, address indexed owner, string newName);
    event FileMoved(uint256 indexed id, address indexed owner, string newFolder, string newCategory);

    constructor() {
        contractOwner = 0x6E123606A07d68ABed7AA74F0cCFF38B72E528F2;
    }

    function _logHistory(uint256 id, string memory action) internal {
        fileHistory[id].push(HistoryLog(msg.sender, action, block.timestamp));
    }

    // ============ Storage Tier Helpers ============

    function getStorageLimitBytes(address user) public view returns (uint256) {
        uint8 tier = storageTier[user];
        if (tier == 1) return PREMIUM_STORAGE;
        if (tier == 2) return PRO_STORAGE;
        if (tier == 3) return customStorageGB[user] * 1024 * 1024 * 1024;
        return FREE_STORAGE;
    }

    function getFileCountLimit(address user) public view returns (uint256) {
        uint8 tier = storageTier[user];
        if (tier == 1) return PREMIUM_FILE_LIMIT;
        if (tier == 2) return PRO_FILE_LIMIT;
        if (tier == 3) return type(uint256).max; // unlimited
        return FREE_FILE_LIMIT;
    }

    function _getOwnerUsedStorage(address owner) internal view returns (uint256 total) {
        for (uint256 i = 0; i < files.length; i++) {
            if (files[i].owner == owner && !binned[i]) {
                total += files[i].size;
            }
        }
    }

    function _getOwnerFileCount(address owner) internal view returns (uint256 count) {
        for (uint256 i = 0; i < files.length; i++) {
            if (files[i].owner == owner && !binned[i]) {
                count++;
            }
        }
    }

    // ============ Account Registry ============

    function registerUsername(string memory username) public {
        require(bytes(username).length >= 3, "Username too short");
        require(bytes(username).length <= 32, "Username too long");
        require(bytes(usernames[msg.sender]).length == 0, "Already registered");
        require(usernameToAddress[username] == address(0), "Username taken");
        usernames[msg.sender] = username;
        usernameToAddress[username] = msg.sender;
        emit UsernameRegistered(msg.sender, username);
    }

    function getUsername(address user) public view returns (string memory) {
        return usernames[user];
    }

    function changeUsername(string memory newUsername) public {
        require(bytes(newUsername).length >= 3, "Username too short");
        require(bytes(newUsername).length <= 32, "Username too long");
        require(usernameToAddress[newUsername] == address(0), "Username taken");

        // Free the old username mapping
        string memory oldUsername = usernames[msg.sender];
        if (bytes(oldUsername).length > 0) {
            delete usernameToAddress[oldUsername];
        }

        usernames[msg.sender] = newUsername;
        usernameToAddress[newUsername] = msg.sender;
        emit UsernameRegistered(msg.sender, newUsername);
    }

    // ============ Storage Tier Upgrade ============

    function upgradeTier(uint8 tier, uint256 gbAmount) public payable {
        require(tier >= 1 && tier <= 3, "Invalid tier");
        if (tier == 1) {
            require(msg.value >= premiumPrice, "Insufficient ETH for Premium");
        } else if (tier == 2) {
            require(msg.value >= proPrice, "Insufficient ETH for Pro");
        } else if (tier == 3) {
            require(gbAmount >= 1, "Must request at least 1 GB for Pro+");
            require(msg.value >= proPlusPerGB * gbAmount, "Insufficient ETH for Pro+");
            customStorageGB[msg.sender] = gbAmount;
        }
        storageTier[msg.sender] = tier;
        emit TierUpgraded(msg.sender, tier, getStorageLimitBytes(msg.sender));
    }

    function setTierPrices(uint256 _premium, uint256 _pro, uint256 _proPlusPerGB) public {
        require(msg.sender == contractOwner, "Not owner");
        premiumPrice = _premium;
        proPrice = _pro;
        proPlusPerGB = _proPlusPerGB;
    }

    function withdrawFunds() public {
        require(msg.sender == contractOwner, "Not owner");
        payable(contractOwner).transfer(address(this).balance);
    }

    // ============ File Upload ============

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
        require(_getOwnerUsedStorage(msg.sender) + size <= getStorageLimitBytes(msg.sender), "Storage limit exceeded");
        require(_getOwnerFileCount(msg.sender) < getFileCountLimit(msg.sender), "File count limit exceeded");
        
        uint256 id = files.length;
        files.push(FileRecord(id, name, cid, size, mime, msg.sender, block.timestamp, contentHash, category, price, folder));
        fileAccess[id][msg.sender] = true; 
        hashExists[contentHash] = true;
        _logHistory(id, "Uploaded");
        emit FileAdded(id, msg.sender, cid, name);
        return id;
    }

    function batchAddFiles(
        string[] memory names,
        string[] memory cids,
        uint256[] memory sizes,
        string[] memory mimes,
        bytes32[] memory contentHashes,
        string[] memory categories,
        uint256[] memory prices,
        string[] memory folders
    ) public returns (uint256[] memory) {
        require(names.length == cids.length, "Array mismatch");
        require(names.length == sizes.length, "Array mismatch");
        require(names.length == mimes.length, "Array mismatch");
        require(names.length == contentHashes.length, "Array mismatch");
        require(names.length == categories.length, "Array mismatch");
        require(names.length == prices.length, "Array mismatch");
        require(names.length == folders.length, "Array mismatch");

        // Pre-check total new size and count against limits
        uint256 totalNewSize = 0;
        for (uint256 i = 0; i < sizes.length; i++) {
            totalNewSize += sizes[i];
        }
        require(
            _getOwnerUsedStorage(msg.sender) + totalNewSize <= getStorageLimitBytes(msg.sender),
            "Storage limit exceeded"
        );
        require(
            _getOwnerFileCount(msg.sender) + names.length <= getFileCountLimit(msg.sender),
            "File count limit exceeded"
        );
        
        uint256[] memory uploadedIds = new uint256[](names.length);

        for(uint256 i = 0; i < names.length; i++) {
            require(!hashExists[contentHashes[i]], "File already uploaded by someone");
            
            uint256 id = files.length;
            files.push(FileRecord(id, names[i], cids[i], sizes[i], mimes[i], msg.sender, block.timestamp, contentHashes[i], categories[i], prices[i], folders[i]));
            fileAccess[id][msg.sender] = true; 
            hashExists[contentHashes[i]] = true;
            _logHistory(id, "Uploaded");
            emit FileAdded(id, msg.sender, cids[i], names[i]);
            
            uploadedIds[i] = id;
        }

        return uploadedIds;
    }

    function getFile(uint256 id) public view returns (
        uint256 _id, string memory name, string memory cid, uint256 size, string memory mime,
        address owner, uint256 timestamp, bool deleted, bytes32 contentHash, string memory category, uint256 price, string memory folder
    ) {
        require(id < files.length, "Invalid id");
        FileRecord storage f = files[id];
        deleted = (f.owner == address(0) || binned[id]);
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
            if (files[i].owner == owner && !binned[i]) {
                count++;
            }
        }
        uint256[] memory result = new uint256[](count);
        uint256 idx = 0;
        for (uint256 i = 0; i < total; i++) {
            if (files[i].owner == owner && !binned[i]) {
                result[idx] = files[i].id;
                idx++;
            }
        }
        return result;
    }

    function getBinnedFiles(address owner) public view returns (uint256[] memory) {
        uint256 total = files.length;
        uint256 count = 0;
        for (uint256 i = 0; i < total; i++) {
            if (files[i].owner == owner && binned[i]) count++;
        }
        uint256[] memory result = new uint256[](count);
        uint256 idx = 0;
        for (uint256 i = 0; i < total; i++) {
            if (files[i].owner == owner && binned[i]) {
                result[idx] = i;
                idx++;
            }
        }
        return result;
    }

    function trashFile(uint256 id) public {
        require(id < files.length, "Invalid id");
        FileRecord storage f = files[id];
        require(f.owner == msg.sender, "Not owner");
        require(!binned[id], "Already in bin");
        binned[id] = true;
        _logHistory(id, "Trashed");
        emit FileTrashed(id, msg.sender);
    }

    function batchTrashFiles(uint256[] memory ids) public {
        for (uint256 i = 0; i < ids.length; i++) {
            uint256 id = ids[i];
            require(id < files.length, "Invalid id");
            FileRecord storage f = files[id];
            require(f.owner == msg.sender, "Not owner");
            if (!binned[id]) {
                binned[id] = true;
                _logHistory(id, "Trashed");
                emit FileTrashed(id, msg.sender);
            }
        }
    }

    function restoreFile(uint256 id) public {
        require(id < files.length, "Invalid id");
        FileRecord storage f = files[id];
        require(f.owner == msg.sender, "Not owner");
        require(binned[id], "Not in bin");
        binned[id] = false;
        _logHistory(id, "Restored");
        emit FileRestored(id, msg.sender);
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

    function toggleStar(uint256 id) public {
        require(id < files.length, "Invalid id");
        bool current = starredFiles[id][msg.sender];
        starredFiles[id][msg.sender] = !current;
        emit FileStarred(id, msg.sender, !current);
    }

    function getStarredFiles(address user) public view returns (uint256[] memory) {
        uint256 total = files.length;
        uint256 count = 0;
        for (uint256 i = 0; i < total; i++) {
            if (starredFiles[i][user] && files[i].owner != address(0)) {
                count++;
            }
        }
        uint256[] memory result = new uint256[](count);
        uint256 idx = 0;
        for (uint256 i = 0; i < total; i++) {
            if (starredFiles[i][user] && files[i].owner != address(0)) {
                result[idx] = i;
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
        hashExists[f.contentHash] = false;
        _logHistory(id, "Deleted");
        emit FileRemoved(id, previous);
    }
    
    function batchRemoveFiles(uint256[] memory ids) public {
        for(uint256 i = 0; i < ids.length; i++) {
            uint256 id = ids[i];
            require(id < files.length, "Invalid id");
            FileRecord storage f = files[id];
            require(f.owner == msg.sender, "Not owner");
            if (f.owner != address(0)) {
                address previous = f.owner;
                f.owner = address(0);
                hashExists[f.contentHash] = false;
                _logHistory(id, "Deleted");
                emit FileRemoved(id, previous);
            }
        }
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

    function batchTransferFiles(uint256[] memory ids, address to) public {
        require(to != address(0), "Invalid recipient");
        for(uint256 i = 0; i < ids.length; i++) {
            uint256 id = ids[i];
            require(id < files.length, "Invalid id");
            FileRecord storage f = files[id];
            require(f.owner == msg.sender, "Not owner");
            address previous = f.owner;
            f.owner = to;
            fileAccess[id][to] = true;
            _logHistory(id, "Transferred ownership");
            emit FileTransferred(id, previous, to);
        }
    }

    function editName(uint256 id, string memory newName) public {
        require(id < files.length, "Invalid id");
        FileRecord storage f = files[id];
        require(f.owner == msg.sender, "Not owner");
        f.name = newName;
        _logHistory(id, "Renamed");
        emit FileRenamed(id, msg.sender, newName);
    }

    function moveFile(uint256 id, string memory newFolder, string memory newCategory) public {
        require(id < files.length, "Invalid id");
        FileRecord storage f = files[id];
        require(f.owner == msg.sender, "Not owner");
        f.folder = newFolder;
        f.category = newCategory;
        _logHistory(id, "Moved / Changed Category");
        emit FileMoved(id, msg.sender, newFolder, newCategory);
    }

    function batchMoveFiles(uint256[] memory ids, string[] memory newFolders, string[] memory newCategories) public {
        require(ids.length == newFolders.length && ids.length == newCategories.length, "Mismatched arrays");
        for(uint256 i = 0; i < ids.length; i++) {
            uint256 id = ids[i];
            require(id < files.length, "Invalid id");
            FileRecord storage f = files[id];
            require(f.owner == msg.sender, "Not owner");
            f.folder = newFolders[i];
            f.category = newCategories[i];
            _logHistory(id, "Moved / Changed Category");
            emit FileMoved(id, msg.sender, newFolders[i], newCategories[i]);
        }
    }

    function setPrice(uint256 id, uint256 newPrice) public {
        require(id < files.length, "Invalid id");
        FileRecord storage f = files[id];
        require(f.owner == msg.sender, "Not owner");
        f.price = newPrice;
        _logHistory(id, "Price Changed");
        emit PriceChanged(id, newPrice);
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

    function batchGrantAccess(uint256[] memory ids, address to) public {
        require(to != address(0), "Invalid address");
        for(uint256 i = 0; i < ids.length; i++) {
            uint256 id = ids[i];
            require(id < files.length, "Invalid id");
            FileRecord storage f = files[id];
            require(f.owner == msg.sender, "Not owner");
            fileAccess[id][to] = true;
            _logHistory(id, "Granted view access");
            emit AccessGranted(id, to);
        }
    }

    function revokeAccess(uint256 id, address user) public {
        require(id < files.length, "Invalid id");
        FileRecord storage f = files[id];
        require(f.owner == msg.sender, "Not owner");
        fileAccess[id][user] = false;
        _logHistory(id, "Revoked view access");
        emit AccessRevoked(id, user);
    }

    function batchRevokeAccess(uint256[] memory ids, address user) public {
        for(uint256 i = 0; i < ids.length; i++) {
            uint256 id = ids[i];
            require(id < files.length, "Invalid id");
            FileRecord storage f = files[id];
            require(f.owner == msg.sender, "Not owner");
            fileAccess[id][user] = false;
            _logHistory(id, "Revoked view access");
            emit AccessRevoked(id, user);
        }
    }

    function buyAccess(uint256 id) public payable {
        require(id < files.length, "Invalid id");
        FileRecord storage originalFile = files[id];
        require(originalFile.owner != address(0), "File deleted");
        require(originalFile.price > 0, "Not for sale");
        require(msg.value >= originalFile.price, "Insufficient payment");
        require(originalFile.owner != msg.sender, "Owner cannot buy");

        address previousOwner = originalFile.owner;

        // Clone the file for the buyer
        uint256 newId = files.length;
        files.push(
            FileRecord(
                newId,
                originalFile.name,
                originalFile.cid,
                originalFile.size,
                originalFile.mime,
                msg.sender,
                block.timestamp,
                originalFile.contentHash,
                originalFile.category,
                0, // Set price to 0 so it's not immediately for sale again
                originalFile.folder // inherit folder
            )
        );

        fileAccess[newId][msg.sender] = true;
        
        payable(previousOwner).transfer(msg.value);
        
        _logHistory(newId, "Purchased Ownership (Cloned)");
        // Add log history for the original to show a sale occurred
        _logHistory(id, "Sold Copy");
        
        emit AccessBought(newId, msg.sender, msg.value);
        emit FileTransferred(newId, previousOwner, msg.sender);
    }

    function requestAccess(uint256 id) public {
        require(id < files.length, "Invalid id");
        FileRecord storage f = files[id];
        require(f.owner != address(0), "File deleted");
        require(f.owner != msg.sender, "Owner cannot request access");
        require(!fileAccess[id][msg.sender], "Already has access");
        require(!viewRequests[id][msg.sender], "Request already pending");
        viewRequests[id][msg.sender] = true;
        emit ViewRequested(id, msg.sender);
    }

    function approveAccessRequest(uint256 id, address requester) public {
        require(id < files.length, "Invalid id");
        FileRecord storage f = files[id];
        require(f.owner == msg.sender, "Not owner");
        require(viewRequests[id][requester], "No pending request");
        viewRequests[id][requester] = false; // clear the request
        fileAccess[id][requester] = true;
        _logHistory(id, "Approved access request");
        emit AccessGranted(id, requester);
    }

    function denyAccessRequest(uint256 id, address requester) public {
        require(id < files.length, "Invalid id");
        require(files[id].owner == msg.sender, "Not owner");
        require(viewRequests[id][requester], "No pending request");
        viewRequests[id][requester] = false;
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
