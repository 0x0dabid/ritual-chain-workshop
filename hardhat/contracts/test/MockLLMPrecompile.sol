// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract MockLLMPrecompile {
    struct ConvoHistory {
        string storageType;
        string path;
        string secretsName;
    }

    fallback(bytes calldata input) external returns (bytes memory) {
        bytes memory completion = bytes('{"winnerIndex":0,"summary":"ok"}');
        bytes memory actualOutput = abi.encode(
            false,
            completion,
            bytes(""),
            "",
            ConvoHistory("", "", "")
        );

        return abi.encode(input, actualOutput);
    }
}
