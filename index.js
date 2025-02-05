var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __await = (this && this.__await) || function (v) { return this instanceof __await ? (this.v = v, this) : new __await(v); }
var __asyncGenerator = (this && this.__asyncGenerator) || function (thisArg, _arguments, generator) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var g = generator.apply(thisArg, _arguments || []), i, q = [];
    return i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function () { return this; }, i;
    function verb(n) { if (g[n]) i[n] = function (v) { return new Promise(function (a, b) { q.push([n, v, a, b]) > 1 || resume(n, v); }); }; }
    function resume(n, v) { try { step(g[n](v)); } catch (e) { settle(q[0][3], e); } }
    function step(r) { r.value instanceof __await ? Promise.resolve(r.value.v).then(fulfill, reject) : settle(q[0][2], r); }
    function fulfill(value) { resume("next", value); }
    function reject(value) { resume("throw", value); }
    function settle(f, v) { if (f(v), q.shift(), q.length) resume(q[0][0], q[0][1]); }
};
var __asyncValues = (this && this.__asyncValues) || function (o) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var m = o[Symbol.asyncIterator], i;
    return m ? m.call(o) : (o = typeof __values === "function" ? __values(o) : o[Symbol.iterator](), i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function () { return this; }, i);
    function verb(n) { i[n] = o[n] && function (v) { return new Promise(function (resolve, reject) { v = o[n](v), settle(resolve, reject, v.done, v.value); }); }; }
    function settle(resolve, reject, d, v) { Promise.resolve(v).then(function(v) { resolve({ value: v, done: d }); }, reject); }
};
// End of compatibility with browsers.
import * as fs from "fs";
import hrtime from "browser-process-hrtime";
import { MerkleTree } from "merkletreejs";
import { sha256 } from "multihashes-sync/sha2";
import { bytes } from 'multiformats';
// utilities for verifying signatures
import * as ethers from "ethers";
import * as formatter from "./formatter.js";
import * as witnessNostr from "./witness_nostr.js";
import * as witnessEth from "./witness_eth.js";
import * as witnessTsa from "./witness_tsa.js";
import * as did from "./did.js";
import crypto from "crypto";
// Currently supported API version.
const apiVersion = "0.3.0";
let VERBOSE = undefined;
// Verification status
const INVALID_VERIFICATION_STATUS = "INVALID";
const VERIFIED_VERIFICATION_STATUS = "VERIFIED";
const ERROR_VERIFICATION_STATUS = "ERROR";
function getElapsedTime(start) {
    const precision = 2; // 2 decimal places
    const elapsed = hrtime(start);
    // elapsed[1] is in nanosecond, so we divide by a billion to get nanosecond
    // to second.
    return (elapsed[0] + elapsed[1] / 1e9).toFixed(precision);
}
const dict2Leaves = (obj) => {
    return Object.keys(obj)
        .sort() // MUST be sorted for deterministic Merkle tree
        .map((key) => {
        if (key === 'file_hash') {
            let val = obj[key].startsWith('1220') ? obj[key].slice(4) : obj[key];
            console.log("Val: ", val);
            return getHashSum(`${key}:${val}`);
        }
        else {
            return getHashSum(`${key}:${obj[key]}`);
        }
    });
};
// const dict2Leaves = (obj) => {
//   let sorted_leaves = Object.keys(obj).sort();
//   return sorted_leaves  // MUST be sorted for deterministic Merkle tree
//     .map((key) => getHashSum(`${key}:${obj[key]}`))
// }
// TODO in the Rust version, you should infer what the hashing algorithm
// and the digest size are from the multihash itself. Instead of assuming that
// it is SHA2-256
function getHashSum(content) {
    // return content === "" ? "" : bytes.toHex(sha256.digest(content).bytes)
    let hash = bytes.toHex(sha256.digest(content).bytes);
    // console.log("Hash with type: ", hash, typeof hash)
    // return content === "" ? "" : bytes.toHex(sha256.digest(content).bytes)
    return hash;
}
function sha256Hasher(data) {
    let result = crypto.createHash('sha256').update(data).digest('hex');
    return result;
}
const getFileHashSum = (filename) => {
    const content = fs.readFileSync(filename);
    return getHashSum(content);
};
function readExportFile(filename) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!fs.existsSync(filename)) {
            formatter.log_red(`ERROR: The file ${filename} does not exist.`);
            process.exit(1);
        }
        const fileContent = fs.readFileSync(filename);
        if (!filename.endsWith(".json")) {
            formatter.log_red("The file must have a .json extension");
            process.exit(1);
        }
        const offlineData = JSON.parse(fileContent);
        if (!("revisions" in offlineData)) {
            formatter.log_red("The json file doesn't contain 'revisions' key.");
            process.exit(1);
        }
        return offlineData;
    });
}
/**
 * Verifies the integrity of the merkle branch.
 * Steps:
 * - Traverses the nodes in the passed merkle branch.
 * - Returns false if the verification hash is not found in the first leaves pair.
 * - Returns false if the merkle branch hashes are inconsistent.
 * @param   {array} merkleBranch Array of merkle nodes.
 * @param   {string} verificationHash
 * @returns {boolean} Whether the merkle integrity is OK.
 */
