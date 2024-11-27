<p align="center">
<img src="Erwin_icon.png" alt="erwin" width="200"/>
</p>

## Detected Bugs

1. https://github.com/ethereum/solidity/issues/14719 (medium impact, confirmed, fixed, type) ✅
2. https://github.com/ethereum/solidity/issues/14720 (duplicate of 14719)
3. https://github.com/ethereum/solidity/issues/15223 (error handling) ✅
4. https://github.com/ethereum/solidity/issues/15236 (a probable duplicate, confirmed, fixed, type) ✅❌
5. https://github.com/ethereum/solidity/issues/15219 (low effort, low impact, confirmed) ✅
6. https://github.com/ethereum/solidity/issues/15468 (low effort, low impact, confirmed, a probable duplicate) ✅
7. https://github.com/ethereum/solidity/issues/15469 (smt) ✅
8. https://github.com/ethereum/solidity/issues/15483 (not a bug, but a workaround)
9. https://github.com/ethereum/solidity/issues/15525 (documentation error, workaround) ✅
10. https://github.com/ethereum/solidity/issues/15483 (documentation error) ✅
11. https://github.com/ethereum/solidity/issues/15565 (wait for confirmation, error handling)
12. https://github.com/ethereum/solidity/issues/15564 (wait for confirmation, error handling)
13. https://github.com/ethereum/solidity/issues/15567 (wait for comfirmation, error handling)
14. https://github.com/ethereum/solidity/pull/15566 (wait for confirmation, documentation error)
15. https://github.com/ethereum/solidity/issues/15583 (wait for confirmation)

## Weird Language Features

Besides bugs, Erwin only plays a role of examining the design of language features. Until now, Erwin has found the following features that may be confusing to Solidity users.

1. Solidity has a weird type inference on `int_const`, `int`, and `uint`. Many intuitive operations on int literals and (u)int variables are forbidden.
   ```solidity
    int8 var21;
    false ? var21 : 62;
   ```
   The second line raises an type error:  `TypeError: True expression's type int8 does not match false expression's type uint8.`.

## TODO

- [ ] :hammer: Rebuild getter function generations.
- [ ] :hammer: Finish test script that test all compilation flags.
- [ ] :hammer: When generating identifiers, Erwin currently collects vardecls from variable declarations. But some available vardecls may hide in mappings/arrays/struct instances returned by functions. Consider them also.
- [ ] :hammer: Support strings.
- [ ] :hammer: Support byte and bytes (similar to array).
- [ ] :hammer: Support Event and Error.
- [ ] :hammer: Support contract inheritance.