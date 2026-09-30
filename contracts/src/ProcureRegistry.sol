// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * ProcureRegistry — spend authority for onchain procurement.
 *
 * The claim this contract exists to make true: an invoice that doesn't
 * match its purchase order cannot be paid, and a payment nobody approved
 * cannot happen — not by policy, by construction.
 *
 * Approvers sign off-chain (EIP-712) and this verifies on-chain at the
 * moment money moves. The alternative — one transaction per approval —
 * would mean funding every approver's wallet with USDC before they could
 * act, since Arc charges gas in USDC. Signing is free; the chain still
 * does the enforcing. It's what a cheque is: you sign at your desk, the
 * bank verifies at the counter.
 *
 * What this can and cannot know, stated plainly: it cannot verify that
 * goods arrived or that an invoice is genuine. Those are assertions the
 * approvers sign *about*. What it enforces is that the approvers this
 * org registered, in sufficient number, signed for exactly this payee
 * and exactly this amount against exactly this order, once, within
 * budget, to a vendor that passed screening.
 */
interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

contract ProcureRegistry {
    /* ─────────────────────────── types ─────────────────────────── */

    struct Order {
        address payee;
        uint256 amount;
        bytes32 matchHash; // commits to the PO/GRN/invoice triple
        bool paid;
        bool exists;
    }

    /* ────────────────────────── storage ────────────────────────── */

    IERC20 public immutable usdc;

    /// Org admin — the org's own treasury wallet, not ours. If we could
    /// write the approver set we could add ourselves to it, and every
    /// guarantee below would be theatre.
    mapping(bytes32 => address) public orgAdmin;

    /// org => level => address => is an approver
    mapping(bytes32 => mapping(uint8 => mapping(address => bool))) public isApprover;

    /// org => level => how many distinct approvers must sign
    mapping(bytes32 => mapping(uint8 => uint8)) public threshold;

    /// org => vendor payout address => cleared by risk screening
    mapping(bytes32 => mapping(address => bool)) public vendorAllowed;

    /// org => remaining budget in USDC base units. Decremented on payment,
    /// so the ceiling is enforced here rather than trusted from the app.
    mapping(bytes32 => uint256) public budget;

    /// Orders committed at issue time, keyed by their hash.
    mapping(bytes32 => Order) public orders;

    bytes32 public immutable DOMAIN_SEPARATOR;

    bytes32 private constant APPROVAL_TYPEHASH =
        keccak256("Approval(bytes32 poHash,uint8 level,uint256 amount,uint256 nonce)");

    /* ─────────────────────────── events ────────────────────────── */

    event OrgRegistered(bytes32 indexed org, address indexed admin);
    event ApproversSet(bytes32 indexed org, uint8 level, address[] approvers, uint8 threshold);
    event VendorAllowed(bytes32 indexed org, address indexed payee, bool allowed);
    event BudgetSet(bytes32 indexed org, uint256 amount);
    event OrderCommitted(bytes32 indexed org, bytes32 indexed poHash, address payee, uint256 amount);
    event PaymentExecuted(
        bytes32 indexed org, bytes32 indexed poHash, address indexed payee, uint256 amount, uint8 approvals
    );

    /* ─────────────────────────── errors ────────────────────────── */

    error NotAdmin();
    error AlreadyRegistered();
    error OrderUnknown();
    error OrderAlreadyPaid();
    error VendorNotAllowed();
    error BudgetExceeded();
    error NotAnApprover(address signer);
    error SignaturesUnsorted();
    error BelowThreshold(uint8 got, uint8 need);
    error NoApproverSet();
    error BadSignature();

    constructor(address _usdc) {
        usdc = IERC20(_usdc);
        DOMAIN_SEPARATOR = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256("Procure"),
                keccak256("1"),
                block.chainid,
                address(this)
            )
        );
    }

    modifier onlyAdmin(bytes32 org) {
        if (msg.sender != orgAdmin[org]) revert NotAdmin();
        _;
    }

    /* ────────────────────────── admin ──────────────────────────── */

    /// Claim an org id. First caller wins and becomes its admin; there is
    /// no way to reassign, so a compromised server cannot take an org over.
    function registerOrg(bytes32 org) external {
        if (orgAdmin[org] != address(0)) revert AlreadyRegistered();
        orgAdmin[org] = msg.sender;
        emit OrgRegistered(org, msg.sender);
    }

    /// Replace the approver set for a level wholesale. Wholesale rather
    /// than incremental so the on-chain set always equals what the admin
    /// last saw — an add/remove API drifts from the UI the moment one
    /// call fails.
    function setApprovers(bytes32 org, uint8 level, address[] calldata approvers, uint8 required)
        external
        onlyAdmin(org)
    {
        for (uint256 i = 0; i < approvers.length; i++) {
            isApprover[org][level][approvers[i]] = true;
        }
        threshold[org][level] = required;
        emit ApproversSet(org, level, approvers, required);
    }

    function revokeApprover(bytes32 org, uint8 level, address approver) external onlyAdmin(org) {
        isApprover[org][level][approver] = false;
        emit ApproversSet(org, level, new address[](0), threshold[org][level]);
    }

    /// Gated on risk screening upstream. A blocked vendor's address never
    /// gets here, so the screening stops being advice and starts being a
    /// rule the chain keeps.
    function setVendorAllowed(bytes32 org, address payee, bool allowed) external onlyAdmin(org) {
        vendorAllowed[org][payee] = allowed;
        emit VendorAllowed(org, payee, allowed);
    }

    function setBudget(bytes32 org, uint256 amount) external onlyAdmin(org) {
        budget[org] = amount;
        emit BudgetSet(org, amount);
    }

    /// Fix the terms at issue time, before anyone approves. Approving one
    /// thing and paying another is impossible if the terms were committed
    /// first and the signature covers them.
    function commitOrder(bytes32 org, bytes32 poHash, address payee, uint256 amount, bytes32 matchHash)
        external
        onlyAdmin(org)
    {
        orders[poHash] = Order({payee: payee, amount: amount, matchHash: matchHash, paid: false, exists: true});
        emit OrderCommitted(org, poHash, payee, amount);
    }

    /* ───────────────────────── payment ─────────────────────────── */

    /**
     * Pay a vendor, if and only if every condition holds.
     *
     * Signatures must arrive sorted by recovered address, strictly
     * ascending. That is how the same signature is stopped from being
     * counted twice to fake a quorum — cheaper than a seen-set, and the
     * caller can always sort.
     */
    function executePayment(
        bytes32 org,
        bytes32 poHash,
        uint8 level,
        uint256 nonce,
        bytes[] calldata signatures
    ) external {
        Order storage o = orders[poHash];
        if (!o.exists) revert OrderUnknown();
        if (o.paid) revert OrderAlreadyPaid();
        if (!vendorAllowed[org][o.payee]) revert VendorNotAllowed();
        if (o.amount > budget[org]) revert BudgetExceeded();

        bytes32 digest = keccak256(
            abi.encodePacked(
                "\x19\x01",
                DOMAIN_SEPARATOR,
                keccak256(abi.encode(APPROVAL_TYPEHASH, poHash, level, o.amount, nonce))
            )
        );

        address last = address(0);
        uint8 valid = 0;
        for (uint256 i = 0; i < signatures.length; i++) {
            address signer = _recover(digest, signatures[i]);
            if (signer <= last) revert SignaturesUnsorted();
            if (!isApprover[org][level][signer]) revert NotAnApprover(signer);
            last = signer;
            valid++;
        }

        uint8 need = threshold[org][level];
        // An unconfigured level must not be a permissive one. Without
        // this, threshold 0 makes `valid >= need` true for an empty
        // signature array, and an org that never set up approvers could
        // be drained by anyone who could call this. Default-open is the
        // wrong default for spend authority.
        if (need == 0) revert NoApproverSet();
        if (valid < need) revert BelowThreshold(valid, need);

        // Effects before interaction — paid and budget are written before
        // the transfer, so a reentrant callee finds the order settled.
        o.paid = true;
        budget[org] -= o.amount;

        usdc.transferFrom(orgAdmin[org], o.payee, o.amount);

        emit PaymentExecuted(org, poHash, o.payee, o.amount, valid);
    }

    /// What a payment would cost against the digest an approver signs.
    /// Lets the app show the exact bytes before asking for a signature.
    function approvalDigest(bytes32 poHash, uint8 level, uint256 amount, uint256 nonce)
        external
        view
        returns (bytes32)
    {
        return keccak256(
            abi.encodePacked(
                "\x19\x01", DOMAIN_SEPARATOR, keccak256(abi.encode(APPROVAL_TYPEHASH, poHash, level, amount, nonce))
            )
        );
    }

    function _recover(bytes32 digest, bytes calldata sig) private pure returns (address) {
        if (sig.length != 65) revert BadSignature();
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := calldataload(sig.offset)
            s := calldataload(add(sig.offset, 32))
            v := byte(0, calldataload(add(sig.offset, 64)))
        }
        if (v < 27) v += 27;
        // Reject the high-s half of the curve: every signature has a
        // malleable twin, and accepting both would let the same approval
        // appear as two distinct-looking signatures.
        if (uint256(s) > 0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0) {
            revert BadSignature();
        }
        address signer = ecrecover(digest, v, r, s);
        if (signer == address(0)) revert BadSignature();
        return signer;
    }
}
