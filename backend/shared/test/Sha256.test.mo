// Unit tests for shared/Sha256.mo. Run with scripts/ci/test-motoko-units.sh.
// Expected digests come from Node's crypto.createHash("sha256").
import Sha256 "../Sha256";
import Text "mo:core/Text";

func rep(s : Text, n : Nat) : Text {
  var out = "";
  var i = 0;
  while (i < n) { out #= s; i += 1 };
  out
};

// FIPS 180-4 examples
assert Sha256.hexOfText("") == "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
assert Sha256.hexOfText("abc") == "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
assert Sha256.hexOfText("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq") == "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1";

// Padding edges: 55 bytes fits one block, 56 and 64 need a second
assert Sha256.hexOfText(rep("a", 55)) == "9f4390f8d30c2dd92ec9f095b65e2b9ae9b0a925a5258e241c9f1e910f734318";
assert Sha256.hexOfText(rep("a", 56)) == "b35439a4ac6f0948b6d6f9e3c6af0f5f590ce20f1bde7090ef7970686ec6738a";
assert Sha256.hexOfText(rep("a", 64)) == "ffe054fe7ae0cb6dc65c3af9b61d5209f439851db43d0ba5997337df154668eb";
assert Sha256.hexOfText(rep("a", 1000)) == "41edece42d63e8d9bf515a9ba6932e1c20cbc9f5a5d134645adb5db1b9737ea3";

// A session-token-shaped input, and multi-byte UTF-8
assert Sha256.hexOfText("hgs_" # rep("0f", 32)) == "89a5369c4d1d473c0c8b70b084ca3be62f3f796670e1a39b2401756639b59a5f";
assert Sha256.hexOfText("héllo ✓") == "5657cdef8a85a584e0e961e6f8247cf5d3f8ed21496ed6fdbcfd43a761e94245";

assert Sha256.digest("abc".encodeUtf8()).size() == 32;
