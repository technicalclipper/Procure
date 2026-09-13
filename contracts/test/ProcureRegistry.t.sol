// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ProcureRegistry} from "../src/ProcureRegistry.sol";

contract MockUSDC {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 a) external {
        balanceOf[to] += a;
    }

    function approve(address s, uint256 a) external returns (bool) {
        allowance[msg.sender][s] = a;
        return true;
    }

    function transferFrom(address f, address t, uint256 a) external returns (bool) {
        require(allowance[f][msg.sender] >= a, "allowance");
        require(balanceOf[f] >= a, "balance");
        allowance[f][msg.sender] -= a;
        balanceOf[f] -= a;
        balanceOf[t] += a;
        return true;
    }
}

/**
 * The reverts are the product. A test suite that only proved payment
 * works would be testing the easy half — what matters is that every way
 * of paying something nobody approved fails.
 */
contract ProcureRegistryTest is Test {
    ProcureRegistry reg;
    MockUSDC usdc;

    bytes32 constant ORG = keccak256("acme");
    bytes32 constant PO = keccak256("PO-0001");
    bytes32 constant MATCH = keccak256("match");

    address treasury = address(0xA11CE);
    address vendor = address(0xBEEF);

    uint256 aliceKey = 0xA1;
    uint256 bobKey = 0xB0B;
    uint256 malloryKey = 0xBAD;
    address alice;
    address bob;
    address mallory;

    function setUp() public {
        usdc = new MockUSDC();
        reg = new ProcureRegistry(address(usdc));

        alice = vm.addr(aliceKey);
        bob = vm.addr(bobKey);
        mallory = vm.addr(malloryKey);

        usdc.mint(treasury, 1_000_000e6);
        vm.prank(treasury);
        usdc.approve(address(reg), type(uint256).max);

        vm.startPrank(treasury);
        reg.registerOrg(ORG);
        address[] memory approvers = new address[](2);
        approvers[0] = alice;
        approvers[1] = bob;
        reg.setApprovers(ORG, 1, approvers, 2);
        reg.setVendorAllowed(ORG, vendor, true);
        reg.setBudget(ORG, 10_000e6);
        reg.commitOrder(ORG, PO, vendor, 5_000e6, MATCH);
        vm.stopPrank();
    }

    function _sign(uint256 key, uint256 amount, uint256 nonce) internal view returns (bytes memory) {
        bytes32 digest = reg.approvalDigest(PO, 1, amount, nonce);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, digest);
        return abi.encodePacked(r, s, v);
    }

    /// Signatures must be sorted by recovered address — sort the keys so
    /// the tests exercise the real calling convention.
    function _both(uint256 amount, uint256 nonce) internal view returns (bytes[] memory sigs) {
        sigs = new bytes[](2);
        if (alice < bob) {
            sigs[0] = _sign(aliceKey, amount, nonce);
            sigs[1] = _sign(bobKey, amount, nonce);
        } else {
            sigs[0] = _sign(bobKey, amount, nonce);
            sigs[1] = _sign(aliceKey, amount, nonce);
        }
    }

    /* ── the happy path ── */

    function test_paysWhenQuorumSigns() public {
        reg.executePayment(ORG, PO, 1, 1, _both(5_000e6, 1));
        assertEq(usdc.balanceOf(vendor), 5_000e6);
        assertEq(reg.budget(ORG), 5_000e6, "budget decremented");
    }

    /* ── the reverts that matter ── */

    function test_revertsBelowThreshold() public {
        bytes[] memory one = new bytes[](1);
        one[0] = _sign(aliceKey, 5_000e6, 1);
        vm.expectRevert(abi.encodeWithSelector(ProcureRegistry.BelowThreshold.selector, 1, 2));
        reg.executePayment(ORG, PO, 1, 1, one);
        assertEq(usdc.balanceOf(vendor), 0);
    }

    function test_revertsOnStranger() public {
        bytes[] memory sigs = new bytes[](2);
        // Mallory is not an approver, however valid her signature is.
        if (alice < mallory) {
            sigs[0] = _sign(aliceKey, 5_000e6, 1);
            sigs[1] = _sign(malloryKey, 5_000e6, 1);
        } else {
            sigs[0] = _sign(malloryKey, 5_000e6, 1);
            sigs[1] = _sign(aliceKey, 5_000e6, 1);
        }
        vm.expectRevert(abi.encodeWithSelector(ProcureRegistry.NotAnApprover.selector, mallory));
        reg.executePayment(ORG, PO, 1, 1, sigs);
    }

    function test_revertsWhenSameApproverSignsTwice() public {
        bytes[] memory twice = new bytes[](2);
        twice[0] = _sign(aliceKey, 5_000e6, 1);
        twice[1] = _sign(aliceKey, 5_000e6, 1);
        vm.expectRevert(ProcureRegistry.SignaturesUnsorted.selector);
        reg.executePayment(ORG, PO, 1, 1, twice);
    }

    /// A signature approving $5,000 must not pay $50,000. The amount is
    /// inside the signed struct and read from the committed order, so the
    /// digest simply doesn't match.
    function test_signatureForOtherAmountDoesNotPay() public {
        bytes[] memory _s = _both(50_000e6, 1);
        vm.expectRevert();
        reg.executePayment(ORG, PO, 1, 1, _s);
    }

    function test_revertsOnReplay() public {
        reg.executePayment(ORG, PO, 1, 1, _both(5_000e6, 1));
        bytes[] memory _s = _both(5_000e6, 1);
        vm.expectRevert(ProcureRegistry.OrderAlreadyPaid.selector);
        reg.executePayment(ORG, PO, 1, 1, _s);
        assertEq(usdc.balanceOf(vendor), 5_000e6, "paid exactly once");
    }

    function test_revertsWhenVendorBlockedAfterOrdering() public {
        vm.prank(treasury);
        reg.setVendorAllowed(ORG, vendor, false);
        bytes[] memory _s = _both(5_000e6, 1);
        vm.expectRevert(ProcureRegistry.VendorNotAllowed.selector);
        reg.executePayment(ORG, PO, 1, 1, _s);
    }

    function test_revertsBeyondBudget() public {
        vm.prank(treasury);
        reg.setBudget(ORG, 100e6);
        bytes[] memory _s = _both(5_000e6, 1);
        vm.expectRevert(ProcureRegistry.BudgetExceeded.selector);
        reg.executePayment(ORG, PO, 1, 1, _s);
    }

    function test_revertsOnUncommittedOrder() public {
        bytes[] memory _s = _both(5_000e6, 1);
        vm.expectRevert(ProcureRegistry.OrderUnknown.selector);
        reg.executePayment(ORG, keccak256("PO-9999"), 1, 1, _s);
    }

    /* ── authority ── */

    function test_onlyAdminCanRegisterApprovers() public {
        address[] memory self = new address[](1);
        self[0] = mallory;
        vm.prank(mallory);
        vm.expectRevert(ProcureRegistry.NotAdmin.selector);
        reg.setApprovers(ORG, 1, self, 1);
    }

    function test_orgCannotBeTakenOver() public {
        vm.prank(mallory);
        vm.expectRevert(ProcureRegistry.AlreadyRegistered.selector);
        reg.registerOrg(ORG);
    }

    function test_revokedApproverNoLongerCounts() public {
        vm.prank(treasury);
        reg.revokeApprover(ORG, 1, bob);
        bytes[] memory _s = _both(5_000e6, 1);
        vm.expectRevert(abi.encodeWithSelector(ProcureRegistry.NotAnApprover.selector, bob));
        reg.executePayment(ORG, PO, 1, 1, _s);
    }

    /// An org that never configured approvers must not be payable by
    /// anyone. threshold 0 satisfying `valid >= need` with an empty
    /// signature array is the difference between a control and a hole.
    function test_unconfiguredLevelPaysNobody() public {
        bytes32 org2 = keccak256("unconfigured");
        vm.startPrank(treasury);
        reg.registerOrg(org2);
        reg.setVendorAllowed(org2, vendor, true);
        reg.setBudget(org2, 10_000e6);
        reg.commitOrder(org2, keccak256("PO-X"), vendor, 1_000e6, MATCH);
        vm.stopPrank();

        bytes[] memory none = new bytes[](0);
        vm.expectRevert(ProcureRegistry.NoApproverSet.selector);
        reg.executePayment(org2, keccak256("PO-X"), 1, 1, none);
        assertEq(usdc.balanceOf(vendor), 0, "nothing moved");
    }

    /// Malleability: every signature has a twin with s flipped. Accepting
    /// both would let one approval look like two.
    function test_rejectsMalleableSignature() public {
        bytes memory sig = _sign(aliceKey, 5_000e6, 1);
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := mload(add(sig, 32))
            s := mload(add(sig, 64))
            v := byte(0, mload(add(sig, 96)))
        }
        uint256 N = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141;
        bytes memory flipped = abi.encodePacked(r, bytes32(N - uint256(s)), v == 27 ? uint8(28) : uint8(27));
        bytes[] memory sigs = new bytes[](1);
        sigs[0] = flipped;
        vm.expectRevert(ProcureRegistry.BadSignature.selector);
        reg.executePayment(ORG, PO, 1, 1, sigs);
    }
}