function verifyMerkleIntegrity(merkleBranch, verificationHash) {
    if (merkleBranch.length === 0) {
        return false;
    }
    let prevSuccessor = null;
    for (const idx in merkleBranch) {
        const node = merkleBranch[idx];
        const leaves = [node.left_leaf, node.right_leaf];
        if (prevSuccessor) {
            if (!leaves.includes(prevSuccessor)) {
                return false;
            }
        }
        else {
            // This means we are at the beginning of the loop.
            if (!leaves.includes(verificationHash)) {
                // In the beginning, either the left or right leaf must match the
                // verification hash.
                return false;
            }
        }
        let calculatedSuccessor;
        if (!node.left_leaf) {
            calculatedSuccessor = node.right_leaf;
        }
        else if (!node.right_leaf) {
            calculatedSuccessor = node.left_leaf;
        }
        else {
            calculatedSuccessor = getHashSum(node.left_leaf + node.right_leaf);
        }
        if (calculatedSuccessor !== node.successor) {
            //console.log("Expected successor", calculatedSuccessor)
            //console.log("Actual successor", node.successor)
            return false;
        }
        prevSuccessor = node.successor;
    }
    return true;
}
/**
 * TODO THIS DOCSTRING IS OUTDATED!
 * Analyses the witnessing steps for a revision of a page and builds a
 * verification log.
 * Steps:
 * - Calls get_witness_data API passing witness event ID.
 * - Writes witness event ID and transaction hash to the log.
 * - Calls function checkEtherScan (see the file checkEtherScan.js) passing
 *   witness network, witness event transaction hash and the actual  witness
 *   event verification hash.
 * - If checkEtherScan returns true, writes to the log that witness is
 *   verified.
 * - Else logs error from the checkEtherScan call.
 * - If doVerifyMerkleProof is set, calls function verifyMerkleIntegrity.
 * - Writes the teturned boolean value from verifyMerkleIntegrity to the
 *   log.
 * - Returns the structured data summary of the witness verification.
 * @param   {int} witness_event_id
 * @param   {string} verificationHash
 * @param   {boolean} doVerifyMerkleProof Flag for do Verify Merkle Proof.
 * @returns {Promise<string>} The verification log.
 */
function verifyWitness(witnessData, verification_hash, doVerifyMerkleProof) {
    return __awaiter(this, void 0, void 0, function* () {
        const result = {
            tx_hash: witnessData.witness_transaction_hash,
            witness_network: witnessData.witness_network,
            result: "",
            error_message: "",
            merkle_root: witnessData.witness_merkle_root,
            witness_timestamp: witnessData.witness_timestamp,
            doVerifyMerkleProof: doVerifyMerkleProof,
            merkle_proof_status: "",
        };
        let isValid;
        if (witnessData.witness_network === "nostr") {
            isValid = yield witnessNostr.verify(witnessData.witness_transaction_hash, witnessData.witness_merkle_root, witnessData.witness_timestamp);
        }
        else if (witnessData.witness_network === "TSA_RFC3161") {
            isValid = yield witnessTsa.verify(witnessData.witness_transaction_hash, witnessData.witness_merkle_root, witnessData.witness_timestamp);
        }
        else {
            // Verify the transaction hash via the Ethereum blockchain
            const _result = yield witnessEth.verify(witnessData.witness_network, witnessData.witness_transaction_hash, witnessData.witness_merkle_root, witnessData.witness_timestamp);
            result.result = _result;
            if (_result !== "true" && _result !== "false") {
                result.error_message = _result;
            }
            isValid = _result === "true";
        }
        result.isValid = isValid;
        // At this point, we know that the witness matches.
        if (doVerifyMerkleProof) {
            // Only verify the witness merkle proof when verifyWitness is successful,
            // because this step is expensive.
            //todo this will improved
            // const merkleProofIsOK = verifyMerkleIntegrity(
            //   JSON.parse(witnessData.witness_merkle_proof),
            //   verification_hash,
            // )
            // result.merkle_proof_status = merkleProofIsOK ? "VALID" : "INVALID"
            // if (!merkleProofIsOK) {
            //   return ["INVALID", result]
            // }
        }
        return [isValid ? "VALID" : "INVALID", result];
    });
}
const verifySignature = (data, verificationHash) => __awaiter(void 0, void 0, void 0, function* () {
    // TODO enforce that the verificationHash is a correct SHA3 sum string
    // Specify signature correctness
    let signatureOk = false;
    if (verificationHash === "") {
        // The verificationHash MUST NOT be empty. This also implies that a genesis revision cannot
        // contain a signature.
        return [signatureOk, "INVALID"];
    }
    // Signature verification
    switch (data.signature_type) {
        case "did:key":
            signatureOk = yield did.signature.verify(data.signature, data.signature_public_key, verificationHash);
            break;
        case "ethereum:eip-191":
            // The padded message is required
            const paddedMessage = `I sign the following page verification_hash: [0x${verificationHash}]`;
            try {
                const recoveredAddress = ethers.recoverAddress(ethers.hashMessage(paddedMessage), data.signature);
                signatureOk =
                    recoveredAddress.toLowerCase() ===
                        data.signature_wallet_address.toLowerCase();
            }
            catch (e) {
                // continue regardless of error
            }
            break;
    }
    const status = signatureOk ? "VALID" : "INVALID";
    return [signatureOk, status];
});
function verifyRevisionMerkleTreeStructure(input, result, verificationHash) {
    let ok = true;
    // Ensure mandatory claims are present
    const mandatory = {
        content: ["content"],
        file_hash: ["file_hash"],
        link: ["link_verification_hash"],
        signature: ["signature"],
        witness: ["witness_merkle_root"],
    }[input.revision_type];
    const mandatoryClaims = ["previous_verification_hash", "local_timestamp", "nonce", ...mandatory];
    for (const claim of mandatoryClaims) {
        if (!(claim in input)) {
            return [false, { error_message: `mandatory field ${claim} is not present` }];
        }
    }
    const leaves = input.leaves;
    delete input.leaves;
    const actualLeaves = [];
    // Verify leaves
    for (const [i, claim] of Object.keys(input).sort().entries()) {
        // const actual = getHashSum(`${claim}:${input[claim]}`)
        let inputClaim = input[claim];
        if (claim === 'file_hash') {
            inputClaim = inputClaim.startsWith('1220') ? inputClaim.slice(4) : inputClaim;
        }
        console.log(` ========== ${claim}:${inputClaim} =======`);
        const actual = getHashSum(`${claim}:${inputClaim}`);
        console.log("Actual ==> " + actual);
        console.log("in chain ==> " + leaves[i]);
        console.log("\n\n");
        const claimOk = leaves[i] === actual;
        result.status[claim] = claimOk;
        ok = ok && claimOk;
        actualLeaves.push(actual);
    }
    // Verify verification hash
    // const tree = new MerkleTree(leaves, getHashSum)
    // Clean up leaves by removing "1220" prefix if present
    const cleanedLeaves = actualLeaves.map(leaf => typeof leaf === 'string' && leaf.startsWith('1220')
        ? leaf.slice(4) // Remove first 4 characters ("1220")
        : leaf);
    // const tree = new MerkleTree(cleanedLeaves, getHashSum)
    const tree = new MerkleTree(cleanedLeaves, sha256Hasher, {
        duplicateOdd: false,
    });
    const hexRoot = tree.getHexRoot();
    const cleanedHexRoot = hexRoot; //hexRoot.startsWith('0x') ? hexRoot.replace('0x', '0x1220') : hexRoot
    console.log("one ... hex root ", cleanedHexRoot);
    console.log("two ... verificationHash ", verificationHash);
    const vhOk = cleanedHexRoot === verificationHash;
    console.log("three vhok ", vhOk, " ... ok ", ok);
    ok = ok && vhOk;
    console.log("four... ok ", ok);
    return [ok, result];
}
/**
 * TODO THIS DOCSTRING IS OUTDATED!
 * Verifies a revision from a page.
 * Steps:
 * - Calls verify_page API passing revision id.
 * - Calls function verifyWitness using data from the verify_page API call.
 * - Calculates the verification hash using content hash,
 *   signature hash and witness hash.
 * - If the calculated verification hash is different from the verification
 *   hash returned from the first verify_page API calls then logs a hash
 *   mismatch error, else sets verification status to VERIFIED.
 * - Does lookup on the Ethereum blockchain to find the witness_verification hash for digital timestamping
 *   stored in a smart contract to verify.
 * - If the recovered Address equals the current wallet address, sets valid
 *   signature to true.
 * - If witness status is inconsistent, sets witnessOk flag to false.
 * @param   {string} apiURL The URL for the API call.
 * @param   {Object} token The OAuth2 token required to make the API call or PKC must allow any request (LocalSettings.php).
 * @param   {string} revid The page revision id.
 * @param   {string} prevRevId The previous page revision id.
 * @param   {string} previousVerificationHash The previous verification hash string.
 * @param   {string} contentHash The page content hash string.
 * @param   {boolean} doVerifyMerkleProof Flag for do Verify Merkle Proof.
 * @returns {Promise<Array>} An array containing verification data,
 *                  verification-is-correct flag, and an array of page revision
 *                  details.
 */
function verifyRevision(verificationHash, input, doVerifyMerkleProof, aquaObject) {
    return __awaiter(this, void 0, void 0, function* () {
        console.log("INPUT: ", input);
        let ok = true;
        // We use fast scalar verification if input does not have leaves property
        const isScalar = !input.hasOwnProperty('leaves');
        console.log("input  ", input);
        console.log("aquaObject ", aquaObject);
        console.log("is scalar ", isScalar);
        let result = {
            scalar: false,
            verification_hash: verificationHash,
            status: {
                verification: INVALID_VERIFICATION_STATUS,
                type_ok: false,
            },
            witness_result: {},
            file_hash: "",
            data: input,
            revision_type: input.revision_type,
        };
        if (isScalar) {
            result.scalar = true;
            const actualVH = "0x" + getHashSum(JSON.stringify(input));
            ok = actualVH === verificationHash;
        }
        else {
            [ok, result] = verifyRevisionMerkleTreeStructure(input, result, verificationHash);
            if (!ok) {
                return [ok, result];
            }
        }
        let typeOk, _;
        switch (input.revision_type) {
            case "content":
                typeOk = true;
                break;
            case "file_hash":
                const fileHash = getFileHashSum(aquaObject.file_index[input.file_hash]);
                console.log(`Found file hash: ${fileHash}, Original file hash: ${input.file_hash}`);
                typeOk = fileHash === input.file_hash;
                break;
            case "signature":
                // Verify signature
                [typeOk, _] = yield verifySignature(input, input.previous_verification_hash);
                break;
            case "witness":
                // Verify witness
                const [witnessStatus, witnessResult] = yield verifyWitness(input, input.previous_verification_hash, doVerifyMerkleProof);
                result.witness_result = witnessResult;
                // Specify witness correctness
                typeOk = (witnessStatus === "VALID");
                break;
            case "link":
                const offlineData = yield readExportFile(input.link_uri);
                let linkStatus;
                [linkStatus, _] = yield verifyPage(offlineData, false, doVerifyMerkleProof);
                typeOk = (linkStatus === VERIFIED_VERIFICATION_STATUS);
                break;
        }
        result.status.type_ok = typeOk ? "valid" : "invalid";
        result.status.verification = ok ? VERIFIED_VERIFICATION_STATUS : INVALID_VERIFICATION_STATUS;
        return [ok, result];
    });
}
function calculateStatus(count, totalLength) {
    if (count == totalLength) {
        if (count === 0) {
            return "NORECORD";
        }
        else {
            return VERIFIED_VERIFICATION_STATUS;
        }
    }
    else {
        return INVALID_VERIFICATION_STATUS;
    }
}
/**
 * TODO THIS DOCSTRING IS OUTDATED!
 * Verifies all of the verified revisions of a page.
 * Steps:
 * - Loops through the revision IDs for the page.
 *   Calls function verifyRevision, if isCorrect flag is returned as true,
 *   yield true and the revision detail.
 * @param   {Array} verifiedRevIds Array of revision ids which have verification detail.
 * @param   {string} server The server URL for the API call.
 * @param   {boolean} verbose
 * @param   {boolean} doVerifyMerkleProof The flag for whether to do rigorous
 *                    verification of the merkle proof. TODO clarify this.
 * @param   {Object} token (Optional) The OAuth2 token required to make the API call.
 * @returns {Generator} Generator for isCorrect boolean and detail object of
 *                      each revisions.
 */
let seenRevisions = [];
function generateVerifyPage(verificationHashes, aquaObject, verbose, doVerifyMerkleProof) {
    return __asyncGenerator(this, arguments, function* generateVerifyPage_1() {
        VERBOSE = verbose;
        let elapsed;
        let totalElapsed = 0.0;
        for (const vh of verificationHashes) {
            if (seenRevisions.length > 0) {
                let exists = seenRevisions.find(item => item === vh);
                if (exists !== undefined) {
                    console.log("Exiting circular loop");
                    yield yield __await((null, {}));
                    return yield __await(void 0);
                }
            }
            seenRevisions.push(vh);
            const elapsedStart = hrtime();
            const [isCorrect, detail] = yield __await(verifyRevision(vh, aquaObject.revisions[vh], doVerifyMerkleProof, aquaObject));
            elapsed = getElapsedTime(elapsedStart);
            detail.elapsed = elapsed;
            totalElapsed += elapsed;
            if (!isCorrect) {
                yield yield __await([false, detail]);
                return yield __await(void 0);
            }
            yield yield __await([true, detail]);
        }
    });
}
function verifyPage(input, verbose, doVerifyMerkleProof) {
    var _a, e_1, _b, _c;
    return __awaiter(this, void 0, void 0, function* () {
        let verificationHashes;
        verificationHashes = Object.keys(input.revisions);
        console.log("Page Verification Hashes: ", verificationHashes);
        let verificationStatus;
        // Secure feature to detect detached chain, missing genesis revision
        const firstRevision = input.revisions[verificationHashes[verificationHashes.length - 1]];
        if (!firstRevision.previous_verification_hash === "") {
            verificationStatus = INVALID_VERIFICATION_STATUS;
            console.log(`Status: ${verificationStatus}`);
            return [verificationStatus, null];
        }
        let count = 0;
        if (verificationHashes.length > 0) {
            // Print out the verification hash of the first one.
            console.log(`${count + 1}. Verification of Revision ${verificationHashes[0]}`);
        }
        const details = {
            verification_hashes: verificationHashes,
            revision_details: [],
        };
        try {
            for (var _d = true, _e = __asyncValues(generateVerifyPage(verificationHashes, input, verbose, doVerifyMerkleProof)), _f; _f = yield _e.next(), _a = _f.done, !_a; _d = true) {
                _c = _f.value;
                _d = false;
                const value = _c;
                const [isCorrect, detail] = value;
                if (isCorrect === null) {
                    console.log("Exiting loop 1.");
                    process.exit(1);
                }
                formatter.printRevisionInfo(detail, verbose);
                details.revision_details.unshift(detail);
                if (!isCorrect) {
                    verificationStatus = INVALID_VERIFICATION_STATUS;
                    break;
                }
                count += 1;
                console.log(`  Progress: ${count} / ${verificationHashes.length} (${((100 * count) /
                    verificationHashes.length).toFixed(1)}%)`);
                if (count < verificationHashes.length) {
                    console.log(`${count + 1}. Verification of Revision ${verificationHashes[count]}`);
                }
            }
        }
        catch (e_1_1) { e_1 = { error: e_1_1 }; }
        finally {
            try {
                if (!_d && !_a && (_b = _e.return)) yield _b.call(_e);
            }
            finally { if (e_1) throw e_1.error; }
        }
        verificationStatus = calculateStatus(count, verificationHashes.length);
        console.log(`Status: ${verificationStatus}`);
        return [verificationStatus, details];
    });
}
function getServerInfo(server) {
    return __awaiter(this, void 0, void 0, function* () {
        const url = `${server}/rest.php/data_accounting/get_server_info`;
        return fetch(url);
    });
}
function checkAPIVersionCompatibility(server) {
    return __awaiter(this, void 0, void 0, function* () {
        const response = yield getServerInfo(server);
        if (!response.ok) {
            return [formatHTTPError(response), false, ""];
        }
        const data = yield response.json();
        if (data && data.api_version) {
            return ["FOUND", data.api_version === apiVersion, data.api_version];
        }
        return ["API endpoint found, but API version can't be retrieved", false, ""];
    });
}
export { generateVerifyPage, verifyPage, apiVersion, 
// For verified_import.js
ERROR_VERIFICATION_STATUS, 
// For notarize.js
dict2Leaves, getHashSum, sha256Hasher, getFileHashSum, 
// For the VerifyPage Chrome extension and CLI
formatter, checkAPIVersionCompatibility, readExportFile, };
